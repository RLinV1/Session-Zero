## Decisions

- **Shape:** `Scene.isometric?: boolean`, absent = flat. Mirrors `Scene.lineOfSight` (ADR 0044) so the editor draft, save plan, undo and old-event parsing follow a proven path. A boolean, not a `projection` enum: there are two styles and no third is planned; widening later is a new ADR.
- **Command/event:** `scene.setIsometric { enabled }` (GM only) and `IsometricSet { from, to }`; rejects a no-op. Carries `from` per invariant 6; undo is the swapped event.
- **Visibility:** public scene flag; the event passes to players unchanged.
- **Scope:** only the flag and its editor control. The board does not render differently yet.
