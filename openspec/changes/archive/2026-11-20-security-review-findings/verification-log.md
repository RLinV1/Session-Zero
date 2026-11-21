# Verification — security review and board startup

## Final checks

- `npm run lint`: passed.
- `npm run typecheck`: passed, including browser tests.
- `npm run build --workspace=@vtt/web`: passed. Existing large-chunk and Zod annotation warnings remain.
- Server regressions: 31 passed across roomCreationLimits, encounterEdits and accountRateLimits; the new bypass tests failed before the lifecycle fix.
- Web font/effect tests: 32 passed. Security-header and room-refusal popup tests: 6 passed.
- Production browser checks: 3 passed in Chromium. Sign in, create a room, upload a map, place tokens, load a condition icon on demand, roll dice, join as a player, load player fog art on demand, and refuse framing from another origin. Console and page-error collectors reported no CSP violations.
- `npm run audit`: passed with the existing GHSA-ggr8-5vv4-36mx build-time exception. Raw npm audit is not clean.
- `docker compose config --quiet`: passed.
- `openspec validate security-review-findings --strict`: passed.

## Board startup measurement

The same local production-preview scenario opens a fresh board with the font-loading API deliberately stalled. These timings are a development regression measurement, not a promise about production network latency.

| Metric | Before | After |
| --- | ---: | ---: |
| Navigation to canvas | 3434 ms | 887 ms |
| Font request to canvas | 1508 ms | 215 ms |
| Completed resource requests before canvas | 98 | 29 |
| Early decorative requests | 69 | 0 |
| Completed transfer bytes before canvas | 1572841 | 921230 |

The final zero-request assertion counts browser request-start events, including pending requests, rather than relying on completed ResourceTiming entries. Font grace is now 100 ms; existing fallback labels are redrawn when fonts settle. FX textures load on first strike/nuke, condition art on first condition, and painted fog when a player sees mist. Existing vector/procedural fallbacks remain available while art loads; a first cold nuke can retain its fallback look for that run.

Reproduce in PowerShell after building:

```powershell
$env:VTT_TEST_CSP='1'
npx playwright test browser/securityHeaders.spec.ts --project=chromium-desktop
```

## Outstanding local validation

The full local suite is not green. The shared suite passed all 1766 tests. The MCP suite had 239 passed and one failure: its 300-concurrent-join forwarding test hit loopback ECONNREFUSED; it also failed in isolation. The server suite had 950 passed, 54 skipped and seven failures involving a Windows WebP file lock/500 and UVTT timeouts. An isolated one-worker rerun of eight server files had 179 passed and six failures (the same file-lock/upload and timeout classes); uvttExport passed in that rerun. These have not been established as regressions or cleared on a clean Linux runner. The draft PR records them instead of claiming a passing full suite.

The Docker daemon is unavailable locally, so the Caddy container was not started. Header syntax was checked against the Caddy directive documentation and the mirrored policy test; preview browser tests exercise the document policy. Vite applies preview headers to static responses after proxy handling, so these tests do not prove production API/upload/MCP header parity. Caddy validation and deployed-header checks remain outstanding.

The no-mistakes CLI was not available in this Windows shell; validation and publication used the repository commands and GitHub CLI directly.
