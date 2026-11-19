# Security audit: frontend, deployment, dependencies (2026-11-18)

Scope: `apps/web`, `services/vision`, the three Dockerfiles, both compose files, `deploy/` (Caddyfile, AWS and GCP Terraform,
env example), `docs/DEPLOYMENT.md`, `docs/EDGE-PROTECTION.md`, `.github/workflows`, package files. Read-only: no tests, builds,
containers or Terraform were run. The backend (`apps/server`, `apps/mcp`, `packages/shared`) belongs to another audit and is
read here only where deployment config touches it.

Method: static reading, grep over tracked files, `git log` over the last 200 commits, one `npm audit --omit=dev --json`.
Items marked **(inferred)** come from reading code or documented provider behaviour and were not confirmed by running anything.

Totals: 0 critical, 0 high, 6 medium, 9 low, 4 informational.

## Past findings

Read first: `docs/audits/edge-protection-2026-11-04.md`, `docs/DEPLOYMENT.md`, `openspec/changes/security-hardening`,
`openspec/changes/email-verification/security-review.md`. Not repeated below.

| Past finding | State now |
|---|---|
| Edge: forged `X-Forwarded-For`, rate-limit zones, polling refused, handshake flood | Closed. `trusted_proxies_strict` and `header_up X-Forwarded-For {client_ip}` are in `deploy/Caddyfile:24,100`. |
| security-hardening D1 to D5 (password-change guess limit, invite join limit, per-participant chat limits, proxy trust refused in production, S3 keys required) | Closed per tasks.md; not re-tested (backend). |
| security-hardening "not fixed" 1: token and map image URLs are free text | Open at the schema level (backend). In the browser, CSP `img-src 'self' data: blob:` and `connect-src 'self' wss: ws:` (`apps/web/securityHeaders.ts`) block the outside load, so the IP-reveal scenario is mitigated in practice. See I-1. |
| security-hardening "not fixed" 3: room uploads trust the declared type | Looks closed for `/api/uploads`: `imageUpload.ts` checks bytes with `checkImageBytes` and only png, jpeg and webp are stored (inferred; backend). `build.ts:292` sets `anyDeclaredType: true`, but bytes are still checked. |
| security-hardening "not fixed" 2 and 4 (command rate limit, unbounded token positions) | Open (backend, not re-examined). |
| EDGE-PROTECTION "Still open": app limits count each IPv6 address, Caddy groups by /64 | Open. |
| Edge-protection "Not tested": real Cloudflare edge, Terraform against real clouds, real flood | Still untested. |
| email-verification L6 (SMTP secret in cloud metadata and state) | Open. Expanded in M-3 because on GCP any container can read it. |

## Findings, ranked

### Medium

**M-1. GCP: the project's default-network SSH rule makes `ssh_cidr` meaningless (inferred).**
`deploy/terraform-gcp/main.tf:30-53`. The VM uses `network = "default"`. A GCP project's default network normally ships with
`default-allow-ssh` (0.0.0.0/0, tcp:22), `default-allow-rdp` and `default-allow-icmp`, and these apply to every instance
regardless of tags. The `vtt-ssh` rule limiting 22 to `var.ssh_cidr` only adds an allow, so port 22 stays open to the world.
Scenario: a scanner brute-forces or exploits sshd on the public IP; the VM holds the Postgres, SMTP and S3 secrets.
Fix: create a dedicated VPC and subnet with no default rules, or add a `google_compute_firewall` deny at lower priority number
for 22 and 3389 from 0.0.0.0/0 on the `vtt` tag, and add `enable-oslogin = TRUE` and `block-project-ssh-keys = TRUE` metadata.
Not confirmed: org policies or a deleted default network would change this. Run `gcloud compute firewall-rules list` on the real project.

**M-2. Production containers have no memory, CPU or pid limits except `mcp`; one image upload can take down the VM.**
`docker-compose.prod.yml` (only `mem_limit: 768m` at line 128). The dev compose gives `vision` `mem_limit: 2g`
(`docker-compose.yml:50`), prod does not. On a `t3.medium` (4 GB, no swap configured) the wall worker, OpenCV on a
16 megapixel image (`GRID_MAX_PIXELS`, `OPENCV_IO_MAX_IMAGE_PIXELS=40000000`), Postgres, Redis, SeaweedFS and tsx-run Node
share the same memory. Scenario: a signed-in user triggers grid or wall detection on a large map; the vision container
grows until the kernel OOM killer picks Postgres or the server. All tables go down at once.
Fix: set `mem_limit`, `cpus` and `pids_limit` on `vision`, `vision-walls`, `server`, `postgres`, `redis`, `s3`; add a swap file in
the bootstrap; keep the dev values (`GRID_MEMORY_LIMIT` default 2g, concurrency 1).

**M-3. GCP startup-script secrets are readable from any container; AWS keeps them on disk and in state.**
`deploy/terraform-gcp/main.tf:76-90`, `deploy/terraform/main.tf:115-129`, both bootstrap templates.
`postgres_pass`, `s3_secret_key` and `smtp_pass` are rendered into instance user data. On GCP the metadata server answers
`http://metadata.google.internal/computeMetadata/v1/instance/attributes/startup-script` to any process that sends
`Metadata-Flavor: Google`, including containers on the Docker bridge. A compromise of the server, vision or MCP container
(for example an OpenCV or Pillow parsing bug on an uploaded image) therefore yields the Postgres password, the S3 admin
key and the Resend API key in one request. AWS is better: `http_tokens = "required"` (`main.tf:111`) and the default hop limit
of 1 stop containers from reaching IMDS (inferred; the hop limit is not set explicitly). On both clouds the values are also
in Terraform state in plaintext (`random_password` results and `smtp_pass`) and on the VM in `/var/lib/cloud` or the
GCE `google_metadata_script_runner` copy (inferred).
Fix: GCP: block containers from `169.254.169.254` with an iptables `DOCKER-USER` rule in the bootstrap, or run Docker with
`--iptables` rules for it. Both: put secrets in Secret Manager or SSM Parameter Store and fetch them in the bootstrap with an
instance role scoped to those secrets; set `http_put_response_hop_limit = 1` explicitly on AWS; use a remote, encrypted
Terraform backend; scope the Resend key to "sending access" for `sessionzero.codes` only and rotate it if the state ever leaves your machine.

**M-4. `/mcp` and the OAuth discovery paths have no edge rate limit, and Caddy sets no request body cap.**
`deploy/Caddyfile:51-81` (zones match only `/socket.io/*`, `/api/*`, `/health`, `/uploads/*`), `:96` and `:105` (routes).
`/mcp`, `/mcp/*` and `/.well-known/*` skip every zone and there is no `request_body { max_size }` anywhere. The MCP app
accepts JSON up to 12 MB on its build routes with `type: () => true` (`apps/mcp/src/app.ts:84`), which is a 768 MB container.
Scenario: one client posts 12 MB bodies in a loop to `/mcp/build/...` without credentials; the request is parsed before
authorization (inferred from the parser being app-level middleware) and the container hits its memory cap, so AI seats and Studio
go down; with the memory limit the container restarts in a loop.
Fix: add a `zone mcp` matching `/mcp /mcp/*` and a `zone wellknown`; add `request_body { max_size 45MB }` on `@backend` and a smaller
cap (for example 13MB) on `@mcp`, tuned to the largest legitimate upload (the app's own limit is 40 MB per EDGE-PROTECTION.md).

**M-5. Dev compose publishes the app server, the web dev server and a known login on every interface.**
`docker-compose.yml:96-97,110`. `server` is `3001:3001`, `web` is `5173:5173` (Vite `host: true`, `vite.config.ts:40`),
and `SEED_DEV_ACCOUNT: "1"` creates `t@gmail.com` / `password` (`apps/server/src/identity/devAccount.ts`). Postgres, Redis, S3
and vision are correctly bound to `127.0.0.1`. Scenario: a teammate runs `docker compose up` on a cloud VM, a campus network or
a public Wi-Fi laptop; anyone who reaches port 3001 or 5173 signs in as the seeded account and uses the real server. The
production server refuses `SEED_DEV_ACCOUNT` (devAccount.ts:14), so this only hurts dev machines and demo VMs.
Fix: bind to `127.0.0.1:3001` and `127.0.0.1:5173` (the Vite comment says phones on the same Wi-Fi are a feature, so make it an
opt-in override file), and print a warning in the compose header.

**M-6. No backups, no automatic security updates, and Terraform changes can delete the data.**
`docs/DEPLOYMENT.md:59` ("No managed backups, patching or failover"), `deploy/terraform/main.tf:114` and `user_data_replace_on_change`
(documented in EDGE-PROTECTION.md step 0), `deploy/terraform-gcp/startup.sh.tftpl:99`. Accounts, rooms and uploads live in
Docker volumes on one root disk. A mistaken `terraform apply` (a changed `repo_ref`, `domain`, `smtp_pass` or `enable_https`)
replaces the instance and the volumes. Ubuntu `unattended-upgrades` is not enabled by the bootstrap, so kernel and Docker
patches depend on someone logging in. For real users this is an availability and integrity risk, not a leak.
Fix: nightly `pg_dump` to an off-box bucket plus an EBS or persistent-disk snapshot schedule; a separate data volume with
`prevent_destroy`; `lifecycle { ignore_changes = [user_data] }` after first apply; install `unattended-upgrades` in the bootstrap.

### Low

**L-1. Containers run as root and images are not pinned.**
`services/vision/Dockerfile` (no `USER`; `python:3.11-slim`), `Dockerfile.web` (Caddy as root, `caddy:2-alpine`,
`caddy:2-builder-alpine` unpinned), `docker-compose.prod.yml:14,28,41` (`postgres:17`, `redis:7-alpine`,
`chrislusf/seaweedfs:latest`). The server and MCP images do use `USER node`. Vision parses untrusted user images with OpenCV
and Pillow as root. Scenario: an image-parser memory bug becomes root in the container; combined with M-3 that is the secrets.
`seaweedfs:latest` can change under you on the next `--build` or `pull` and break the production S3 config format.
Fix: add a non-root user to the vision image; pin images by digest; pin SeaweedFS to a release tag; add `read_only: true`,
`cap_drop: [ALL]` and `security_opt: [no-new-privileges:true]` to `vision`, `vision-walls`, `server`, `mcp`.

**L-2. SeaweedFS runs the whole stack on the internal network with only S3 authenticated.**
`docker-compose.prod.yml:40-58`. `weed server -s3` also starts master, volume and filer services; their HTTP ports (9333, 8080,
8888 by default) are not published but are reachable by every container on the compose network, with no authentication.
The S3 key is `Admin`. Scenario: a compromised vision container reads or overwrites all uploads through the filer, bypassing the
S3 key. Fix: put `s3` and `vision` on separate compose networks (`vision` needs only `redis` and the server); consider
`-filer=false`-style flags or a read-only volume model; do not share the S3 admin key with the app (use a read/write key).

**L-3. Redis and Postgres on the internal network without extra authentication or network segmentation.**
`docker-compose.prod.yml:27-38`. Redis has no `requirepass`; the vision worker and any other container can write BullMQ jobs and
the event sequence keys. A compromised vision container could rewrite `seq` counters or wall job results (inferred; backend
effect). Fix: `--requirepass` from env; give `vision-walls` its own network that reaches only Redis; Redis ACL limited to
`wall-detection` and `vtt:wall-*` keys for the worker.

**L-4. Vision service: binds 0.0.0.0, no authentication, no read timeout before the handler.**
`services/vision/server.py:99` and `:64-95`. Inside the prod network only the server calls it, and the dev compose publishes it on
`127.0.0.1`, so exposure is limited. A slow client holding many connections is not bounded: `self.connection.settimeout(5)` runs
after the admission semaphore, header reading before it has no timeout, and `ThreadingHTTPServer` creates a thread per
connection. Scenario: any container on the network (see L-2, L-3) opens thousands of idle connections and exhausts threads or
memory. Upload size is bounded (25 MB, `grid_config.py:5`), pixel count is bounded, the work runs in a child process with a
timeout, and there are no URL fetches (no SSRF) and no temp files: good. Fix: set `Handler.timeout = 10`, cap concurrent
connections, and optionally require a shared-secret header from the server.

**L-5. Python dependencies are not locked.**
`services/vision/requirements.txt`: `numpy==1.26.4`, `opencv-python-headless==4.8.1.78`, `Pillow==11.1.0` are pinned, but
`bullmq>=2.15,<4` is a range and its dependency `redis` is unpinned; no hashes (`--require-hashes`); transitive packages move
at every build. CI does not run `pip-audit`. Pillow 11.1.0 and OpenCV 4.8.1.78 are old: I did not run an advisory scan, so
whether they carry open CVEs is **unconfirmed**. Fix: `pip-compile --generate-hashes`, add a `pip-audit` CI job, bump Pillow to
the current 11.x or 12.x and re-run `test_detector.py`; the pinned `VERSION` string in `grid_config.py` ties results to versions,
so update it in the same change.

**L-6. CI actions pinned by tag, no `permissions:` block, build runs on every PR.**
`.github/workflows/ci.yml` uses `actions/checkout@v4`, `setup-node@v4`, `setup-python@v5`, `docker/setup-buildx-action@v3`.
Without a `permissions:` key the token gets the repository default (write on older repos). Scenario: a compromised or moved tag runs
code with a write token on every PR from the same repo. Fork PRs get a read-only token, so impact is limited. Fix: add
`permissions: { contents: read }` at the top; pin actions to commit SHAs with Dependabot to update them.

**L-7. CSP and headers are good but incomplete.**
`deploy/Caddyfile:39-46`, `apps/web/securityHeaders.ts`. Present: CSP (no `unsafe-eval`, `script-src 'self'`, `frame-ancestors 'none'`,
`object-src 'none'`), HSTS, `X-Frame-Options`, `nosniff`, `Referrer-Policy`. Missing: `Permissions-Policy` (camera, microphone,
geolocation, payment stay available to the page), `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`. `style-src
'unsafe-inline'` is needed by React inline styles and Pixi (accepted). `connect-src 'self' wss: ws:` allows a WebSocket to any host,
so if script ever runs, data can leave over a socket; tighten to `'self'` plus `wss://<your host>` (CSP `'self'` covers same-origin
`wss:` in current browsers, so `wss: ws:` may be removable; test the socket client in Chromium and Safari first). HSTS has
`includeSubDomains` without a plan for other subdomains of `sessionzero.codes`; a later plain-HTTP subdomain would break. Fix:
add `Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=()"` and `Cross-Origin-Opener-Policy "same-origin"` to both
`deploy/Caddyfile` and `SECURITY_HEADERS` (the test keeps them equal); add `report-to`/`report-uri` later if you want CSP reports.

**L-8. Guest and GM credentials sit in `localStorage` as readable strings.**
`apps/web/src/net/identity.ts:45,199` (`vtt.cred.*` credentials, GM guest token), by design per ADR 0002. HttpOnly cookies are used for
account sessions (`sessions.ts:43`: `HttpOnly; SameSite=Lax; Secure`, `__Host-` prefix: good), but seat credentials are
script-readable. The CSP is the only barrier: any future XSS, or a browser extension, reads every room's credentials.
No current injection path was found (see passed checks). Fix: none urgent; keep the CSP strict and keep `unsafe-inline` out of
`script-src`; consider moving the GM guest token to an HttpOnly cookie in a later change.

**L-9. Email verification link keeps the token in the address bar after a failed attempt.**
`apps/web/src/account/AccountPages.tsx:291-305`. On success the page navigates away with `replace: true` (good). On failure the
URL `/verify-email?token=...` stays, so it enters history and, if the user copies the page, the stale token travels. Single-use tokens
make this harmless, and referrers are cut to the origin by the policy. Fix: `history.replaceState` to `/verify-email` after reading
the token. (The server side of verification is covered in `email-verification/security-review.md`.)

### Informational

- **I-1.** Token, map and creature image URLs are accepted from the server as any string (security-hardening "not fixed" 1).
  In the browser CSP stops an outside load, and `connect-src` stops Pixi from fetching one (inferred, not browser-tested). Plain `<img src>`
  elements (`LibraryPage.tsx:532`, `BuildPage.tsx:634`, `GmPanel.tsx:784`) take server-provided URLs. A server-side `/uploads/` allowlist would
  still be the right fix. `https://` images from a GM would silently fail, so say so in the UI.
- **I-2.** `apps/web/vite.config.ts:40` `host: true` and the proxy `changeOrigin: false` are dev-only; the security headers apply only to
  `vite preview`, as the comment says.
- **I-3.** `graphify-out/` (graph.json, graph.html, GRAPH_REPORT.md) is tracked and indexes the codebase; it contains no secrets (the
  only pattern hit was an identifier containing `re_`), but it publishes your architecture and internal names. Remove it from the
  public repository if the repo is public.
- **I-4.** `walls.onnx` (97 MB) is committed to git and loaded with `cv2.dnn.readNetFromONNX` (`walls.py:550`): no pickle, no
  `torch.load`, no `np.load(allow_pickle)`, no model download at runtime, so no deserialization-to-code path. It was trained by the
  team (commit history `be84e396`, `b350cfef`). Every clone carries 97 MB per version in history; consider Git LFS. Provenance
  beyond the commit author is not recorded in `THIRD_PARTY_NOTICES.md` (training data licences: **not checked**).

## Dependencies (`npm audit --omit=dev`)

Result: 3 high, 0 critical, all one chain: `prisma` -> `@prisma/config` -> `deepmerge-ts` (GHSA-ggr8-5vv4-36mx, stack exhaustion on
recursive object graphs). Real exploitability: none for users. It is reachable only through the Prisma CLI and config loader that
run in the `migrate` container with config you control, not with request data. It is already allowlisted with a reason in
`scripts/audit-ci.mjs`. Clears when Prisma moves to `deepmerge-ts >= 8`; re-check with each Prisma upgrade.
`package-lock.json` is tracked, Docker builds use `npm ci`. The only install hook is `apps/server` `postinstall: prisma generate`;
there is no `.npmrc`, and no `--ignore-scripts` anywhere (install scripts of dependencies run in the image build).
Dev-only advisories are out of scope of the CI gate and were not triaged.

## Checks that passed

- No `dangerouslySetInnerHTML`, `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval` or `new Function` in `apps/web/src`;
  no markdown or HTML renderer dependency (`marked`, `react-markdown`, `dompurify` absent). Chat, names and token labels render through React text nodes or Pixi text.
- No `<iframe>`, `srcDoc`, `postMessage` to other origins (only a same-origin `BroadcastChannel` for account and dice-skin sync, no origin data trusted).
- `safeNext` (`apps/web/src/account/safeNext.ts`) rejects `//host`, `/\host`, absolute URLs and `javascript:`; the `new URL` re-check also defeats
  tab and newline smuggling (inferred from URL parsing rules). Every `signInFor` call encodes the path.
- External links: `target="_blank"` links all carry `rel="noreferrer"` or `rel="noopener"` (`LibraryPage.tsx:465`, `DifferentiatorsSection.tsx:41`, `DiceLookPicker.tsx:36`).
- Studio connect page: the redirect URL comes from the server, is https-or-loopback only (`studioOAuth.ts:110,266`), is followed only after a click or after an explicit decision, and the host is shown.
- WebSocket URL: `io({...})` with no origin argument (`roomConnection.ts:118`), so same origin only; `cors.origin` is `clientOrigin`.
- Cookies: `__Host-vtt_session`, `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, no `Domain` (`sessions.ts:22,43`).
- No third-party loads: `apps/web/test/noExternalAssets.test.ts` is a real check (it greps `src`, `href`, `url(`, `import`, `fetch`, `new Audio`
  with `https?://`) and my own grep of `apps/web/src` found no external hosts besides links to the team's GitHub repository and policy pages.
  Caveat: it is line-based, so a URL built across lines escapes it (the test says so).
- No source maps: `vite.config.ts` has no `build.sourcemap`, default is off. `apps/web/public/` holds images, audio and CREDITS only; no `.env`, keys or JSON secrets.
- Secrets in git: no `.env`, `.pem`, `.key`, `tfstate` or `tfvars` added in the last 200 commits; the secret-pattern scan (AWS, GitHub, Resend, OpenAI, Slack, private key blocks)
  over tracked files and history found nothing; only `.example` env files are tracked. `.gitignore` covers `.env*`, `*.tfstate`, `*.tfvars`, `.terraform/` (in `deploy/*/.gitignore`), `studio-private/` and uploads.
- `.dockerignore` excludes `.git`, `.env*`, `docs`, `openspec`, `.github`, uploads: no secrets baked into images; compose reads secrets from an env file, not build args.
- Prod compose publishes only 80 and 443 from `web`; Postgres, Redis, SeaweedFS, vision and MCP are not published. Dev compose binds Postgres, Redis, S3 and vision to `127.0.0.1`.
- Postgres and S3 secrets are required (`:?` syntax) and random (Terraform `random_password`, 32 and 40 chars); no default passwords in prod.
- AWS: no IAM role attached (nothing to steal), root volume `encrypted = true`, IMDSv2 required, SSH limited to `ssh_cidr` plus the EC2 Instance Connect prefix list, egress open (acceptable), no S3 bucket created (SeaweedFS), Elastic IP.
  GCP: no `service_account` block, so no attached credentials; SSH and web rules are tag-scoped (but see M-1).
- Caddy: automatic HTTPS with a hostname, HSTS, admin API not published (default `localhost:2019` inside the container), slowloris `read_header 10s`, rate limits and /64 grouping, logs stripped of addresses.
- Vision: bounded upload (25 MB), pixel and edge limits, subprocess with timeout, one-at-a-time admission, no URL fetching, no temp files, wall worker accepts only `vtt:wall-image:<sha256>` keys.
- `docker-compose.prod.yml` rotates server and web logs; `server` and `mcp` images run as `node`, have healthchecks.

## Not covered

- Live behaviour: no browser, no running containers, no real Cloudflare, no `terraform plan` against real accounts. Security headers were read from config, not captured from a deployed response.
- Whether the GCP project actually has the default firewall rules (M-1), and what the AWS hop limit really is (M-3), need a live check.
- `pip-audit` / `safety` on the Python packages, `npm audit` for dev dependencies, Docker image scans (Trivy, Grype), and licence checks.
- Caddy's `xcaddy build` pulls Go modules for the current `caddy:2-builder-alpine`; module and base-image supply chain not inspected.
- Backend routes, authorization and the email-verification code (other audits). The edge behaviour of `/mcp/build` bodies in M-4 is inferred from `apps/mcp/src/app.ts`.
- Pixi board code was grepped for injection sinks only; WebGL shader or texture memory abuse was not tested.
- Privacy page and Cloudflare decryption policy (EDGE-PROTECTION step 1) are a policy matter and were not assessed.
