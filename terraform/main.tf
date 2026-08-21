# govbuy — infrastructure (ADR-0001/0002/0005/0006). Datasets + least-privilege IAM + the sibling
# authorized-view grant + GCS archive + Cloud Run (API). Scheduler: GitHub Actions cron, keyless
# via Workload Identity Federation (ADR-0006, supersedes the operator-hosted ADR-0005). Tables are
# created by `sql/schema.sql` (the contract), not duplicated here. (For the working session the
# datasets were bootstrapped via `bq`; this is the reproducible IaC.)

terraform {
  required_version = ">= 1.5"
  required_providers {
    google = { source = "hashicorp/google", version = ">= 5.0" }
  }
}

provider "google" {
  project = var.project
  region  = var.region
}

# --- datasets: least-privilege read boundary -----------------------------------
resource "google_bigquery_dataset" "raw" {
  dataset_id  = var.raw_dataset
  location    = var.bq_location
  description = "govbuy raw (write): doc archive, fact event log, evidence, frontier, runs"
}

resource "google_bigquery_dataset" "public" {
  dataset_id  = var.public_dataset
  location    = var.bq_location
  description = "govbuy public (read): typed source-anchored query-serving + sibling authorized view"
}

# --- service accounts ----------------------------------------------------------
resource "google_service_account" "ingest" {
  account_id   = "govbuy-ingest"
  display_name = "govbuy ingestion harness (write)"
}

resource "google_service_account" "api" {
  account_id   = "govbuy-api"
  display_name = "govbuy MCP API (read-only)"
}

# --- IAM: ingestion writes both; API reads ONLY govbuy_public (never *_raw, never the sibling) ---
resource "google_bigquery_dataset_iam_member" "ingest_raw" {
  dataset_id = google_bigquery_dataset.raw.dataset_id
  role       = "roles/bigquery.dataEditor"
  member     = "serviceAccount:${google_service_account.ingest.email}"
}
resource "google_bigquery_dataset_iam_member" "ingest_public" {
  dataset_id = google_bigquery_dataset.public.dataset_id
  role       = "roles/bigquery.dataEditor"
  member     = "serviceAccount:${google_service_account.ingest.email}"
}
resource "google_bigquery_dataset_iam_member" "api_public_read" {
  dataset_id = google_bigquery_dataset.public.dataset_id
  role       = "roles/bigquery.dataViewer"
  member     = "serviceAccount:${google_service_account.api.email}"
}
resource "google_project_iam_member" "ingest_jobuser" {
  project = var.project
  role    = "roles/bigquery.jobUser"
  member  = "serviceAccount:${google_service_account.ingest.email}"
}
resource "google_project_iam_member" "api_jobuser" {
  project = var.project
  role    = "roles/bigquery.jobUser"
  member  = "serviceAccount:${google_service_account.api.email}"
}

# --- sibling access (M8): the INGEST SA reads uk_tenders_public to BUILD the materialised, non-PII
#     sibling_call_off_awards snapshot table (`govbuy-ingest materialize-sibling`). The API SA never
#     gets access to the sibling — it reads only the snapshot in govbuy_public. ---
resource "google_bigquery_dataset_iam_member" "ingest_reads_sibling" {
  dataset_id = var.sibling_dataset
  role       = "roles/bigquery.dataViewer"
  member     = "serviceAccount:${google_service_account.ingest.email}"
}

# --- GitHub Actions -> govbuy-ingest SA, keyless (ADR-0006, supersedes ADR-0005) ---------------
# Lets the chrisns/govbuy nightly workflow impersonate the ingest SA with no long-lived key.
resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "github-actions"
  display_name              = "GitHub Actions"
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github"
  display_name                       = "GitHub"
  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
  }
  # Only this repo's workflows may mint tokens.
  attribute_condition = "assertion.repository == 'chrisns/govbuy'"
  oidc { issuer_uri = "https://token.actions.githubusercontent.com" }
}

resource "google_service_account_iam_member" "github_impersonates_ingest" {
  service_account_id = google_service_account.ingest.name
  role                = "roles/iam.workloadIdentityUser"
  member              = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/chrisns/govbuy"
}

# --- site auto-deploy: ingest SA can rebuild+redeploy govbuy-mcp after a refresh (`gcloud run
#     deploy --source`), running the service AS the existing read-only api SA. Scoped to exactly
#     what a source deploy needs — no project-wide IAM/dataset-ACL admin (that's a one-time,
#     already-done bootstrap in scripts/deploy_api.sh, not re-run by the automated path). ---
resource "google_project_iam_member" "ingest_run_admin" {
  project = var.project
  role    = "roles/run.admin"
  member  = "serviceAccount:${google_service_account.ingest.email}"
}
resource "google_project_iam_member" "ingest_cloudbuild_editor" {
  project = var.project
  role    = "roles/cloudbuild.builds.editor"
  member  = "serviceAccount:${google_service_account.ingest.email}"
}
resource "google_project_iam_member" "ingest_artifactregistry_writer" {
  project = var.project
  role    = "roles/artifactregistry.writer"
  member  = "serviceAccount:${google_service_account.ingest.email}"
}
resource "google_project_iam_member" "ingest_storage_admin" {
  # gcloud run deploy --source stages the build context in a Cloud-Run-managed bucket, and its
  # existence check calls storage.buckets.list — a project-level-only permission, so a bucket-scoped
  # binding (tried first, insufficient: run 32470581123) can't satisfy it. Widens the ingest SA to
  # all buckets in this project, which today is just this one plus its own raw-archive bucket.
  project = var.project
  role    = "roles/storage.admin"
  member  = "serviceAccount:${google_service_account.ingest.email}"
}
resource "google_service_account_iam_member" "ingest_deploys_as_api" {
  service_account_id = google_service_account.api.name
  role                = "roles/iam.serviceAccountUser"
  member              = "serviceAccount:${google_service_account.ingest.email}"
}

data "google_project" "this" {
  project_id = var.project
}

resource "google_service_account_iam_member" "ingest_acts_as_cloudbuild_default" {
  # gcloud run deploy --source's build runs as the default compute SA; the deploying principal
  # needs serviceAccountUser on it too, distinct from the runtime SA (govbuy-api) above (run 32472701319).
  service_account_id = "projects/${var.project}/serviceAccounts/${data.google_project.this.number}-compute@developer.gserviceaccount.com"
  role                = "roles/iam.serviceAccountUser"
  member              = "serviceAccount:${google_service_account.ingest.email}"
}

# --- GCS raw doc archive (replay + substring-gate source) -----------------------
resource "google_storage_bucket" "raw_archive" {
  name                        = "${var.project}-govbuy-raw"
  location                    = var.bq_location
  uniform_bucket_level_access = true
  lifecycle_rule {
    condition { age = 730 }
    action { type = "Delete" }
  }
}

# --- API: public, unauthenticated MCP, read-only SA, single instance -----------
resource "google_cloud_run_v2_service" "api" {
  count    = var.api_image == "" ? 0 : 1
  name     = "govbuy-mcp"
  location = var.region
  template {
    service_account = google_service_account.api.email
    scaling {
      min_instance_count = 0
      max_instance_count = 1
    }
    session_affinity = true
    containers {
      image = var.api_image
      ports { container_port = 8080 }
      env {
        name  = "GCP_PROJECT"
        value = var.project
      }
      env {
        name  = "BQ_PUBLIC_DATASET"
        value = var.public_dataset
      }
      env {
        name  = "BQ_LOCATION"
        value = var.bq_location
      }
      env {
        name  = "MAX_BYTES_BILLED"
        value = var.max_bytes_billed
      }
      resources { limits = { cpu = "1", memory = "512Mi" } }
    }
  }
}

resource "google_cloud_run_v2_service_iam_member" "api_public" {
  count    = var.api_image == "" ? 0 : 1
  name     = google_cloud_run_v2_service.api[0].name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# Deploy-time IAM assertion (PRD §11): the API SA must read ONLY the two named public datasets,
# never any *_raw and never uk_tenders_public directly. Enforced as a check in scripts/deploy_api.sh.
