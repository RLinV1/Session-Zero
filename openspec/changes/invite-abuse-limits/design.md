# Design

The decisions, budgets and rejected alternatives are in [ADR 0051](../../../docs/adr/0051-seat-limits-and-room-lock.md). This records how the budgets were checked against existing features.

## What the client can send quickly

Checked against every command type the web client sends, for both loops and input that repeats by itself.

| Feature | Who | Fastest rate or largest burst | Budget |
|---|---|---|---|
| Move with arrow keys (`Board`), on by default | Player | About 33 `token.move` a second at the fastest key repeat, one in flight at a time | 800 per 20 seconds, 1,800 per 5 minutes |
| Multi-target attack (`AttackPanel`) | Player | 10 `dice.roll` (`MAX_ATTACK_TARGETS`) | The same |
| Clicked actions: dice, doors, HP, templates | Player | One per click | The same |
| Make imported openings doors (`WallSetup`) | GM | 1,500 (`MAX_WALLS`), sent as acks return | 3,000 per 30 seconds |
| Hide or show a group (`GroupHeading`) | GM | One per token in the group | 3,000 per 30 seconds |
| Save a map draft (`GmPanel`) | GM | One `scene.savePreparation` | 3,000 per 30 seconds |

Token drags are live messages until the drop. Each browser tab opens one socket for the room.

## Behaviour that changes for ordinary use

- Commands: none in normal play. Only someone keeping a token moving nonstop for nearly a minute would see a refusal.
- A ninth tab or device on one seat closes the oldest, which shows a screen asking to reload.
- A seat's tabs share one live-message allowance rather than one each. Only the tab in use normally sends any.
