# Letters and digits only: the values go into a URL and a JSON file (see docker-compose.prod.yml).
resource "random_password" "postgres" {
  length  = 32
  special = false
}

resource "random_password" "s3_access_key" {
  length  = 20
  special = false
}

resource "random_password" "s3_secret_key" {
  length  = 40
  special = false
}

# Reserved first, used by the instance via network_interface, so the startup script can contain the address without a cycle.
resource "google_compute_address" "vtt" {
  name   = "vtt-ip"
  region = var.region
}

locals {
  ip_dashed = replace(google_compute_address.vtt.address, ".", "-")
  host      = var.domain != "" ? var.domain : (var.enable_https ? "${local.ip_dashed}.sslip.io" : google_compute_address.vtt.address)
  scheme    = var.enable_https ? "https" : "http"
  tag       = "vtt"
}

resource "google_compute_network" "vtt" {
  name                    = "vtt-net"
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "vtt" {
  name          = "vtt-subnet"
  region        = var.region
  network       = google_compute_network.vtt.id
  ip_cidr_range = "10.20.0.0/24"
}

resource "google_compute_firewall" "web" {
  name          = "vtt-web"
  network       = google_compute_network.vtt.id
  source_ranges = ["0.0.0.0/0"]
  target_tags   = [local.tag]
  disabled      = var.close_web_ports

  allow {
    protocol = "tcp"
    ports    = ["80", "443"]
  }
}

resource "google_compute_firewall" "ssh" {
  count         = var.ssh_cidr != "" ? 1 : 0
  name          = "vtt-ssh"
  network       = google_compute_network.vtt.id
  source_ranges = [var.ssh_cidr]
  target_tags   = [local.tag]

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }
}

resource "google_compute_instance" "vtt" {
  name         = "vtt"
  machine_type = var.machine_type
  zone         = var.zone
  tags         = [local.tag]

  boot_disk {
    initialize_params {
      image = "ubuntu-os-cloud/ubuntu-2404-lts-amd64"
      size  = var.disk_gb
      type  = "pd-balanced"
    }
  }

  network_interface {
    subnetwork = google_compute_subnetwork.vtt.id
    access_config {
      nat_ip = google_compute_address.vtt.address
    }
  }

  metadata_startup_script = templatefile("${path.module}/startup.sh.tftpl", {
    repo_url      = var.repo_url
    repo_ref      = var.repo_ref
    client_origin = "${local.scheme}://${local.host}"
    site_address  = var.enable_https ? local.host : ":80"
    cookie_secure = var.enable_https ? "1" : "0"
    postgres_pass = random_password.postgres.result
    s3_access_key = random_password.s3_access_key.result
    s3_secret_key = random_password.s3_secret_key.result
    smtp_host     = var.smtp_host
    smtp_port     = var.smtp_port
    smtp_user     = var.smtp_user
    smtp_pass     = var.smtp_pass
    mail_from     = var.mail_from
  })

  lifecycle {
    ignore_changes = [metadata_startup_script]
  }
}
