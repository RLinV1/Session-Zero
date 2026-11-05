# Edge protection

What stands in front of the server, what stops a flood, and what to turn on. Written 2026-11-04, because
ADR 0051 leaves network floods to the edge. Evidence for every measured number here:
[`audits/edge-protection-2026-11-04.md`](audits/edge-protection-2026-11-04.md).

## Recommendation

**Put Cloudflare's Free plan in front through a Cloudflare Tunnel, and close the VM's web ports.**
It costs 0 USD a month plus a domain, about 12 to 23 USD a year.

Nothing on the VM can stop a real flood, because the VM's link and CPU are already paying by the time traffic
arrives. It has to be absorbed upstream. Cloudflare states that its layer 3, 4 and 7 DDoS protection is
[unmetered on all plans](https://developers.cloudflare.com/ddos-protection/about/).

That step needs a person (see [Turning on Cloudflare](#turning-on-cloudflare)), so the repo ships two layers:

| Layer | State | What it stops |
|---|---|---|
| Caddy limits per address | **On** once this change is deployed | One machine sending too much, slow-request attacks |
| Cloudflare Tunnel | Off until the steps below are done | Traffic volume, many-address floods, anyone reaching the VM directly |

## What is in front today

Internet → cloud firewall (80 and 443 open to everyone, 22 from one CIDR) → Caddy in the `web` container (TLS, static
files, proxy) → Express and Socket.IO. It is one EC2 or Compute Engine VM from `deploy/terraform*`, with no CDN or WAF.
The Fly and Railway plan was dropped (`DESIGN.md`). The repo holds no Terraform state or URL, so it can't say whether a
VM is live now.

What the host gives for free: [AWS Shield Standard](https://aws.amazon.com/shield/faqs/) covers layers 3 and 4 at no
charge with nothing to enable, though the page doesn't mention bare Elastic IPs. It does nothing at layer 7, and AWS WAF
[can't attach to a bare EC2 instance](https://aws.amazon.com/waf/faqs/). Google's pricing and protection pages could not
be read, so check what a Compute Engine VM gets before relying on it.

## Options

| Option | Cost | Verdict |
|---|---|---|
| Cloudflare Free + Tunnel | 0 USD + domain | **Recommended.** No open web ports, no origin certificate, no list of Cloudflare addresses to maintain |
| Cloudflare Free, proxied DNS | 0 USD + domain | Works, but the firewall must be kept in step with Cloudflare's ranges and Caddy needs a certificate behind the proxy |
| Caddy rate limit module | 0 USD; adds about 70 s and up to 1.4 GB to the image build | **Shipped.** Per-address limits with no account, but no help against volume |
| [CloudFront flat-rate Free](https://aws.amazon.com/cloudfront/pricing/) | 0 USD, includes 1M requests and 100 GB a month | AWS only, and the page doesn't say what happens past the allowance. The fallback if a domain is impossible |
| AWS ALB + WAF | At least 22 USD a month ([ALB](https://aws.amazon.com/elasticloadbalancing/pricing/) 16.20, [WAF](https://aws.amazon.com/waf/pricing/) 5 + 1 per rule), plus 0.60 per million requests and LCUs | Rejected: about 60% on top of the VM's 36 USD |
| Google HTTPS load balancer + Cloud Armor | 5 USD + 1 per rule + 0.75 per million requests (secondary source), plus the load balancer | Rejected for the same reason |
| nginx instead of Caddy | 0 USD | Rejected: has `limit_req` and `limit_conn` built in, but loses automatic HTTPS, which the `sslip.io` default depends on |

## What Caddy now does

| Zone | Paths | Per address, per 10 s | Real use |
|---|---|---|---|
| `sockets` | `/socket.io/*` | 100 | One per tab. A handshake with a bad credential costs two database lookups, and the app allows 3 on each socket |
| `api` | `/api/*`, `/health` | 500 | A room load is 4 calls, so a class of 33 on one address needs about 132 |
| `uploads` | `/uploads/*` | 1,000 | Each reads object storage even when the file doesn't exist. Cached by the browser for a year after |
| none | Everything else | No limit | Static files that Caddy serves itself |

IPv6 addresses count per /64. Over the limit, the client gets a 429 with `Retry-After`, and a socket client retries by
itself. It reconnected about 11 s after spending its whole budget. A class reconnecting after a restart may take a few
extra seconds.

This covers the routes that had no per-address limit: invalid handshakes, wrong invite codes, requests with a forged
session cookie (a database lookup each), and missing uploads. It also:

- refuses `transport=polling`, because the web client only uses WebSocket and each poll opens a server session
- drops a connection with no complete request head after 10 s (slowloris; Caddy's default is 1 minute)
- keeps addresses out of Caddy's logs, as the privacy page promises, and rotates the `web` and `server` logs at 30 MB
  each, because Docker otherwise keeps them forever and a flood would fill the disk

Budgets are per address, so people behind one address share them. They're meant to stop one machine, not a botnet: each
active address holds up to about 38 KB, so 10,000 addresses would take about 380 MB. That's another reason for
Cloudflare.

## WebSocket connection limits

Neither Caddy nor Cloudflare Free documents a cap on open connections per address. The limit comes from three things:

- **No valid seat:** new connections are capped at 100 per 10 s and each is closed after 45 s without a handshake
  (measured), so at most about 450 per address.
- **A valid seat:** ADR 0051 allows 8 per seat, and 120 new ones a minute.
- **Handshakes on one socket:** the app closes a socket on its fourth (ADR 0051). No edge can do this: Caddy counts one
  request, and [Cloudflare's WAF stops inspecting once a socket is open](https://developers.cloudflare.com/network/websockets/).
  With Caddy's budget, that bounds failed handshakes at 600 database lookups per 10 s per address.
- **A hard cap, on a VM reached directly:** only the kernel can do this. Tested under Docker's NAT with a limit of 3:

  ```bash
  for port in 80 443; do
    sudo iptables -I DOCKER-USER -p tcp -m conntrack --ctorigdstport "$port" --ctstate NEW \
      -m connlimit --connlimit-above 300 --connlimit-mask 32 --connlimit-saddr -j REJECT --reject-with tcp-reset
  done
  ```

  It is lost on reboot, and it isn't in the Terraform bootstrap because editing that rebuilds the VM. It does nothing
  behind a Tunnel, where every connection comes from `cloudflared`. 300 leaves room for a class on one address.

## `TRUST_PROXY` stays 1

Adding a CDN does not change the hop count. Express only ever sees Caddy, and Caddy sends one `X-Forwarded-For` entry:
the client address it decided on. Who Caddy believes is set in one place, `TRUSTED_PROXIES`. Tested with a stand-in proxy:

| Setup | Result |
|---|---|
| Direct, client forges the header | `req.ip` is the real peer |
| Trusted proxy relays a client that forged `1.1.1.1` | `req.ip` is the real client |
| Bypassing a trusted proxy and forging | `req.ip` is the attacker's real address |
| Remove `trusted_proxies_strict` | **The forged address wins.** Cloudflare keeps what the client wrote, and Caddy reads from the left by default |
| Remove `header_up` from the Caddyfile | `req.ip` is the proxy, for everyone |
| Forget `TRUSTED_PROXIES` behind a proxy | `req.ip` is the proxy, for everyone. Not forgeable, but everyone shares one budget |

## Turning on Cloudflare

Do these on a live VM by hand, and **don't change `domain`, `enable_https` or `repo_ref` in Terraform**: that replaces
the instance and deletes its data volumes (`DEPLOYMENT.md` §4).

1. **Update the privacy page first.** It says nothing is shared and names only a hosting provider. Cloudflare decrypts
   all traffic, including passwords, on its way to the VM, so this is a team decision and not just an edit.
2. Add the domain to Cloudflare and move its nameservers there.
3. Create a Tunnel in the Zero Trust dashboard and copy its token. Add a public hostname: `vtt.example.com`, service
   `HTTP`, URL `web:80`. Cloudflare's docs don't state the price; other sources say it's free on every plan, and the
   Zero Trust signup may ask for a card without charging it.
4. Set these in `/opt/vtt/.env.production`:

   ```bash
   CLIENT_ORIGIN=https://vtt.example.com
   SITE_ADDRESS=:80
   COOKIE_SECURE=1
   TRUST_PROXY=1
   TRUSTED_PROXIES=private_ranges
   TUNNEL_TOKEN=<token>
   ```

5. Start it, and use the same flag for every later `up`:

   ```bash
   docker compose --env-file .env.production -f docker-compose.prod.yml --profile cloudflare up -d --build
   ```

6. **Check it works.** None of this has been run against a real Cloudflare edge, and the pages read don't confirm
   browser WebSockets through a Tunnel. Open a room and confirm it connects. Then, from your laptop:

   ```bash
   for i in $(seq 1 151); do curl -s -o /dev/null -w '%{http_code}\n' -X POST https://vtt.example.com/api/auth/signin -H 'content-type: application/json' -d '{}'; done | sort | uniq -c
   ```

   Expect 150 `401` and one `429`. Then sign in with a wrong password from a phone on mobile data, which should say the
   password is wrong. If it says too many attempts, every visitor is sharing one address: recheck `TRUSTED_PROXIES`. The
   laptop's address stays limited for 15 minutes. Keep the ports open until this passes.
7. Close the ports: set `close_web_ports = true` and run `terraform plan`, which must show `0 to destroy`, then apply.
   Without Terraform, remove 80 and 443 from the firewall. `private_ranges` is only safe with them closed or with no
   public IPv6 on the VM (the Terraform VMs have none), because Docker's IPv6 proxy can make clients look private.
8. Optional, the plan's one [rate limiting rule](https://developers.cloudflare.com/waf/rate-limiting-rules/): URI Path
   starts with `/socket.io/`, by IP, 100 requests per 10 s, block for 10 s. Leave Bot Fight Mode off.

Also expected: [Cloudflare restarts end WebSockets](https://developers.cloudflare.com/network/websockets/) now and then,
and the client reconnects (FR-PL-05). The Free plan's 100 MB upload limit is above the app's largest (40 MB).

## Still open

- The app's own per-address limits count each IPv6 address separately, while Caddy groups them by /64.
- The Caddy module is third-party and pinned to a commit, because its one tagged release is from 2024. Update the pin
  when Caddy moves on: CI validates the Caddyfile against the built image.
