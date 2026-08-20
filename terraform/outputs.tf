output "api_url" {
  value       = var.api_image == "" ? "(set api_image to deploy)" : google_cloud_run_v2_service.api[0].uri
  description = "Cloud Run URL of the govbuy MCP API"
}

output "ingest_sa" {
  value       = google_service_account.ingest.email
  description = "Service account the operator-hosted harness writes as"
}

output "api_sa" {
  value       = google_service_account.api.email
  description = "Read-only API service account (govbuy_public only)"
}

output "github_wif_provider" {
  value       = google_iam_workload_identity_pool_provider.github.name
  description = "Set as the GOVBUY_WIF_PROVIDER repo variable in chrisns/govbuy"
}
