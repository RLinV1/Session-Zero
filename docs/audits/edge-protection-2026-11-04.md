# Edge protection: verification log, 2026-11-04

Evidence behind [`../EDGE-PROTECTION.md`](../EDGE-PROTECTION.md). No live deployment, shared dev server or dev database
was touched. Everything ran locally in Docker on a throwaway network with an in-memory server.

## Environment

- Docker 29.5 on a Mac, 2 CPUs visible to containers, arm64. The VMs are amd64.
- Caddy v2.11.8 with `caddy-ratelimit` at `5625512` (the image `Dockerfile.web` builds), real `Dockerfile.server` image.
- `NODE_ENV=development`, because production mode needs object storage. So the server used `MemoryRoomStore`: database
  costs below come from reading the code, not from measuring Postgres.
- Stand-in upstream for address tests: the repo's Express 5.2.1 with `trust proxy` 1, returning `req.ip`.

## Not tested

- **A real Cloudflare edge.** A Quick Tunnel was tried, to see what Cloudflare actually delivers, and refused by this
  session's permission rules for inbound tunnels before anything started. Header shapes below follow
  [Cloudflare's docs](https://developers.cloudflare.com/fundamentals/reference/http-headers/) instead, and the rollout
  steps include a check. The `cloudflared` compose service has never run.
- The Cloudflare dashboard steps, which come from docs, without an account.
- A flood at real volume, and the build on an actual `t3.medium`.
- Terraform against real clouds: mock-provider plans only, so the in-place claim rests on the providers' documented
  behaviour. Check `terraform plan` before applying.
- Log rotation being exercised: `docker compose config` shows it on `server` and `web`.

## Who the client is (`TRUST_PROXY=1`)

`.10` is a stand-in proxy, `.20` a direct client.

| Caddy config | From | Sent `X-Forwarded-For` | `req.ip` |
|---|---|---|---|
| Nothing trusted | `.20` | none | `.20` |
| Nothing trusted | `.20` | `1.1.1.1` | `.20` |
| Nothing trusted | `.20` | `1.1.1.1, 2.2.2.2` | `.20` |
| `.10` trusted | `.10` | `9.9.9.9` | `9.9.9.9` |
| `.10` trusted | `.10` | `1.1.1.1, 9.9.9.9` | `9.9.9.9` |
| `.10` trusted | `.20` | `1.1.1.1` | `.20` |
| Control: no `trusted_proxies_strict` | `.10` | `1.1.1.1, 9.9.9.9` | **`1.1.1.1`** (forged) |
| Control: no `header_up` | `.10` | `9.9.9.9` | **`.10`** (the proxy) |
| Control: `.10` not trusted | `.10` | `9.9.9.9` | **`.10`** (the proxy) |
| `private_ranges` | `.10` | `203.0.113.50` | `203.0.113.50` |
| `private_ranges` | `.10` | `1.1.1.1, 203.0.113.50` | `203.0.113.50` |
| `private_ranges` | `.10` | `10.0.0.1, 203.0.113.50` | `203.0.113.50` |
| `private_ranges` | `.10` | `203.0.113.50, 172.18.0.5` | `203.0.113.50` |
| `private_ranges` | `.10` | `2001:db8::1` | `2001:db8::1` |

## Limits, real server behind real Caddy

| Test | Result |
|---|---|
| 150 upgrades at once from one address | 100 × 101, 50 × 429 |
| One upgrade from another address, same moment | 101 |
| 150 upgrades, a new forged `X-Forwarded-For` each | 150 × 429 |
| One upgrade after the 10 s window | 101 |
| 600 `GET /api/auth/me` | 500 × 200, 100 × 429, `Retry-After: 10` |
| 1,100 `GET /uploads/nope.png` | 1,000 × 404, 100 × 429, `Retry-After: 10` |
| 3,000 `GET /` (static) | 3,000 × 200 |
| 501 requests from 501 addresses in one IPv6 /64 | 1 refused; the next /64 is unaffected |
| `transport=polling` | 403 |
| `transport=polling&transport=websocket` | 403 |
| `transport=POLLING`, or no transport | 400, from the server |
| Slow request head, one header a second | Dropped at 10.0 s |
| Default socket client after spending the budget | Connected after 10.9 s and 4 refused attempts |
| 100 sockets that never send a handshake | All closed between 45.1 and 45.2 s |
| A real seat holding its socket | Connected for 150 s, past the 2 minute `idle`, no drops |
| Sign up, create room, join, socket, over HTTP and over Caddy's own HTTPS | All succeed |
| 150 upgrades over HTTPS | 100 × 101, 50 × 429 |

Over HTTPS the real client first failed with `websocket error`. That came from the test:
`engine.io-client` sets `rejectUnauthorized: true`, overriding the env var used to accept Caddy's internal test CA.
Passing `rejectUnauthorized: false` connected.

## One socket, many handshakes

One upgrade, then 2,000 Socket.IO `CONNECT` packets with valid-shaped, wrong credentials:

```text
first refusal: 44{"message":"unauthorized"}
one upgrade, 2000 CONNECT packets sent, 2000 refused by the handshake check in 94 ms
```

Reading `ws/socket.ts`, each runs `findCredential` and `findRevokedCredential`.

### Fixed, 2026-11-05

`HANDSHAKES_PER_CONNECTION` in `ws/socket.ts`, added after `fix/invite-abuse-limits` merged. The Caddy row used the same
setup as above, rebuilt from the final source. The other rows ran in-process with spies on the store, because the
image gives no way to count lookups.

| Check | Before | After |
|---|---|---|
| 2,000 `CONNECT` packets on one upgrade, through Caddy | 2,000 refused in 94 ms, socket left open | 1 refusal reached the client, socket closed at 39 ms |
| `findCredential` calls for that burst | Not counted; every packet ran the check | 3 |
| `findRevokedCredential` calls | Not counted; every packet ran the check | 3 |
| Half-made sockets left in Socket.IO after it | Not measured | 0 |

The three new tests in `apps/server/test/abuseLimits.test.ts` timed out on the unchanged code. Two deliberate breaks
show what the burst test guards:

| Break | Result |
|---|---|
| Count refusals instead of arrivals | 564 lookups, and the test fails |
| Close the connection without calling `next` | 561 half-made sockets left behind, and the test fails |

Packets keep reaching the check after the close because Socket.IO's `_add` awaits `_createSocket`. Every packet from one
network read passes the engine's "still open" test before any of them reaches `io.use`. They cost no lookups, and later
reads are dropped.

Not measured: Postgres. The lookup count doesn't depend on the store, because the count is taken before the first lookup.

## Logs and the privacy page

The page says addresses are "never saved", and Docker writes container logs to disk.

| Check | Before the fix | After |
|---|---|---|
| Lines with a client address after 400 rate-limit refusals | 400 (`rate limit exceeded`, with `remote_ip`) | 0 |
| A 502 from the proxy | Logged `remote_ip` and request headers | Still logged, with no address or headers |

The 502 logging predates this change.

## Real app in a browser

Through Caddy at `http://127.0.0.1:18080`, test account `edge-browser@test.invalid` on the in-memory server:

- A signed-in GM loading an empty room: 4 API calls (`/api/auth/me`, `/api/library/dice`, the seat and the invite), 36
  static files. The socket connected and the console had no errors.
- `/privacy` shows the updated sentence.

With the handshake limit in, 2026-11-05, same setup, test account `edge-handshake@test.invalid`, a new empty room:

| Step | Result |
|---|---|
| Open the room | "Connected · seq 2" |
| Restart Caddy, which drops the socket | "Reconnecting…", then "Connected · seq 2" 1.4 s later |
| Restart the server, which wipes its in-memory data so the credential is unknown | "Reconnecting…", then "No access to this room" 1.2 s later |
| Console | No errors at any step |

## Build, config and firewall

- `xcaddy` step: 1.39 GB peak and 69 s with no cap. It also finishes with `--memory=1g` and `--cpus=2`.
- `caddy validate` passes with `TRUSTED_PROXIES` unset and with a hostname, and Caddy starts with it empty and set.
  `caddy fmt` changes nothing.
- `docker compose config` gives 7 services by default, adding `cloudflared` only with `--profile cloudflare`.
- `terraform fmt`, `init` and `test` with mock providers, on both clouds: 80 and 443 stay open by default and close with
  `close_web_ports = true`, and SSH stays. These tests were not committed.
- Kernel limit, in `docker:dind` under Docker's real NAT, limit 3 on published port 80: of 6 connections 3 opened and 3
  were refused, a connection opened after closing them, and another source was unaffected. The rule loads under
  iptables-nft, as on Ubuntu 24.04.

## Sources

Read on 2026-11-04: Cloudflare ([rate limiting](https://developers.cloudflare.com/waf/rate-limiting-rules/),
[WebSockets](https://developers.cloudflare.com/network/websockets/),
[DDoS](https://developers.cloudflare.com/ddos-protection/about/),
[Tunnel firewall](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/configure-tunnels/tunnel-with-firewall/)),
[Caddy options](https://caddyserver.com/docs/caddyfile/options),
[caddy-ratelimit](https://github.com/mholt/caddy-ratelimit), and AWS ([WAF](https://aws.amazon.com/waf/pricing/),
[CloudFront](https://aws.amazon.com/cloudfront/pricing/),
[ALB](https://aws.amazon.com/elasticloadbalancing/pricing/), [Shield](https://aws.amazon.com/shield/faqs/)).
AWS dollar figures come from worked examples on those pages. Google's pages could not be read, so its Cloud Armor
figures come from a search summary. That Tunnel is free also comes from secondary sources.

## Cleanup

Removed: all test containers, the network, the test images, and the Terraform, dind and `node:22-alpine` images. Kept:
`caddy:2-alpine` and `caddy:2-builder-alpine`, which `Dockerfile.web` uses anyway. Nothing was left listening. The
2026-11-05 containers, network and images were removed the same way.
