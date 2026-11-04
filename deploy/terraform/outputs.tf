output "site_url" {
  description = "Public URL. The stack needs several minutes after apply to build and start."
  value       = "${local.scheme}://${local.host}"
}

output "public_ip" {
  description = "Elastic IP. Point your domain's A record here when using the domain variable."
  value       = aws_eip.vtt.public_ip
}

output "ssh" {
  description = "SSH command (needs ssh_key_name and your IP in ssh_cidr)."
  value       = "ssh ubuntu@${aws_eip.vtt.public_ip}"
}
