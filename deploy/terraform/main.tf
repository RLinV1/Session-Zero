data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

data "aws_ec2_managed_prefix_list" "ec2_instance_connect" {
  name = "com.amazonaws.${var.region}.ec2-instance-connect"
}

data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"]
  }
}

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

resource "aws_security_group" "vtt" {
  name_prefix = "vtt-"
  description = "VTT web (80/443) and SSH from ssh_cidr"
  vpc_id      = data.aws_vpc.default.id

  dynamic "ingress" {
    for_each = var.close_web_ports ? [] : [80, 443]
    content {
      description = ingress.value == 80 ? "HTTP" : "HTTPS"
      from_port   = ingress.value
      to_port     = ingress.value
      protocol    = "tcp"
      cidr_blocks = ["0.0.0.0/0"]
    }
  }

  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.ssh_cidr]
  }

  ingress {
    description     = "SSH via EC2 Instance Connect"
    from_port       = 22
    to_port         = 22
    protocol        = "tcp"
    prefix_list_ids = [data.aws_ec2_managed_prefix_list.ec2_instance_connect.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  lifecycle {
    create_before_destroy = true
  }
}

# Allocated first and associated afterwards, so user_data can contain the address without a cycle.
resource "aws_eip" "vtt" {
  domain = "vpc"
}

locals {
  ip_dashed = replace(aws_eip.vtt.public_ip, ".", "-")
  host      = var.domain != "" ? var.domain : (var.enable_https ? "${local.ip_dashed}.sslip.io" : aws_eip.vtt.public_ip)
  scheme    = var.enable_https ? "https" : "http"
}

resource "aws_instance" "vtt" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  subnet_id              = data.aws_subnets.default.ids[0]
  vpc_security_group_ids = [aws_security_group.vtt.id]
  key_name               = var.ssh_key_name != "" ? var.ssh_key_name : null

  root_block_device {
    volume_type = "gp3"
    volume_size = var.disk_gb
    encrypted   = true
  }

  metadata_options {
    http_tokens = "required"
  }

  user_data_replace_on_change = true
  user_data = templatefile("${path.module}/user_data.sh.tftpl", {
    repo_url      = var.repo_url
    repo_ref      = var.repo_ref
    client_origin = "${local.scheme}://${local.host}"
    site_address  = var.enable_https ? local.host : ":80"
    cookie_secure = var.enable_https ? "1" : "0"
    postgres_pass = random_password.postgres.result
    s3_access_key = random_password.s3_access_key.result
    s3_secret_key = random_password.s3_secret_key.result
  })

  tags = {
    Name = "vtt"
  }
}

resource "aws_eip_association" "vtt" {
  instance_id   = aws_instance.vtt.id
  allocation_id = aws_eip.vtt.id
}
