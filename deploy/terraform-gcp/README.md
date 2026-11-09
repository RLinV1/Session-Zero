# Terraform: VTT on one Compute Engine VM

Creates an Ubuntu 24.04 VM, firewall rules (80/443 open, 22 from `ssh_cidr`) and a reserved static IP. The VM's
startup script clones the repo, writes `.env.production` with generated secrets and runs
`docker compose -f docker-compose.prod.yml up -d --build`. Full guide: `docs/DEPLOYMENT.md`, "Google Cloud with Terraform".

```bash
gcloud auth application-default login           # needs a project with billing and the Compute Engine API enabled
cp terraform.tfvars.example terraform.tfvars    # set project_id and ssh_cidr at least
terraform init
terraform apply
terraform output site_url                       # live after a few minutes (first build is slow)
terraform destroy                               # removes VM, firewall rules, static IP
```

Progress on the VM: `gcloud compute ssh vtt --zone us-east1-b`, then `sudo tail -f /var/log/vtt-bootstrap.log`.

State holds the generated passwords in plain text (`terraform.tfstate`, git-ignored). Keep it private.
The repo at `repo_url`/`repo_ref` must be public and already contain `docker-compose.prod.yml`, `Dockerfile.server`,
`Dockerfile.web`, `Dockerfile.mcp` and `deploy/Caddyfile`.
