variable "project" { type = string }
variable "region" {
  type    = string
  default = "europe-west1" # Cloud Run domain mappings unsupported in europe-west2 (sibling precedent)
}
variable "bq_location" {
  type    = string
  default = "EU"
}
variable "raw_dataset" {
  type    = string
  default = "govbuy_raw"
}
variable "public_dataset" {
  type    = string
  default = "govbuy_public"
}
variable "sibling_dataset" {
  type    = string
  default = "uk_tenders_public"
}
variable "api_image" {
  type    = string
  default = ""
}
variable "max_bytes_billed" {
  type    = string
  default = "2147483648" # 2 GiB per query
}
