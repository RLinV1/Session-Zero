# Spec Delta

## Purpose

Lets participants draw lines, rectangles, circles and freehand strokes on the board that the whole table sees and that persist with the scene, for communicating tactical plans and marking locations (FR-TAC-04).

## ADDED Requirements

### Requirement: Drawings are shared with the table
A line, rectangle, circle or freehand stroke an active participant makes with the Draw tool SHALL be saved to the active scene and shown on every participant's board, in the colour the drawer chose from the Draw tool's colours. Drawings SHALL survive a reload or reconnect, and a participant who joins later SHALL see the drawings already on the scene. Every participant, the GM and players alike, SHALL see every drawing; there are no private drawings. Board positions SHALL be in map coordinates, so a drawing stays over the same spot of the map for every viewer whatever their pan and zoom. Rulers and measurements SHALL stay local to the viewer.

#### Scenario: Another player sees a drawing
- **WHEN** player A draws a red circle around a doorway
- **THEN** player B and the GM see the same red circle around the same doorway

#### Scenario: Late joiner
- **WHEN** a player joins after drawings have been made on the active scene
- **THEN** their board shows those drawings

#### Scenario: Reload
- **WHEN** a participant reloads the room page
- **THEN** every drawing on the active scene is still shown

### Requirement: Drawings are drawn above fog and darkness
Drawings SHALL be drawn above the map, tokens, fog and line-of-sight darkness, and SHALL NOT be clipped by fog or by any viewer's sight. A drawing made over a fogged or dark part of the map SHALL be visible to every participant there.

#### Scenario: GM marks a fogged area
- **WHEN** the GM draws a rectangle over a region still under fog
- **THEN** every player sees the rectangle drawn over the fog

#### Scenario: Line into darkness
- **WHEN** line of sight is on and a player draws a line that runs out of their sight
- **THEN** the whole line is shown on every board, including the part over darkness

### Requirement: Freehand strokes are simplified and bounded
A freehand stroke SHALL be simplified before it is sent, keeping its visible shape while dropping redundant points, with each point rounded to a whole map pixel. The server SHALL reject a drawing whose stroke has more than 500 points, a point that is not a whole number within the map's bounds, or, for a line, rectangle or circle, an endpoint outside those bounds. The server SHALL also reject a drawing that would take the active scene past 20,000 drawing points in total (lines, rectangles and circles count as 2 points each) or past 300 drawings. A rejected drawing SHALL NOT be saved, and the drawer SHALL see a message in their language saying the board has too many drawings to add another, or that the drawing is invalid.

#### Scenario: Long freehand stroke
- **WHEN** a player draws a long, wiggly freehand stroke
- **THEN** every board shows a stroke that follows the same path, and the saved stroke has at most 500 points

#### Scenario: Scene full
- **WHEN** the active scene already holds 20,000 drawing points and a player draws another line
- **THEN** the line is not saved, it does not appear on any board, and the player sees a message to erase some drawings first

#### Scenario: Forged stroke
- **WHEN** a client sends a stroke with 5,000 points or a point off the map
- **THEN** the server rejects it and nothing is saved or broadcast

### Requirement: The eraser removes drawings for their owner or the GM
Passing the Eraser over a drawing SHALL remove it for everyone when the eraser's user drew it or is the GM. A player's eraser SHALL leave other participants' drawings in place. The server SHALL reject removing a drawing the participant may not remove, or one that no longer exists, and SHALL save nothing. One eraser sweep SHALL remove each drawing at most once. A removed drawing SHALL be recorded with all its data, so the history keeps what was erased.

#### Scenario: Erasing your own drawing
- **WHEN** a player sweeps the Eraser over their own line
- **THEN** the line disappears from every board

#### Scenario: GM erases a player's drawing
- **WHEN** the GM sweeps the Eraser over a circle a player drew
- **THEN** the circle disappears from every board

#### Scenario: Player cannot erase someone else's drawing
- **WHEN** player B sweeps the Eraser over a rectangle player A drew
- **THEN** the rectangle stays on every board

#### Scenario: Forged removal
- **WHEN** a player's client sends a request to remove another player's drawing
- **THEN** the server rejects it and the drawing stays

### Requirement: Drawings are not undoable
Adding or erasing a drawing SHALL NOT appear among the GM's undoable actions. Undoing an action that changes only part of the board SHALL NOT add or remove drawings. Restoring a checkpoint or applying an encounter replaces the whole board: it SHALL restore the drawings as they were at that checkpoint (an applied encounter has none), and undoing it SHALL put back the drawings it replaced. As for any other board change, a drawing added or erased after such a restore SHALL stop it from being undone, so undo never silently discards a newer drawing.

#### Scenario: Undo list
- **WHEN** a player draws a line and the GM opens the activity log
- **THEN** the drawing has a log line but no undo option

#### Scenario: Checkpoint restore
- **WHEN** the GM restores a checkpoint saved before any drawings were made
- **THEN** the scene has no drawings afterwards

#### Scenario: Drawing after a restore
- **WHEN** the GM restores a checkpoint and a player then draws a line
- **THEN** the restore can no longer be undone, and the line stays

### Requirement: Drawings belong to their scene
Each scene SHALL keep its own drawings. Switching to another scene SHALL show that scene's drawings, and switching back SHALL show the first scene's drawings again. A newly created scene or a started encounter SHALL begin with no drawings.

#### Scenario: Scene switch
- **WHEN** the GM switches from a scene with drawings to a new scene and back
- **THEN** the new scene shows no drawings, and the original scene's drawings are back when it is active again

### Requirement: Drawings are logged
Each added or erased drawing SHALL add a line to the activity log naming who did it and the drawing's kind (line, rectangle, circle or freehand stroke), and for an erase made by someone other than the drawer, whose drawing it was. The line SHALL be shown in the viewer's language.

#### Scenario: GM erases a player's stroke
- **WHEN** the GM erases a freehand stroke Pat drew
- **THEN** the activity log reads that the GM erased Pat's freehand drawing
