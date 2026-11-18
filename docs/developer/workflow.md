# Workflow

## Planning a change with OpenSpec

The team plans changes in `openspec/`:

| Folder | Holds |
| --- | --- |
| `openspec/specs/<capability>/` | The accepted behaviour of each capability, as requirements and scenarios |
| `openspec/changes/<change>/` | A change in progress: `proposal.md` (why, what), `design.md` (how), `tasks.md`, and delta specs |
| `openspec/changes/archive/<date>-<change>/` | Finished changes, kept for history |

The usual cycle, with the matching slash commands in Claude Code:

1. **Explore** an idea or problem: `/opsx:explore`.
2. **Propose** a change with every artifact: `/opsx:propose`.
3. **Apply** it, working through `tasks.md`: `/opsx:apply`.
4. **Archive** it when done, which syncs its delta specs into `openspec/specs/`: `/opsx:archive`.

Each archived change's proposal records why it was made. [`../PLAYTEST-FEEDBACK.md`](../PLAYTEST-FEEDBACK.md)
links playtest requests to the changes that resolved them.

## Architecture decision records

Write an ADR in `docs/adr/` when you:

- change an existing schema in `packages/shared` (required, with Real-Time Architecture review);
- add a kind of hidden information, or change who sees what;
- change how events are stored, read or ordered;
- make a decision a later developer would otherwise undo by accident.

Name it `NNNN-short-title.md` with the next free number. Check `docs/adr/` on `main` first:
parallel branches have reused numbers before (0033, 0036, 0038, 0045, 0046, 0050, 0069). Start
with a status line (`Proposed`, `Accepted`), what it extends or amends, and the requirement
IDs. Add it to the index in [`../DESIGN.md`](../DESIGN.md) §8.

## Branches, commits and pull requests

- Branch from `main`: `feat/…`, `fix/…`, `docs/…`, `chore/…`.
- Commit messages use conventional prefixes and the requirement ID:
  `feat: attack range, arrow and pierce animations (FR-TAC-09)`.
- PR titles carry the FR ID too.
- Before opening a PR: `npm run lint && npm run typecheck && npm test`.

## Review agents

`.claude/agents/` holds two reviewers to run on relevant PRs:

| Agent | Run it on | Checks |
| --- | --- | --- |
| `sync-reviewer` | Anything touching state, commands, events, the server pipeline or the sync client | State changed outside `reduce`, non-determinism, missing undo data, ordering problems |
| `visibility-auditor` | Anything touching `packages/shared` or `apps/server`, or adding state | Paths that could leak GM-only information to players |

## Keeping the docs current

| When you… | Update |
| --- | --- |
| Ship a feature people use | [`../user/`](../user/) and [`../DESIGN.md`](../DESIGN.md) §4 |
| Add a command or event | The command table in [`../DESIGN.md`](../DESIGN.md) §1 |
| Add hidden information | [`../DESIGN.md`](../DESIGN.md) §5 *Visibility* and [Architecture tour](architecture.md) |
| Add an ADR | [`../DESIGN.md`](../DESIGN.md) §8 |
| Fix something from a playtest | [`../PLAYTEST-FEEDBACK.md`](../PLAYTEST-FEEDBACK.md) |
| Add an environment variable | [Setup](setup.md) and `deploy/env.production.example` |
