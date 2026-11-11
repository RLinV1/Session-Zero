# Terraform: VTT on one EC2 VM

Creates an Ubuntu 24.04 instance, a security group (80/443 open, 22 from `ssh_cidr`) and an Elastic IP. The
instance clones the repo, writes `.env.production` with generated secrets and runs
`docker compose -f docker-compose.prod.yml up -d --build`. Full guide: `docs/DEPLOYMENT.md` section 4.

```bash
aws configure                                   # or set AWS_PROFILE / AWS_ACCESS_KEY_ID
cp terraform.tfvars.example terraform.tfvars    # set ssh_cidr at least
terraform init
terraform apply
terraform output site_url                       # live after a few minutes (first build is slow)
terraform destroy                               # removes instance, security group, Elastic IP
```

Progress on the VM: `sudo tail -f /var/log/vtt-bootstrap.log`.

State holds the generated passwords in plain text (`terraform.tfstate`, git-ignored). Keep it private.
The repo at `repo_url`/`repo_ref` must be public and already contain `docker-compose.prod.yml`, `Dockerfile.server`,
`Dockerfile.web`, `Dockerfile.mcp` and `deploy/Caddyfile`.
