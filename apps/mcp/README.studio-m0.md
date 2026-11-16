# Studio M0 proof endpoint (fixture only)

`/mcp/studio-m0` is the interactive-ai-scene-studio **M0** spike: it proves ChatGPT host behavior
(MCP Apps view, refresh, file intake, model-visible crops, selection-to-chat, OAuth and protected
media) with synthetic data. It is **not** the Studio. It never reaches the room server, builds,
accounts, uploads or the library, and its state lives in memory.

Results and their evidence labels are in
[research.md](../../openspec/changes/interactive-ai-scene-studio/research.md) and
[the M0 evidence record](../../openspec/changes/interactive-ai-scene-studio/evidence/m0-2026-11-14.md).

## Run it

```bash
# 1. A public HTTPS address for the local port (any tunnel you are authorized to use).
cloudflared tunnel --no-autoupdate --url http://127.0.0.1:3012     # prints https://<name>.trycloudflare.com

# 2. The fixture-only server behind it (STUDIO_M0_ONLY leaves out the player and build tools).
cd apps/mcp
STUDIO_M0=1 STUDIO_M0_ONLY=1 STUDIO_M0_PUBLIC_ORIGIN=https://<name>.trycloudflare.com \
  PORT=3012 HOST=127.0.0.1 TRUST_PROXY=1 npx tsx src/index.ts
```

| Variable | Meaning |
| --- | --- |
| `STUDIO_M0=1` | Mount the endpoint, its stub OAuth server and `/.well-known/oauth-*` metadata. Off by default. |
| `STUDIO_M0_PUBLIC_ORIGIN` | The tunnel origin; it is the token audience and OAuth issuer. |
| `STUDIO_M0_ONLY=1` | Serve nothing else (recommended whenever the port is public). |
| `STUDIO_M0_DATA_DIR` | Private folder, default `apps/mcp/.local/studio-m0/` (Git-ignored). |
| `STUDIO_M0_ACCESS_TTL` | Access-token lifetime in seconds (default 3600). |

The data folder holds, mode 0600: `evidence.jsonl` (events; never tokens, signed URLs or answer keys),
`answer-key.jsonl` (crop markers, operator only), `operator.json` (operator key, static fallback client),
`clients.json` (dynamically registered clients, so a restart keeps a host's `client_id`) and
`file-origins.json` (approved download origins, **empty until an operator verifies one**).

## Connect ChatGPT (web, Work mode)

Plugins → **Add** → **Add custom MCP server** → URL `https://<name>.trycloudflare.com/mcp/studio-m0`,
Authentication **OAuth**. ChatGPT discovers the stub and uses dynamic client registration. Leave
**OIDC** off. Tick the risk acknowledgement and create it, then **Connect** and choose a fixture tester
on the stub's consent page (no password; synthetic data only).

After changing tool metadata or the view, open the plugin's **Settings → Refresh tools**: ChatGPT
keeps the tool list and the `ui://` template it read at connect/refresh time. The view URI carries a
content hash so a refreshed connector picks up a new template.

## Tools

| Tool | Who | Purpose |
| --- | --- | --- |
| `studio_m0_open` | model (+app) | Shows the view (`_meta.ui.resourceUri`) on the tester's fixture workspace. |
| `studio_m0_workspace` | app | Polled versioned state. |
| `studio_m0_set_value` | model | An independent write the open view should pick up. |
| `studio_m0_import_file` | model + app | Original bytes from a host descriptor (`openai/fileParams`), bounded download. |
| `studio_m0_view_crop` | model | Crop with an overlay-only marker; `includeImage:false` is the control. |
| `studio_m0_save_request` / `studio_m0_get_request` | app / model | Selection saved by the view, read by the model by id. |
| `studio_m0_get_media` | app | Image bytes in `_meta` for the view (no public URL); `probeBytes` measures size limits. |
| `studio_m0_report` | app | The view's own diagnostics (host context, CSP violations, timings) into the evidence log. |

## Operator controls (local only)

`POST http://127.0.0.1:3012/studio-m0-operator/<action>` with header `x-operator-key` from
`operator.json`; anything arriving through the tunnel is refused. Actions: `state`, `expire-access`,
`revoke-all`, `access-ttl` (`{"seconds":n}`), `static-redirect` (`{"redirectUri":…}`) and
`replay-descriptor` (`{"hostFileId":…}`: re-download a held host descriptor and report only the outcome).

## Checks

`npm test --workspace=@vtt/mcp -- studioM0 protocolEras` covers the harness locally. Local tests are not
host evidence.
