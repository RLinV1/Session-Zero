variable "region" {
  description = "AWS region."
  type        = string
  default     = "us-east-1"
}

variable "instance_type" {
  description = "EC2 instance type. The vision image needs memory; t3.medium (4 GB) is the minimum."
  type        = string
  default     = "t3.medium"
}

variable "disk_gb" {
  description = "Root disk size in GB (gp3)."
  type        = number
  default     = 30
}

variable "ssh_cidr" {
  description = "CIDR allowed to reach port 22, for example 203.0.113.7/32. Required; no default so SSH is never open to the world by accident."
  type        = string
}

variable "ssh_key_name" {
  description = "Name of an existing EC2 key pair for SSH. Empty means no key (no SSH login)."
  type        = string
  default     = ""
}

variable "repo_url" {
  description = "Git URL the VM clones. Must be reachable without credentials and contain the deploy files on repo_ref."
  type        = string
  default     = "https://github.com/RLinV1/Session-Zero.git"
}

variable "repo_ref" {
  description = "Branch or tag to check out."
  type        = string
  default     = "main"
}

variable "domain" {
  description = "Your domain (its A record must point at the Elastic IP). Empty means <ip-with-dashes>.sslip.io when enable_https, else the bare IP."
  type        = string
  default     = ""
}

variable "enable_https" {
  description = "true: Caddy serves HTTPS with an automatic certificate. false: plain HTTP and COOKIE_SECURE=0 (demo only)."
  type        = bool
  default     = true
}
