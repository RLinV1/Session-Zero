# Deployment

How to run the VTT outside a laptop, on AWS or Google Cloud. This is based on the code and
`docker-compose.yml` as of this branch (see also `docs/DESIGN.md` §2).

## 1. What the app is made of

| Part | What it is | Needed for |
|---|---|---|
| `apps/server` | Express + Socket.IO on port 3001 (`/health`, `/api`, `/socket.io`, `/uploads`) | Everything |
| `apps/web` | React + PixiJS, built by Vite into static files | Everything |
| Postgres 17 | Event store (`PostgresRoomStore`, Prisma migrations) | Persistent rooms and accounts |
| Redis 7 | Event sequence numbers, BullMQ wall-detection jobs | More than one server instance, wall detection |
| S3-compatible storage | Uploaded maps and token art (`S3AssetStore`) | Uploads in production |
| `services/vision` | Python/OpenCV grid detection (HTTP :8000) and wall worker (BullMQ) | FR-GM-11 grid and wall detection |

The server serves no web files. The web app needs its own static host that also proxies
`/api`, `/socket.io` and `/uploads` to the server (this is what `vite.config.ts` does in dev).

## 2. Options

### Option A: keep using `npm run dev` (no containers, no Postgres)

Fine for local work, demos on one laptop, and CI. Not fit for a real deployment. Limitations:

1. **State is lost on every restart.** With no `DATABASE_URL` the server uses `MemoryRoomStore`
   (`apps/server/src/index.ts`). Rooms, events, accounts and checkpoints disappear when the process
   exits, crashes, or `tsx watch` reloads after a file edit. Nothing can be recovered, which also
   defeats event history, undo and encounter replay (ADR 0013, 0019, 0025).
2. **One process only.** With no Redis, sequencing is in-process. Postgres without Redis is
   "single instance only" (the server logs this). Two server instances would hand out clashing
   sequence numbers, so you cannot scale out or do zero-downtime deploys.
3. **No wall or grid detection.** `VISION_URL` defaults to `127.0.0.1:8000`, where nothing runs.
   Wall detection also needs Redis for its BullMQ queue. Both features fail without the Python service.
4. **Uploads go to local disk** (`UPLOAD_DIR`), served by `express.static`. They are lost when the
   host or its disk is replaced, are not shared between instances, and have no CDN. The server
   refuses to start in production without `S3_ENDPOINT` for exactly this reason.
5. **Dev server is not a production server.** `vite` dev serves unbundled modules with HMR, and
   `tsx watch` recompiles on the fly. It is slower, uses more memory, and exposes dev tooling.
   It exits when a dependency is missing instead of being restarted by an orchestrator.
6. **No process supervision, TLS, or health-based restarts.** A crash means downtime until someone
   restarts it. WebSockets need HTTPS and `TRUST_PROXY`/`COOKIE_SECURE` behind a load balancer;
   `npm run dev` has neither.
7. **Dev-only behaviour.** `SEED_DEV_ACCOUNT=1` (a known login) must never be set in production.
   Cookies are not `Secure` over plain HTTP, so sessions are weaker.
8. **Not reproducible.** It depends on whatever Node version and `node_modules` are on the machine
   (`engines.node >= 22`). Docker pins this.

### Option B: Docker Compose on one VM (simplest real deployment)

`docker compose up -d --build` starts Postgres, Redis, SeaweedFS (S3), vision, vision-walls,
server and web. Good for a class demo on one EC2 or Compute Engine VM. Limitations:

1. The dev `Dockerfile` and `docker-compose.yml` run Vite and set `SEED_DEV_ACCOUNT=1` with `vtt/vtt` credentials.
   Do not expose them. Use `docker-compose.prod.yml` instead (section 4).
2. Everything lives on one machine. The VM is a single point of failure; data is on Docker volumes
   (`pgdata`, `redisdata`, `s3data`), so back them up.
3. No managed backups, patching or failover.

### Option C: managed services (recommended for anything lasting)

Run only the stateless containers yourself; use the cloud for state.

| Concern | AWS | Google Cloud |
|---|---|---|
| Server + vision containers | ECS Fargate (or App Runner) | Cloud Run (needs WebSocket support and session affinity off or fine because Redis sequences) |
| Postgres | RDS for PostgreSQL 17 | Cloud SQL for PostgreSQL |
| Redis | ElastiCache | Memorystore |
| Uploads | S3 (set `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`) | Cloud Storage with HMAC keys (S3 interoperability endpoint `https://storage.googleapis.com`) |
| Web (static) | S3 + CloudFront, with `/api`, `/socket.io`, `/uploads` routed to the server | Cloud Storage + Cloud CDN, or serve from the same Cloud Run service behind a load balancer |
| TLS + domain | ALB + ACM | HTTPS load balancer + managed cert |

Limitation to plan for: the vision worker (`wall_worker.py`) runs a loop that polls Redis, so it needs an
always-on container (Fargate service, or Cloud Run with min instances 1 and CPU always allocated), not scale-to-zero.

## 3. Server environment variables

| Variable | Production value |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `3001` |
| `DATABASE_URL` | `postgres://user:pass@host:5432/vtt` |
| `REDIS_URL` | `redis://host:6379` (required for more than one server instance) |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | Required; startup fails without them |
| `VISION_URL` | URL of the vision service, for example `http://vision:8000` |
| `CLIENT_ORIGIN` | The public web origin, for example `https://vtt.example.com` (CORS and write-origin check, ADR 0016) |
| `COOKIE_SECURE` | `1` (HTTPS) |
| `TRUST_PROXY` | Proxies the server sees, so client IPs and HTTPS are read from headers. `1` behind Caddy, including with a CDN in front of it |
| `SEED_DEV_ACCOUNT` | Never set |

The web image takes `TRUSTED_PROXIES`, the proxies in front of Caddy whose `X-Forwarded-For` it believes. See [`EDGE-PROTECTION.md`](EDGE-PROTECTION.md).

Deploy step order: provision Postgres, Redis, bucket, then run `npm run prisma:migrate --workspace=@vtt/server`
(`prisma migrate deploy`) once per release, then roll out the server.

## 4. Production stack on one VM

Files: `Dockerfile.server`, `Dockerfile.web`, `deploy/Caddyfile`, `docker-compose.prod.yml`,
`deploy/env.production.example`. Only ports 80 and 443 are published; Postgres, Redis, S3 and vision
stay on the compose network. No dev account, no Vite dev server, no `vtt/vtt` credentials.

Caddy limits requests per address. Protection against real floods needs Cloudflare in front, which is off until someone
sets it up: see [`EDGE-PROTECTION.md`](EDGE-PROTECTION.md).

Wall detection (`vision-walls`, FR-GM-11) is off by default in `docker-compose.prod.yml` (profile `walls`),
because it is not ready. Without the worker, a queued wall job waits for the server's 10 minute job timeout
before failing. To enable it:
`docker compose --env-file .env.production -f docker-compose.prod.yml --profile walls up -d --build`.
VMs created by Terraform start without it; SSH in and run that command to turn it on.

### Settings

```bash
cp deploy/env.production.example .env.production
openssl rand -hex 24      # run three times: POSTGRES_PASSWORD, S3_ACCESS_KEY, S3_SECRET_KEY
```

Set `CLIENT_ORIGIN` to the URL users will type. Two cases:

- With a domain: `CLIENT_ORIGIN=https://vtt.example.com`, `SITE_ADDRESS=vtt.example.com`. Caddy gets a certificate by itself.
- Without a domain (IP only): `CLIENT_ORIGIN=http://<public-ip>`, `SITE_ADDRESS=:80`, `COOKIE_SECURE=0`. Plain HTTP, demo only.

Starting without `POSTGRES_PASSWORD`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` or `CLIENT_ORIGIN` fails at once and names the variable.

### Start

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps        # migrate shows "exited (0)"; the rest are healthy
curl -s http://localhost/health
```

The first build is slow (the vision image holds OpenCV and an ONNX model, and Caddy is compiled with its rate limit module). Update with `git pull` and the same
`up -d --build`; `migrate` runs again first, then the server restarts. Back up the volumes `pgdata`, `s3data`, `redisdata`.

### Record the size of older uploads

Run this once after the release that adds the upload allowance. Images stored before it count as zero bytes until their size is recorded, so nobody is wrongly refused while this waits. It is safe to run again.

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml exec server npm run uploads:backfill-sizes
```

It prints how many accounts are over each limit and the largest totals, by owner id only. Going over a limit removes nothing. If real accounts are over one, raise `UPLOAD_ALLOWANCE` in `apps/server/src/store/libraryStore.ts` and redeploy.

### AWS EC2

1. Launch Ubuntu 24.04, `t3.medium` (2 vCPU, 4 GB), 30 GB gp3 disk. If the build is `Killed` (out of memory), move to `t3.large` (8 GB).
2. Security group: inbound 22 (your IP only), 80 and 443 (anywhere).
3. Allocate an Elastic IP and attach it. With a domain, add an `A` record to that IP.
4. SSH in and install Docker:
   ```bash
   curl -fsSL https://get.docker.com | sudo sh
   sudo usermod -aG docker $USER && newgrp docker
   ```
5. `git clone <repo> && cd <repo>`, then follow Settings and Start above.

### Google Compute Engine

1. Create a VM: Ubuntu 24.04, `e2-medium` (2 vCPU, 4 GB; `e2-standard-2` with 8 GB if the build is Killed), 30 GB disk, tags `http-server` and `https-server`.
2. Reserve a static external IP for it. With a domain, add an `A` record to that IP.
3. Firewall: `gcloud compute firewall-rules create vtt-web --allow tcp:80,tcp:443 --target-tags http-server,https-server`.
4. `gcloud compute ssh <vm>`, install Docker with the same two commands as the EC2 step 4.
5. `git clone <repo> && cd <repo>`, then follow Settings and Start above.

### AWS with Terraform (one VM, no clicking)

`deploy/terraform/` creates the EC2 steps above for you: Ubuntu 24.04 instance, security group, Elastic IP, generated
secrets, Docker install, `git clone`, `.env.production` and `docker compose ... up -d --build`.

```bash
aws configure                        # once: access key, secret, default region (your own IAM user)
cd deploy/terraform
cp terraform.tfvars.example terraform.tfvars    # edit: at least ssh_cidr
terraform init
terraform apply
terraform output site_url
```

| Variable | Default | Meaning |
|---|---|---|
| `region` | `us-east-1` | AWS region |
| `instance_type` | `t3.medium` | EC2 size (4 GB RAM; if the build is Killed, use `t3.large`) |
| `disk_gb` | `30` | Root gp3 disk, GB |
| `ssh_cidr` | none, required | CIDR allowed on port 22, for example `203.0.113.7/32` |
| `ssh_key_name` | empty | Existing EC2 key pair; empty means no SSH login |
| `repo_url` | `https://github.com/RLinV1/Session-Zero.git` | Repo the VM clones; must be public |
| `repo_ref` | `main` | Branch or tag to check out |
| `domain` | empty | Your domain (point its A record at `public_ip`); empty uses `<ip-with-dashes>.sslip.io` |
| `enable_https` | `true` | `false` gives plain HTTP at the bare IP with `COOKIE_SECURE=0` (demo only) |
| `close_web_ports` | `false` | `true` closes 80 and 443, for a Cloudflare Tunnel ([`EDGE-PROTECTION.md`](EDGE-PROTECTION.md)) |

- **Finding the URL:** `terraform output site_url` (also `public_ip`, `ssh`). The build takes several minutes after
  apply; watch it with `sudo tail -f /var/log/vtt-bootstrap.log` on the VM. With `domain`, create the DNS record, then HTTPS works.
- **Repo contents:** `repo_ref` must already contain `docker-compose.prod.yml`, `Dockerfile.server`, `Dockerfile.web`
  and `deploy/Caddyfile`. Push (or merge) them before applying.
- **Secrets:** the Postgres password and S3 keys are generated by Terraform and live in `terraform.tfstate` and the
  instance user data. State is local and git-ignored; do not commit or share it. Changing `repo_ref`, `domain` or
  `enable_https` replaces the instance, which also drops the data volumes.
- **Cost** (us-east-1, on demand, about 730 hours a month; estimates from published list prices, check the
  [AWS calculator](https://calculator.aws/) before relying on them):

  | Item | `t3.medium` | `t3.large` |
  |---|---|---|
  | Instance | about 30 USD | about 61 USD |
  | 30 GB gp3 disk | about 2.40 USD | about 2.40 USD |
  | Public IPv4 / Elastic IP | about 3.65 USD | about 3.65 USD |
  | Data out (first 100 GB free) | 0 USD | 0 USD |
  | **Total per month** | **about 36 USD** | **about 67 USD** |

  A domain adds about 12 to 23 USD a year. Stopping the instance still bills the disk and the Elastic IP, so run
  `terraform destroy` when the demo is over.
- **Destroy:** `terraform destroy` removes the instance, security group and Elastic IP, and with them all data on the VM.

### Google Cloud with Terraform

`deploy/terraform-gcp/` does the Compute Engine steps above for you: Ubuntu 24.04 VM, firewall rules, reserved static IP,
generated secrets, Docker install, `git clone`, `.env.production` and `docker compose ... up -d --build`.

1. Create a Google Cloud project and enable billing for it (console.cloud.google.com).
2. Enable the Compute Engine API: `gcloud services enable compute.googleapis.com --project <project_id>`.
3. Install the [gcloud CLI](https://cloud.google.com/sdk/docs/install) and [Terraform](https://developer.hashicorp.com/terraform/install).
4. `gcloud auth application-default login` (Terraform uses these credentials).
5. Configure and apply:
   ```bash
   cd deploy/terraform-gcp
   cp terraform.tfvars.example terraform.tfvars    # set project_id, ssh_cidr, repo_ref
   terraform init
   terraform apply
   ```
6. Wait 5 to 15 minutes for the first build, then open `terraform output site_url`.
7. Destroy when done: `terraform destroy` (removes the VM, firewall rules and static IP, and all data on the VM).

| Variable | Default | Meaning |
|---|---|---|
| `project_id` | none, required | Google Cloud project ID |
| `region` | `us-east1` | Region of the static IP |
| `zone` | `us-east1-b` | Zone of the VM |
| `machine_type` | `e2-medium` | 2 vCPU, 4 GB; if the build is Killed use `e2-standard-2` (8 GB) |
| `disk_gb` | `30` | Boot disk (pd-balanced), GB |
| `ssh_cidr` | none, required | CIDR allowed on port 22, for example `203.0.113.7/32` |
| `repo_url` | `https://github.com/RLinV1/Session-Zero.git` | Repo the VM clones; must be public |
| `repo_ref` | `main` | Branch or tag to check out; must contain the deploy files |
| `domain` | empty | Your domain (A record to `public_ip`); empty uses `<ip-with-dashes>.sslip.io` |
| `enable_https` | `true` | `false` gives plain HTTP at the bare IP with `COOKIE_SECURE=0` (demo only) |
| `close_web_ports` | `false` | `true` closes 80 and 443, for a Cloudflare Tunnel ([`EDGE-PROTECTION.md`](EDGE-PROTECTION.md)) |

- **SSH:** use `gcloud compute ssh vtt --zone us-east1-b` (the `ssh` output prints it); no key pair to manage. Then `sudo tail -f /var/log/vtt-bootstrap.log`.
- **Secrets:** generated by Terraform, stored in `terraform.tfstate` (git-ignored) and the VM metadata. Do not commit or share state.
- **Cost (unchecked estimate, us-east1, about 730 hours a month; check the [Google Cloud calculator](https://cloud.google.com/products/calculator)):** `e2-medium` about 25 USD, `e2-standard-2` about 49 USD, plus about 3 USD for the 30 GB pd-balanced disk and about 3.65 USD for the static IP in use. Roughly 32 USD a month (`e2-medium`) or 56 USD (`e2-standard-2`). A stopped VM still bills the disk and an unattached static IP, so destroy when the demo is over.

## 5. Managed services: environment mapping

The same two images run on ECS Fargate or Cloud Run. Drop the `postgres`, `redis` and `s3` containers and point the server at managed ones.

| Variable | AWS | Google Cloud |
|---|---|---|
| `DATABASE_URL` | RDS PostgreSQL 17 | Cloud SQL for PostgreSQL |
| `REDIS_URL` | ElastiCache | Memorystore |
| `S3_ENDPOINT` | `https://s3.<region>.amazonaws.com` | `https://storage.googleapis.com` |
| `S3_BUCKET` | S3 bucket name | Cloud Storage bucket name |
| `S3_ACCESS_KEY`, `S3_SECRET_KEY` | IAM user key for that bucket | HMAC key for a service account |
| `VISION_URL` | Internal address of the vision service | Internal address of the vision service |
| `CLIENT_ORIGIN` | `https://` + the ALB domain | `https://` + the load balancer domain |
| `COOKIE_SECURE`, `TRUST_PROXY` | `1`, `1` (ALB is one hop) | `1`, `1` (HTTPS load balancer is one hop) |
| `NODE_ENV`, `PORT` | `production`, `3001` | `production`, `3001` |

Run the `Dockerfile.server` image as a one-off task with command `npm run prisma:migrate --workspace=@vtt/server` and
working directory `/app` before each release. Put the web image (or an ALB/CDN with path rules for `/api`, `/socket.io`, `/uploads`) in front.
Set `SITE_ADDRESS=:80` on the web image when the load balancer terminates TLS, and `TRUSTED_PROXIES` to the load balancer's subnet, or all visitors share one address in the rate limits.

The wall worker (`python wall_worker.py` from `services/vision`) polls Redis, so it needs an always-on container:
a Fargate service, or Cloud Run with min instances 1 and CPU always allocated. Never scale it to zero.
On the one-VM stack it is the `vision-walls` service, off unless started with `--profile walls` (see section 4).
Cloud Run closes WebSockets after the request timeout (up to 60 minutes); the client reconnects, but this is not tested.

## 6. Suggested path for this project

1. Development: `npm run dev`.
2. Demo/grading: Option B using section 4 on one VM.
3. Anything longer-lived: section 5.
