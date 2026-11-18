# Testing

## Suites

| Suite | Location | Runner | Approx. cases | What it covers |
| --- | --- | --- | --- | --- |
| Shared kernel | `packages/shared/test` | Vitest | 1,240 | `decide`, `reduce`, filters, movement, sight, dice, activity log |
| Server | `apps/server/test` | Vitest | 1,000 | Multi-client integration over real sockets, REST routes, stores, rate limits |
| Web | `apps/web/test` | Vitest | 1,690 | Components, board helpers, the sync client, the lint guard |
| MCP | `apps/mcp/test` | Vitest | 210 | AI seat and build tools against a test room server |
| Vision | `services/vision` | Python `unittest` | 50 | Grid and wall detection |
| Browser | `browser/` | Playwright | specs | UVTT import, grid detection, scenes, terrain, guest tutorial, security headers |
| Latency bench | `apps/server/test/ephemeralLatency.test.ts` | Vitest | 1 | Ephemeral round-trip time; runs last in `npm test` |

## Commands

```bash
npm test                                              # every Vitest suite, then the bench
npm test --workspace=@vtt/server -- -t "reconnect"    # one test by name
npm test --workspace=@vtt/shared                      # one workspace
npm run test:bench --workspace=@vtt/server            # the latency bench alone
npm run test:browser                                  # Playwright (starts its own servers)
```

The Postgres store tests skip themselves unless `DATABASE_URL` is set:

```bash
DATABASE_URL=postgres://vtt:vtt@localhost:5432/vtt npm test --workspace=@vtt/server
```

## Writing a shared unit test

`packages/shared/test/fixtures.ts` gives you a room with a GM (`gm`) and two players
(`alice`, `bob`), a deterministic context, and helpers:

| Helper | Does |
| --- | --- |
| `baseRoom()` | A room with the three participants joined |
| `withToken(state, partial)` | Adds a token and returns `{ state, token }` |
| `run(state, actor, command)` | Runs `decide` + `reduce` and returns `{ state, events }`; throws if the command is refused |
| `attempt(state, actor, command)` | Runs `decide` only; returns the decision so you can check a refusal |
| `resetRandom()` | Resets the fixed dice sequence; call it in `beforeEach` |

```ts
describe("table rules: changing them (FR-GM-15)", () => {
  it("lets only the GM change a rule", () => {
    const state = baseRoom();
    expect(attempt(state, alice, { type: "room.setHideHp", enabled: true }))
      .toMatchObject({ ok: false, code: "forbidden" });
    const { events } = run(state, gm, { type: "room.setHideHp", enabled: true });
    expect(events).toHaveLength(1);
  });
});
```

For anything hidden, assert both filters: `filterStateForViewer(state, alice)` and
`filterEventForViewer(...)` for each event.

## Writing a server integration test

`apps/server/test/helpers.ts` starts a real server with in-memory stores:

```ts
let server: Awaited<ReturnType<typeof startServer>>;
beforeEach(async () => { server = await startServer(); });
afterEach(async () => { await server.close(); });

it("shows a player's drawing to everyone", async () => {
  const gmCreds = await server.createRoom();
  const aliceCreds = await server.join(gmCreds.inviteCode, "Alice");
  const gm = await server.connect(gmCreds);
  const alice = await server.connect(aliceCreds);
  // ...
  const reply = await alice.command({ type: "drawing.add", drawing });
  await gm.waitForSeq((reply as { seq: number }).seq);
  expect(Object.values(gm.state.drawings)).toHaveLength(1);
});
```

`TestClient` keeps `rawLog`, every raw payload it received. Search it to prove a secret never
reached a player, not only that it's missing from their state.

## Conventions

- Put the requirement ID in the `describe` name, for example `(FR-PL-02)`.
- Tests must be deterministic. Use the fixtures' `ctx` and `resetRandom()`, never real time
  or randomness in the kernel.
- A bug fix comes with a test that fails without the fix.
- Run `npm run lint && npm run typecheck && npm test` before declaring work done.

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs on every push to `main` and every PR:
install → Prisma client → lint → typecheck → tests → vision tests → build → boot the server
and poll `/health`. A separate job builds the production images, and an audit step fails on
new high or critical advisories in production dependencies (`npm run audit`).
