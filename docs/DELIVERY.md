# Delivery Plan — Session Zero

Part of the [design document](DESIGN.md) — see also [`INTERFACE.md`](INTERFACE.md) and
[`FRONTEND-CONTRACT.md`](FRONTEND-CONTRACT.md).

Slice sequencing, dependency order, task split and cut order for the three feature
milestones. `DESIGN.md` §6 records what is actually built; this document records the order
in which the rest arrives.

> Section numbers (§8.x) are kept from when this was `DESIGN.md` §8, so existing references
> in commits, ADRs and pull requests still resolve.

---

## 8.1 A note on names

"M1/M2/M3" is overloaded: the course has its own milestones, and README §12 has feature milestones. To avoid collision, this section refers to the feature milestones by name — **Core Loop**, **Tactical Play**, **Stretch** — never by number. This document is the artifact for the *course's* M2.

## 8.2 How the work splits

Ownership follows the workstreams in README §10. Each requirement gets **one primary owner** — the person who decides how it works and whose name is on it — and optionally a supporting owner for the surface they do not control.

| Person | Workstream | Owns the surface |
| --- | --- | --- |
| **Antonio Cottone** | Board and Canvas Interaction | Pixi renderer, coordinate system, viewport, token rendering, tactical overlays |
| **Raymond Lin** | Real-Time Architecture & Persistence | Schema, room kernel, sockets, identity, authorization, visibility filtering, event log |
| **Christos Psimadas** | Map Processing & AI Pipelines | Upload pipeline, grid detection, UVTT, wall/portal geometry, analysis service |
| **Vincent Chen** | Online UX & Product Quality | Join flow, player-safe layouts, encounter panels, accessibility, cross-browser + convergence testing |

**The contract that makes parallel work safe.** `packages/shared` — protocol types and the pure kernels — is agreed and frozen in Slice 0. Everyone imports it; nobody redefines a payload shape locally. Changes to it are a pull request the whole team reviews, because a silent change there desyncs three workstreams at once.

---

## 8.3 Core Loop (README §12 M1) — 18 requirements

The prototype already covers the three requirements rated **High** difficulty — FR-PL-06, FR-SYNC-02, FR-SYNC-04 — because those are the expensive ones to retrofit. What remains is mostly breadth.

## Dependency order

```
                    ┌────────────────────────┐
                    │ Slice 0: Foundations   │  blocks everything
                    │ Postgres/Redis/SeaweedFS,  │
                    │ schema, workspace split│
                    └───────────┬────────────┘
                                │
          ┌─────────────────────┼─────────────────────┐
          ▼                     ▼                     ▼
 ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
 │ Slice 1          │  │ Slice 2          │  │ Slice 3          │
 │ Identity & rooms │  │ Map pipeline     │  │ Board renderer   │
 │ (Raymond+Vincent)│  │ (Christos)       │  │ (Antonio)        │
 └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘
          │                     │                     │
          └──────────┬──────────┴─────────────────────┘
                     ▼
          ┌────────────────────────┐
          │ Slice 4: Tokens & roles│
          │ (Antonio + Vincent)    │
          └────────────────────────┘
```

Slices 1–3 run **in parallel** across three workstreams.

## The slices

**Slice 0 — Foundations** · Raymond · blocks everything else

| Work | Requirements |
| --- | --- |
| Docker Compose: Postgres, Redis, SeaweedFS | — |
| Prisma schema from `DESIGN.md` §5, with migrations | — |
| Workspace split: `apps/web`, `apps/server`, `services/map-analysis`, `packages/shared` | — |
| Move the prototype's in-memory room onto Postgres + Redis `INCR` | FR-SYNC-01, FR-SYNC-02, FR-SYNC-04 |
| Event-log writes on every committed action | FR-REC-03 (early, cheap now) |

Writing the event log now rather than during Tactical Play costs almost nothing and means undo is later a *read* problem, not a migration.

**Slice 1 — Identity and rooms** · Raymond (server), Vincent (join UX)

| Work | Requirements | Owner |
| --- | --- | --- |
| GM registration/login, argon2id, opaque session cookie | FR-GM-01 | Raymond |
| Room creation + invite code generation | FR-PL-01 | Raymond |
| Join screen: display name, token issue, error states | FR-PL-01 | Vincent |
| Guest token rebind against `participants` | FR-PL-02 | Raymond |
| Reconnect rebinding + snapshot on resume | FR-PL-05, FR-PL-06 | Raymond |

**Slice 2 — Map pipeline** · Christos

| Work | Requirements |
| --- | --- |
| Map upload → S3 object storage, served from a separate origin | FR-GM-02 |
| **Manual** grid alignment UI (cell size, offset, nudge) | FR-GM-04 |
| Grid metadata stored in board coordinates | FR-GM-05 |
| Automatic detection via BullMQ → analysis service, with confidence | FR-GM-03 |

**Sequencing matters here:** build the *manual* alignment path first. It is low difficulty, it makes the map flow usable on its own, and it means automatic detection is an enhancement that can slip without blocking anyone.

**Slice 3 — Board renderer** · Antonio

| Work | Requirements |
| --- | --- |
| Replace the plain-DOM board with PixiJS v8 | — |
| Independent per-client pan and zoom | FR-TAC-01 |
| Continuous coordinates with optional grid snapping | FR-TAC-02 |
| 100-token / 60 FPS benchmark against README §6 | NFR gate |

Run the benchmark **early**, not at the end. It is the one number that can invalidate the PixiJS-vs-Konva decision, and finding that out in week 4 is recoverable while week 11 is not.

**Slice 4 — Tokens and roles** · Antonio (board), Vincent (panels)

| Work | Requirements | Owner |
| --- | --- | --- |
| Token upload, placement, size, rotation, HP bars | FR-GM-08 | Antonio |
| GM assigns token ownership to participants | FR-GM-10 | Vincent |
| Owner-only control wired to real participant IDs | FR-PL-04 | Raymond |
| Responsive player-safe board layout | FR-PL-03 | Vincent |

## Task split — Core Loop

| Owner | Requirements |
| --- | --- |
| Antonio | FR-GM-05, FR-GM-08, FR-TAC-01, FR-TAC-02 |
| Raymond | Slice 0, FR-GM-01, FR-PL-02, FR-PL-04, FR-PL-05, FR-PL-06, FR-SYNC-01, FR-SYNC-02, FR-SYNC-04 |
| Christos | FR-GM-02, FR-GM-03, FR-GM-04 |
| Vincent | FR-PL-01 (UX), FR-PL-03, FR-GM-10 |

---

## 8.4 Tactical Play and GM Control (README §12 M2) — 18 requirements

This is where the product stops being a shared map and becomes a tabletop. Two things gate everything else: the ephemeral channel, and the renderer landing in Core Loop Slice 3.

## Dependency order

```
  ┌──────────────────────────┐
  │ Slice 5: Ephemeral channel│  blocks every live preview
  │ (Raymond)                 │
  └────────────┬──────────────┘
               │
   ┌───────────┼────────────────────────┐
   ▼           ▼                        ▼
┌────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│ Slice 6        │ │ Slice 7          │ │ Slice 8          │
│ Roles, hidden  │ │ Tactical overlays│ │ Encounter panels │
│ info, fog      │ │ (Antonio)        │ │ (Vincent)        │
│ (Raymond+A+V)  │ │                  │ │                  │
└───────┬────────┘ └──────────────────┘ └──────────────────┘
        │
        ▼
┌────────────────────┐
│ Slice 9: Recovery  │  needs the event log from Slice 0
│ (Raymond)          │
└────────────────────┘
```

## The slices

**Slice 5 — Ephemeral channel** · Raymond · blocks Slice 7

| Work | Requirements |
| --- | --- |
| Second socket namespace using `volatile.emit`, never persisted | FR-SYNC-03 |
| Client-side throttling and coalescing of pointer traffic | FR-SYNC-03 |
| Latency benchmark against the 150 ms target (README §6) | NFR gate |

Build this before any overlay that previews. Retrofitting preview traffic onto the committed channel is the mistake that makes a VTT feel laggy, and it is much harder to unpick later than to separate now.

**Slice 6 — Roles, hidden information, fog** · Raymond (server), Antonio (fog rendering), Vincent (GM controls)

| Work | Requirements | Owner |
| --- | --- | --- |
| Role model formalized on `participants` | FR-GM-14 | Raymond |
| Per-message authorization on every GM-only intent | FR-GM-15 | Raymond |
| Hidden-token state and server-side payload filtering | FR-GM-16, FR-GM-23 | Raymond |
| Fog region state on the committed channel | FR-GM-17 | Raymond |
| Fog painting and masked rendering | FR-GM-17 | Antonio |
| GM visibility controls (hide/reveal UI) | FR-GM-16 | Vincent |

FR-GM-23 is rated **High** and deserves it: the test is that a player's payload never *contains* hidden data, not that the client declines to draw it. Vincent's automated harness should assert this against API responses, socket frames, and reconnect snapshots alike (README §8).

**Slice 7 — Tactical overlays** · Antonio · needs Slice 5

| Work | Requirements |
| --- | --- |
| Movement budget ruler with diagonal rules and thresholds | FR-TAC-03 |
| Line/rect/circle drawing overlays | FR-TAC-04 |
| Target pings (ephemeral, animated, self-expiring) | FR-TAC-05 |
| AoE templates: preview on ephemeral, placement on committed | FR-TAC-06 |

FR-TAC-06 is the one to watch — it straddles both channels. Aiming is ephemeral; the placed template is committed state. Getting that boundary right is the slice's real work.

**Slice 8 — Encounter panels** · Vincent

| Work | Requirements |
| --- | --- |
| Initiative list, shared and synced, add/remove/reorder | FR-GM-21 |
| Dice expression parser (`NdX + M`) and roller | FR-TAC-09 |
| Public vs GM-only roll routing | FR-GM-22 |
| Token stats and condition display | FR-TAC-07 |
| Condition markers distinguished by shape/text, not colour alone | FR-TAC-08 |

Dice are rolled **server-side**. A client-side roll that reports its own result is unverifiable, which defeats the point of shared rolls.

**Slice 9 — Recovery** · Raymond · needs the event log from Slice 0

| Work | Requirements |
| --- | --- |
| Plain-language rendering of the event log with actor attribution | FR-REC-01 |
| Compensating-event undo for a defined reversible set | FR-REC-02 |
| Append-only guarantee enforced at the database level | FR-REC-03 |
| Checkpoint save/restore as the universal fallback | FR-REC-02 support |

Start by making **only token moves** reversible. It is the easiest action to compensate and it exercises the whole mechanism; widening the reversible set afterwards is incremental. README §11 rates surprising undo desyncs as the project's top risk, so the mitigation is a small reversible set plus checkpoint restore as the escape hatch.

## Task split — Tactical Play

| Owner | Requirements |
| --- | --- |
| Antonio | FR-GM-17 (rendering), FR-TAC-03, FR-TAC-04, FR-TAC-05, FR-TAC-06 |
| Raymond | FR-GM-14, FR-GM-15, FR-GM-16, FR-GM-17 (state), FR-GM-23, FR-SYNC-03, FR-REC-01, FR-REC-02, FR-REC-03 |
| Christos | *(light — see §8.6)* |
| Vincent | FR-GM-16 (UI), FR-GM-21, FR-GM-22, FR-TAC-07, FR-TAC-08, FR-TAC-09 |

---

## 8.5 Stretch (README §12 M3) — 11 requirements

Everything here is cut-first material. The ordering below is by dependency, and §8.5's cut order is by effort-to-value.

## Dependency order

```
┌───────────────────────────┐
│ Slice 10: Wall data       │  nothing below works without wall geometry
│ UVTT import + validation  │
│ + manual wall editing     │
│ (Christos, Antonio)       │
└─────────────┬─────────────┘
              │
      ┌───────┴────────┐
      ▼                ▼
┌──────────────┐  ┌─────────────────┐     ┌──────────────────────┐
│ Slice 11     │  │ Slice 12        │     │ Slice 13             │
│ Vision       │  │ Portals + LoS   │     │ Quality of life      │
│ pipeline     │  │ (Antonio+Ray)   │     │ (Raymond, Vincent)   │
│ (Christos)   │  │                 │     │ — independent        │
└──────────────┘  └─────────────────┘     └──────────────────────┘
```

Slice 13 depends on nothing and can be pulled forward whenever someone has slack.

## The slices

**Slice 10 — Wall data foundation** · Christos (parsing), Antonio (editor)

| Work | Requirements | Owner |
| --- | --- | --- |
| UVTT / `.dd2vtt` import: image, grid, walls, portals | FR-GM-06 | Christos |
| Malformed-file reporting that names the problem | FR-GM-07 | Christos |
| Wall/portal segment editing on canvas, door state marking | FR-GM-09 | Antonio |

Import lands before detection deliberately: it gives the team real wall data to build portals and line-of-sight against without waiting on the CV pipeline.

**Slice 11 — Vision pipeline** · Christos

| Work | Requirements |
| --- | --- |
| OpenCV wall extraction adapted from prior art (`DESIGN.md` §7) | FR-GM-11 |
| Door/window classification | FR-GM-11 |
| UVTT export round-trip | FR-GM-12 |

Detected geometry is always **suggested**, never applied — the GM reviews before it affects visibility (README §11).

**Slice 12 — Portals and line of sight** · Antonio (rendering), Raymond (state)

| Work | Requirements | Owner |
| --- | --- | --- |
| Open/closed/locked portal state on the committed channel | FR-GM-18 | Raymond |
| 2D raycast visibility from wall and portal segments | FR-GM-19 | Antonio |
| Per-player visibility masking in the renderer | FR-GM-19 | Antonio |

The single highest-risk item in the project. It needs Slice 10's geometry, the Pixi masking proven in Core Loop Slice 3, and per-player filtering from Tactical Play Slice 6 — three dependencies, which is exactly why it is stretch.

**Slice 13 — Quality of life** · Raymond, Vincent · no dependencies

| Work | Requirements | Owner |
| --- | --- | --- |
| Reusable encounter templates | FR-GM-13 | Raymond |
| Replay from a checkpoint for late joiners | FR-PL-07 | Raymond |
| Guest revocation and invite regeneration | FR-GM-20 | Raymond |
| Focusable token roster panel | FR-GM-24 | Vincent |

## Task split — Stretch

| Owner | Requirements |
| --- | --- |
| Antonio | FR-GM-09, FR-GM-19 |
| Raymond | FR-GM-13, FR-GM-18, FR-GM-20, FR-PL-07 |
| Christos | FR-GM-06, FR-GM-07, FR-GM-11, FR-GM-12 |
| Vincent | FR-GM-24 |

## Cut order

If the schedule tightens, drop in this order — highest effort and most open-ended first:

1. **FR-GM-11** vision-based parsing — README §12 already names it the first to drop; UVTT import covers the same need with a manual step
2. **FR-GM-19** dynamic line of sight — three dependencies, High difficulty
3. **FR-GM-13**, **FR-PL-07** — convenience, not correctness
4. **FR-GM-12** UVTT export, **FR-GM-24** roster — low effort, keep if anything survives

---

## 8.6 Load across the team

| Owner | Core Loop | Tactical Play | Stretch | Total |
| --- | --- | --- | --- | --- |
| Antonio | 4 | 5 | 2 | 11 |
| Raymond | 9 + Slice 0 | 9 | 4 | 22 |
| Christos | 3 | 0 | 4 | 7 |
| Vincent | 3 | 6 | 1 | 10 |

**Two imbalances worth fixing now rather than in week 8.**

*Raymond carries roughly twice anyone else.* That is structurally true — authorization, sync, identity and recovery are one coherent problem and splitting them across people creates more coordination cost than it saves. Mitigations: Vincent already owns the GM-facing UI for FR-GM-16 and FR-GM-10, and FR-GM-13/FR-GM-20 in Stretch are self-contained enough to hand to whoever has slack.

*Christos has nothing in Tactical Play.* His work is bunched into Core Loop and Stretch, leaving an idle middle. Two options: pull **Slice 10 (UVTT import) forward** into the Tactical Play window — it has no dependency on tactical features and de-risks the whole Stretch milestone — or have him take the automated convergence test harness from README §8, which needs building around then anyway.

## 8.7 Definition of done for a slice

A slice is done when all four hold:

1. Unit tests cover the pure logic it introduced (README §8 names grid math, coordinate transforms, dice parsing, schema parsing).
2. A Playwright test drives the flow across **two browser contexts** where the requirement is multi-user.
3. CI is green — lint, test, build, health smoke.
4. Its requirement IDs move from `D` to `B` in the `DESIGN.md` §6 matrix, honestly.

## 8.8 Sequencing traps to avoid

| Trap | Why it bites | Avoidance |
| --- | --- | --- |
| Building auth last | Everything downstream needs `participants.id` to reference | Slice 1 immediately after foundations |
| Auto grid detection before manual alignment | A flaky CV pipeline blocks the playable path | Manual first, detection as enhancement |
| Deferring the Pixi perf benchmark | Renderer choice becomes unchangeable | Benchmark in the first week of Slice 3 |
| Letting slices diverge on protocol shapes | Painful merges when they converge | Freeze `packages/shared` types in Slice 0 |
| Adding the event log during Tactical Play | Becomes a data migration | Write events from the first committed action |
| Overlays before the ephemeral channel | Preview traffic ends up on the committed path and is painful to unpick | Slice 5 before Slice 7 |
| Line of sight before wall data | Nothing to raycast against | Slice 10 before Slice 12 |
| Making everything undoable at once | Undo desyncs are the top project risk | Token moves first, widen incrementally |

---

