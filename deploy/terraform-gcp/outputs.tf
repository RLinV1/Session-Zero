output "site_url" {
  description = "Public URL. The stack needs several minutes after apply to build and start."
  value       = "${local.scheme}://${local.host}"
}

output "public_ip" {
  description = "Static external IP. Point your domain's A record here when using the domain variable."
  value       = google_compute_address.vtt.address
}

output "ssh" {
  description = "SSH command (needs your IP in ssh_cidr)."
  value       = "gcloud compute ssh vtt --zone ${var.zone} --project ${var.project_id}"
}
