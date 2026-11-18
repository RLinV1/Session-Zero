# Session Zero Developer Guide

This guide is for people changing the code. It complements, and doesn't repeat:

- [`../../README.md`](../../README.md): the product specification and requirement IDs (FR-…).
- [`../DESIGN.md`](../DESIGN.md): architecture, stack, data model, what's built, and the ADR index.
- [`../../CLAUDE.md`](../../CLAUDE.md): the short list of commands, invariants and conventions.

## Guides

| Guide | Read it when |
| --- | --- |
| [Setup](setup.md) | You're setting up a machine, or the dev server won't start |
| [Architecture tour](architecture.md) | You need to know where something lives and how a command becomes state |
| [Adding a feature](adding-a-feature.md) | You're adding a command, an event, or anything players can see |
| [Testing](testing.md) | You're writing tests, or a test fails and you need to know which suite |
| [Localization](localization.md) | You're adding text people read, in the web app or the server |
| [Workflow](workflow.md) | You're planning a change, writing an ADR, or opening a PR |

Production deployment is covered in [`../DEPLOYMENT.md`](../DEPLOYMENT.md) and
[`../EDGE-PROTECTION.md`](../EDGE-PROTECTION.md).

## The eight invariants

Every change is reviewed against these. They are copied from `CLAUDE.md` so this guide stands
on its own.

1. Persistent state changes **only** via `Command` → `decide()` → events → `store.append` → `reduce()` → broadcast.
2. `reduce` and `decide` are pure and deterministic: no `Date`, `Math.random` or I/O. IDs come from `DecideContext.newId`.
3. Every payload to a client that holds room data goes through `filterStateForViewer` / `filterEventForViewer`.
4. Ephemeral messages (pings, previews, rulers, area aim) are never persisted and never get a seq.
5. Events are append-only. Undo is a new compensating event.
6. Events that change existing data carry the replaced value (`previous`, `from`, the full deleted entity).
7. Authorization is decided on the server. Client-side `can.*` checks are UI hints only.
8. Board positions are board coordinates (map image pixels), never screen pixels.

## Before you say a task is done

```bash
npm run lint && npm run typecheck && npm test
```
