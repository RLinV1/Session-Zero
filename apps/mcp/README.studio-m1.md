# M1 delegated access and protected intake qualification

This is the **pending real-host run**, covering M1a and M1b together (FR-GM-26/27).
The local browser bridge is useful regression evidence, but cannot qualify ChatGPT.
Do not open a tunnel or operate the user's ChatGPT account until the user separately approves
this run. No production deployment, DNS, edge, AWS or development-stack change is needed.

## Operator preparation

Use Node 22 and the M1b branch. Check `git status` and record the exact HEAD. Use only the
committed synthetic `browser/fixtures/studio-map.png` and `studio-token.png`, a fresh synthetic
Session Zero account, and the isolated stack below. Do not use private art or a real Session Zero
account. A real ChatGPT account is required for the host itself; let its owner control sign-in.
Keep passwords, tokens, signed descriptors and raw authenticated traffic out of evidence.
Record only statuses, hashes, dimensions, timings and redacted screenshots.

First verify ports 3109, 3119, 5189, 55434 and 18334 are free. Never reuse 3001, 5173,
5432, 8333 or the `cse416` Compose project. If the previous isolated project is still running,
reuse it only after checking its exact name/environment in handoff.md, or stop that owned
project before creating another. Never substitute the development database/store.

```bash
fnm use 22
node scripts/studio-m1b/prepare.mjs
# It prints a temporary environment-file path and an isolated project name, never secrets.
# Set this to that printed path; do not copy the environment file into the repository.
export STUDIO_RUN_ENV=/private/tmp/<printed-directory>/run.env
set -a
source "$STUDIO_RUN_ENV"
set +a
docker compose --project-name "$STUDIO_TEST_COMPOSE_PROJECT" \
  --env-file "$STUDIO_RUN_ENV" -f scripts/studio-m1b/compose.yml up -d --wait
npm exec --workspace=@vtt/server -- prisma migrate deploy
```

The host run uses private local disk with the isolated Postgres. Actual authenticated S3
storage and a Docker persistence restart have separate automated proofs. Do not enable the
browser test harness: `STUDIO_BROWSER_TEST` must be unset. Do not seed the development account.

After approval, start a temporary tunnel to the isolated Vite port:

```bash
cloudflared tunnel --no-autoupdate --url http://127.0.0.1:5189
```

In each service terminal source the printed environment file, use Node 22, and set the **same**
new HTTPS origin (without a trailing slash) on server and MCP. The Vite host allowance is the
exact printed hostname, not a wildcard. Stop/restart these services if the tunnel origin changes;
old grants are audience-bound and cannot be reused against a different origin.

```bash
export STUDIO_PUBLIC_ORIGIN=https://<printed-name>.trycloudflare.com
export CLIENT_ORIGIN="$STUDIO_PUBLIC_ORIGIN"
export S3_AUTODETECT=0 S3_ENDPOINT='' REDIS_URL='' SEED_DEV_ACCOUNT=0
export VISION_URL=http://127.0.0.1:18889
export STUDIO_MEDIA_MODE=local
export STUDIO_PRIVATE_DIR=/private/tmp/<new-private-run-directory>/media
export UPLOAD_DIR=/private/tmp/<new-private-run-directory>/uploads

# Terminal A: server. DATABASE_URL comes only from the isolated environment file.
HOST=127.0.0.1 PORT=3109 npm run dev:server

# Terminal B: MCP (source the same environment and origin first).
HOST=127.0.0.1 PORT=3119 TRUST_PROXY=1 \
  ROOM_SERVER_URL=http://127.0.0.1:3109 npm run dev:mcp

# Terminal C: Vite (same environment/origin).
__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=<printed-name>.trycloudflare.com \
  VTT_SERVER=http://127.0.0.1:3109 VTT_MCP=http://127.0.0.1:3119 \
  npm run dev --workspace=@vtt/web -- --host 127.0.0.1 --port 5189 --strictPort
```

Do not enable HTTP request-body logging. These are development processes, not production
services. Only synthetic account/build data belongs on this temporary public endpoint.

## Exact host workflow

1. On the temporary website sign up a new synthetic account. Create **Synthetic chapel**
   and **Unselected control** builds. Record their identifiers privately in operator notes.
   Do not upload the fixtures on the website: the first intake must come through chat.
2. Check `/.well-known/oauth-authorization-server` and
   `/.well-known/oauth-protected-resource/mcp/studio`: issuer/resource/endpoints must name
   the tunnel origin. `/.well-known/openid-configuration` must return 404. Record statuses,
   not OAuth bodies or credentials. The unauthenticated `/mcp/studio` call must require OAuth.
3. In ChatGPT web, add a custom MCP app at
   `https://<printed-name>.trycloudflare.com/mcp/studio`, authentication **OAuth**, with
   OIDC off and no manually supplied client secret. This menu path was observed in M0;
   record any current host UI differences. Registration must succeed through Session Zero's
   own `/api/oauth/register`. Never enter a password on an external identity-provider page.
4. Choose **Connect**. On `/studio/connect`, verify the app name, return origin and
   limited authority. Sign in to the synthetic account if prompted. Select **Synthetic chapel**
   only, then allow. Cancel/refuse once in a separate attempt and confirm it grants nothing.
   Do not record callback URLs, codes, tokens or network traces.
5. Start a fresh chat with the new app enabled. Ask it to list the builds it can access.
   It must show the selected build only. An explicit read of **Unselected control** must be
   refused without metadata. No library enumeration, room, GM, owner-choice or publication
   tool may be available through this grant.
6. Attach the two original synthetic PNGs to the chat composer. Send:
   **“Open Session Zero Studio for Synthetic chapel. Import studio-map.png as the map and
   studio-token.png as token art, using the attached original files.”**
   Verify `studio_open` takes attachment descriptors directly. If the host omits the file
   arguments, record a failed qualification; do not substitute a website upload or thumbnail.
7. The view must identify the synthetic owner and build, display the protected source map,
   and list both files with saved outcomes and canonical dimensions. Expand it, reopen it
   from the conversation, and reload the page. The same source and saved files must recover
   from the backend. Check English and zh-TW, keyboard controls and a narrow window.
8. Independently compare stored `originalSha256` values with
   `shasum -a 256 browser/fixtures/studio-map.png browser/fixtures/studio-token.png`.
   Use a signed-in **owner-only** Studio snapshot/API or a read-only query against the
   isolated database; keep credentials out of command history/output. Confirm the stored
   original bytes hash identically, and distinguish preview hash/dimensions from originals.
9. Try **Choose from ChatGPT** and the device input with the same synthetic files. Each
   must use its host helper, return the original bytes and deduplicate in the same kind.
   Try a batch with one unsupported file and one valid image; verify successful files remain
   saved and the failed file has actionable guidance. Repeat the original selection and
   verify no duplicate files. A transport interruption may show an unknown outcome; reconnect,
   inspect saved files, then retry only missing originals.
10. Exercise expiry without storing a signed URL: pause in the browser debugger immediately
    after the host helper returns a descriptor and before the app sends it. Resume after
    more than ten minutes. The server must refuse it with re-select/reattach guidance and
    preserve previous files. Select the file again immediately and verify recovery. If this
    cannot be reproduced without capturing a URL, mark this host step pending; automated
    expiry coverage remains separate evidence.
11. While the view is open, end its connection on the website's build page. Further app
    snapshot/media and model reads must be refused. The mounted view may retain its last
    authorized image marked stale, but must receive no new bytes. Reconnect as the same
    synthetic owner and reopen: saved state must recover. A new connection as a second
    synthetic owner must refuse the original build and clear its cached private content.
12. Delete the synthetic builds/account through the website. Verify new media jobs finish,
    originals/previews are gone, and access is ended. Leave any earlier public/published
    controls valid. Disconnect/remove the temporary ChatGPT app with the user's agreement.

The content-versioned `ui://` resource must contain no account data, credentials, signed URLs
or private images. The open tool result contains identifiers/status only. Private source bytes
arrive through authorized app-only `studio_get_media` metadata and render as `data:` URLs.
Inspect this without saving authenticated request logs. No `blob:` or public-storage workaround.

## Record and shut down

Add a dated redacted record under `openspec/changes/interactive-ai-scene-studio/evidence/`:
exact commit, ChatGPT client/model/mode, actual host/tool/protocol behavior, each step's
PASS/FAIL/PENDING result, independently checked original hashes, response cache headers,
reopen/revoke results, and redacted screenshot references. Do not describe local checks as
host evidence. Tick 2.5/2.8 only when their entire proof and review requirements are satisfied.

Stop the tunnel first, then the three owned service processes. Remove only the owned isolated
project and its throwaway volumes:

```bash
docker compose --project-name "$STUDIO_TEST_COMPOSE_PROJECT" \
  --env-file "$STUDIO_RUN_ENV" -f scripts/studio-m1b/compose.yml down -v
```

Remove that run's temporary private/public directories and environment file after extracting
redacted evidence. No merge, deployment or M2 work is part of this run.
