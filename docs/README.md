# Session Zero documentation

Index of everything in `docs/`. The product specification and requirement IDs (FR-...) are in
the repository [`README.md`](../README.md); commands and invariants are in
[`CLAUDE.md`](../CLAUDE.md).

## Final report (M6)

| Document | What it is |
| --- | --- |
| [FINAL-REPORT.md](FINAL-REPORT.md) | The M6 final report. |

## Users

| Document | What it is |
| --- | --- |
| [user/](user/README.md) | The user guide: getting started, running a game, playing, board tools, settings, troubleshooting. |
| [AI-PLAYERS.md](AI-PLAYERS.md) | How to connect your own AI app to hold a player seat. |
| [AI-GAME-BUILDER.md](AI-GAME-BUILDER.md) | How to have your AI app build a map, creatures and encounters for you to review. |
| [GLOSSARY-zh-TW.md](GLOSSARY-zh-TW.md) | Traditional Chinese terms used in the app. |

## Developers

| Document | What it is |
| --- | --- |
| [developer/](developer/README.md) | The developer guide: setup, architecture tour, adding a feature, testing, localization, workflow. |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Production deployment of the stack. |
| [EDGE-PROTECTION.md](EDGE-PROTECTION.md) | Edge protection and rate limiting in production. |
| [GRID-DETECTION.md](GRID-DETECTION.md) | Deploying the grid detection service. |
| [WALL-DETECTION.md](WALL-DETECTION.md) | Wall detection (FR-GM-11): pipeline and deployment. |
| [GAME_PRESETS.md](GAME_PRESETS.md) | How to add a game preset. |
| [DICE-SKINS.md](DICE-SKINS.md) | How the 3D dice are built and the proposed skin format. |
| [dice-templates/](dice-templates/) | SVG and PNG templates for dice skins. |
| [SOUND-PLAN.md](SOUND-PLAN.md) | Sound cue sheet for the board attack animations. |
| [isometric-lighting-demo.md](isometric-lighting-demo.md) | Notes on the isometric apartment lighting demo. |

## Design and ADRs

| Document | What it is |
| --- | --- |
| [DESIGN.md](DESIGN.md) | The design document: architecture, stack, data model, what is built, ADR index. |
| [adr/](adr/) | Architecture decision records, one numbered file per decision (start with 0001, 0002, 0003). |
| [INTERFACE.md](INTERFACE.md) | Interface and page design. |
| [FRONTEND-CONTRACT.md](FRONTEND-CONTRACT.md) | The contract the web client implements. |
| [DELIVERY.md](DELIVERY.md) | Delivery plan: slices, ownership and cut order. |

## QA and audits

| Document | What it is |
| --- | --- |
| [audits/](audits/) | Security, edge-protection and UI design audits (2026-10-29 to 2026-11-18). |
| [QA-checkpoint-restoration.md](QA-checkpoint-restoration.md) | Checkpoint restoration browser regression. |
| [QA-classical-grid.md](QA-classical-grid.md) | Classical grid estimate verification. |
| [classical-grid-evidence.json](classical-grid-evidence.json) | Raw measurements behind the classical grid verification. |
| [QA-condition-icons.md](QA-condition-icons.md) | Painted condition icons check (FR-TAC-08). |
| [QA-grid-preparation.md](QA-grid-preparation.md) | Grid preparation before revealing setup. |
| [QA-grid-sample.md](QA-grid-sample.md) | Two-click grid anchor verification. |
| [QA-guest-gm-hosting.md](QA-guest-gm-hosting.md) | Guest GM hosting check. |
| [QA-room-previews.md](QA-room-previews.md) | Board previews on the dashboard's hosted rooms. |
| [map-grid-audit.md](map-grid-audit.md) | Grid audit of the shipped maps and the compact demo maps. |
| [ATTACK-PERFORMANCE-REVIEW.md](ATTACK-PERFORMANCE-REVIEW.md) | Review of attack and animation performance. |

## Milestone history

| Document | What it is |
| --- | --- |
| [PROPOSAL-walking-skeleton.md](PROPOSAL-walking-skeleton.md) | Early proposal for the walking skeleton and workspace split. |
| [PLAYTEST-FEEDBACK.md](PLAYTEST-FEEDBACK.md) | Playtest requests and how each was resolved. |
| [M5-M6-product-validation.md](M5-M6-product-validation.md) | Plan and results for validating the first playable session. |
| [M5-M6-live-usability-findings.md](M5-M6-live-usability-findings.md) | Live usability findings and fixes. |
| [superpowers/](superpowers/plans/) | Implementation plans and design specs written during development (scene switching, movement ruler, lighting, scene preparation). |
