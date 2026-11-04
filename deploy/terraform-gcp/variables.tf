variable "project_id" {
  description = "Google Cloud project ID (billing enabled, Compute Engine API enabled). Required."
  type        = string
}

variable "region" {
  description = "Google Cloud region (holds the static IP)."
  type        = string
  default     = "us-east1"
}

variable "zone" {
  description = "Zone for the VM; must be inside region."
  type        = string
  default     = "us-east1-b"
}

variable "machine_type" {
  description = "Compute Engine machine type. The vision image needs memory; e2-medium (2 vCPU, 4 GB) is the default; use e2-standard-2 (8 GB) if the build is Killed."
  type        = string
  default     = "e2-medium"
}

variable "disk_gb" {
  description = "Boot disk size in GB (pd-balanced)."
  type        = number
  default     = 30
}

variable "ssh_cidr" {
  description = "CIDR allowed to reach port 22, for example 203.0.113.7/32. Required; no default so SSH is never open to the world by accident."
  type        = string
}

variable "repo_url" {
  description = "Git URL the VM clones. Must be reachable without credentials and contain the deploy files on repo_ref."
  type        = string
  default     = "https://github.com/RLinV1/Virtual-Tabletop.git"
}

variable "repo_ref" {
  description = "Branch or tag to check out."
  type        = string
  default     = "main"
}

variable "domain" {
  description = "Your domain (its A record must point at the static IP). Empty means <ip-with-dashes>.sslip.io when enable_https, else the bare IP."
  type        = string
  default     = ""
}

variable "enable_https" {
  description = "true: Caddy serves HTTPS with an automatic certificate. false: plain HTTP and COOKIE_SECURE=0 (demo only)."
  type        = bool
  default     = true
}
