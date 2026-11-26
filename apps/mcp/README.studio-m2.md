# M2 visible preparation qualification

This run uses synthetic accounts and committed art, isolated Postgres/S3 and the real
`services/vision` detector. The preparation cases cover M2. The publication case checks the
M5 website handoff, receipt recovery and room artwork in the same local stack.
The user authorized the temporary tunnel, ChatGPT connection and synthetic-account clicks
autonomously on 2026-11-17. Preserve the running development and manual M1 stacks.

## Isolated setup

Use Node 22.23.2 and `npm ci` with the existing lockfile. `scripts/studio-m2/prepare.mjs`
checks unused ports and writes a private `run.env` outside Git. Execute commands through
`scripts/studio-m2/with-env.mjs <run.env> ...`; it overrides inherited environment values
and refuses database/storage/detector endpoints outside this isolated configuration.

- Postgres: loopback 55435, database `studio_m2`.
- Authenticated S3: loopback 18335, separate `studio-m2-public`/`studio-m2-private` buckets.
- Real detector: loopback 18890, matching 16-million-pixel contract.
- Server/MCP/website: 3120/3130/5190, each explicitly configured.
- Existing manual 55434/18334/18889 and dev 3001/5173/5432/8333 are excluded.

If another M2 run holds the application ports, set `STUDIO_TEST_SERVER_PORT`,
`STUDIO_TEST_MCP_PORT` and `STUDIO_TEST_WEB_PORT` when running `prepare.mjs`.
It records the selected loopback ports in `run.env`. The database, storage and
detector still require their isolated ports to be free.

Run the wrapper's `compose up -d --build --wait`, Prisma `migrate deploy` in the server
workspace, then `node scripts/studio-m2/buckets.mjs`. Both storage modes remain covered
by the repository tests; M2 browser/host integration uses actual private S3.

Run `browser/studio-preparation.spec.ts` with `playwright.studio-m2.config.ts`. The
browser test server uses committed synthetic attachment bytes and the real persistence,
storage and detector. The bridge simulates the host. For Studio intake regressions, run
`STUDIO_BROWSER_TEST=1 npx playwright test browser/studio-intake.spec.ts --project=<project>`
one project per invocation to stay within the OAuth registration allowance. Use
`fnm exec --using=22.23.2` for each Node, npm and npx command.

## Exact actual ChatGPT test

1. Record the code commit, content-hashed resource URI, dependency versions, host surface,
   model label and original SHA-256/dimensions. Use `browser/fixtures/studio-preparation.png`
   and `browser/fixtures/studio-token.png`. No private account artwork.
2. Stop the owned browser fixture servers. Launch the normal server entrypoint, MCP and
   website with explicit M2 configuration. The normal server must use the real bounded
   remote downloader, not `studioPreparationServer.ts`.
3. Start one owned temporary HTTPS tunnel to the isolated website. Configure its exact origin
   as `STUDIO_PUBLIC_ORIGIN` on server/MCP and `CLIENT_ORIGIN` on server; proxy `/mcp`
   to 3130. Use the appropriate secure-cookie setting for HTTPS. Do not change DNS/production.
4. Create a new synthetic Session Zero owner/build and enable grid/walls/terrain choices
   through that owner's website/API. Keep real user accounts and the manual stack untouched.
5. In a dedicated ChatGPT tab, set the temporary personal plugin URL to the current isolated
   stack's tunnel origin plus `/mcp/studio`. Update `Session Zero Studio M2 Manual` or
   recreate the temporary connection if it still points at the previous tunnel. Refresh
   tools and use a new `studio_open` call to load the current tool list and resource.
   Complete Session Zero discovery/DCR/sign-in and consent to only the synthetic build.
   Inspect owner/build identity. Keep legacy passes out of the prompt.
6. Attach both original fixtures through ChatGPT's composer. Ask: "Open Session Zero Studio
   for this build with these originals before preparing anything. Keep the view open."
   Confirm the protected source and each file's saved outcome. Independently compare stored
   hashes/dimensions with the committed originals. Confirm the Studio offers chat attachment
   guidance and opens the signed-in owner's existing `/builds/:buildId` upload page as the
   fallback. Verify the file-link visibility notice beside the website option using only
   synthetic art. A refused attachment offers both paths in the current language. An
   expired link asks the user to attach the original again in chat.
7. Ask the model to inspect the original and grid overlay, check the real detector suggestion,
   save a map and explicitly select it. Save walls, a door/window, permanent Difficult and
   Blocked terrain, synthetic creatures using the supplied art, and visible/hidden placements.
   Unknown sheet values stay blank/flagged. Use existing deterministic builder tools and
   `studio_set_context`; no backend authoring model, room credential or publication.
8. Observe the already-open view after each saved batch without returning to the website.
   Record save-to-display latency, real detector result and app/backend traffic separately.
   Confirm effective doorway cuts, terrain patterns and art/hidden/footprint cues. Pan/zoom
   and focus a control before a later batch; neither camera nor focus should reset.
9. Exercise English/zh-TW, inline/expanded mode when offered, close/reopen and saved recovery.
   Compare the owner's website saved Studio with the same backend context. Rejected writes
   retain the previous overlay and show their real permission/validation/lock/quota outcome.
   Connection Retry must not falsely claim it reruns grid detection.
10. Keep redacted synthetic screenshots/measurements and the exact revision/resource. Label
    unavailable interactions pending. A model's verbal claim, scripted bridge, tool
    acknowledgement or previous M1 host evidence does not complete this test.

## Cleanup and user retest

Remove only the temporary M2 ChatGPT connection and synthetic Session Zero owner/builds;
verify private files/context/outcomes/grants are removed. Synthetic ChatGPT chats/files may
remain in provider history/Library, distinct from Session Zero retention. Stop the owned
tunnel/server/MCP/Vite and smoke container, then the wrapper's `compose down -v` for its exact
project. Remove only its generated private configuration directory after evidence is redacted.
The active manual/development stacks and existing ChatGPT connections remain unchanged.

For the next user test, use the M2 branch in its isolated worktree. Repeat this setup with
fresh disposable Postgres/S3, the real detector, synthetic files and a fresh tunnel.
Update the ChatGPT plugin URL to that tunnel before refreshing tools.
