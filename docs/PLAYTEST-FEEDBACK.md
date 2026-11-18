# Playtest Feedback: Requests and Resolutions

**Source:** the team's in-person playtest notes (`docs/User_Feedback.txt`), recorded just before 2026-11-11, when work on them started.
**Status as of 2026-11-18:** all 24 items resolved.

This document turns the raw playtest notes into a formal list of requests. Each item says
what playtesters asked for, how the team resolved it, and when the fix reached `main`.
Requirement IDs refer to [`../README.md`](../README.md), ADRs to [`adr/`](adr/), and change names to
[`../openspec/changes/archive/`](../openspec/changes/archive/).

**Date fixed** is the date the change's commit landed on `main`, not the date the change was
proposed. Where a request was met by more than one change, the latest date is given and the
earlier changes are listed with it.

## Summary

| Kind | Count | Resolved | Fix window |
| --- | --- | --- | --- |
| Feature and change requests (PF-01 to PF-17) | 17 | 17 | 2026-11-11 to 2026-11-13 |
| Bug reports (PB-01 to PB-07) | 7 | 7 | 2026-11-11 to 2026-11-16 |

---

## 1. Feature and Change Requests

### PF-01: Preview attack animations before choosing one

- **Request.** When assigning an animation to an attack, the GM should be able to see each animation, not just a list of names.
- **Resolution.** The attack editor previews the chosen animation. Built-in animations show untagged; animations from the GM's library are tagged as custom. The library's animation editor already had a live preview.
- **Change.** `attack-range-and-animations` (commit `719ccf25`), ADR 0067. FR-TAC-09.
- **Date fixed.** 2026-11-13

### PF-02: Terrain brush that matches the other board tools

- **Request.** Painting terrain should work like the other board tools, and should place and remove Difficult (double-movement) and Blocked terrain.
- **Resolution.** A **Terrain** tool on the board's tool rail replaces the separate terrain modal. It paints straight onto the live board with a brush or a rectangle. Its paints are Normal (erases), Difficult and Blocked. Terrain uses a two-tone palette that stays readable on any map.
- **Change.** `board-tools-and-legibility` (commit `050a25a5`). FR-GM-17, FR-TAC-02.
- **Date fixed.** 2026-11-12

### PF-03: Dismiss pending rulings

- **Request.** Add a "dismiss all" button to the pending rulings, and a dismiss (X) button on each ruling.
- **Resolution.** The Rulings heading has **Clear all**, and each ruling has a small **X** to ignore it. Ignored rulings leave the list without a Hit or Miss being recorded.
- **Change.** `player-end-turn-and-ruling-dismissal` (commits `ad464d4d`, `889347e5`), ADR 0060. FR-GM-21.
- **Date fixed.** 2026-11-12

### PF-04: Half or no damage after a hit

- **Request.** After a hit, let the GM apply half or no damage, as resolving an area effect already allows.
- **Resolution.** **Resolve** on a damage roll opens a dialog with an amount that starts at the rolled damage, plus **Half** and **None**. A negative amount heals. The dialog can also apply conditions. A quick **Apply −N** stays beside it for full damage.
- **Change.** `resolve-attack-damage` (commits `2fe1d7d7`, `8ed4dceb`), ADR 0062. FR-TAC-07, FR-GM-22.
- **Date fixed.** 2026-11-12

### PF-05: One standard dice formula input

- **Request.** Use the same input for every dice roll: a number of dice, a die type selector, and a "plus" to add another die type or a flat value.
- **Resolution.** One dice builder is used for every roll: the Dice panel, attacks, group rolls, area effects, creature and AI-builder editors. A formula can mix die types (for example `1d8 + 2d6 + 3`).
- **Change.** `dice-pool-builder` (commit `aa937ff9`), ADR 0061. FR-TAC-09, FR-GM-22.
- **Date fixed.** 2026-11-12

### PF-06: No confirmation prompt for token edits

- **Request.** Remove the confirmation prompt when changing a token. Keep it only for deleting a token.
- **Resolution.** **Save** in the token editor applies at once. Replacing an encounter template no longer asks either. Deleting still asks.
- **Change.** `remove-save-confirmations` (commit `fb657170`). FR-GM-13.
- **Date fixed.** 2026-11-12

### PF-07: Settings as its own section, with new table options

- **Request.** Move Settings out of the More menu, keep the existing options, and add:
  - Player map visibility: Allowed / Only with an assigned token
  - Terrain cost: On entry / On exit / On entry or exit
  - 0 HP tokens: Auto-delete all / Auto-delete unowned / Mark all
  - Attack animations: Show all / Only during the token's turn / Off
- **Resolution.** Settings has its own button in the room bar, with Audio, Graphics, Preferences, Table and Language tabs. Each requested option exists:

  | Requested | Built as | Where |
  | --- | --- | --- |
  | Player map visibility | **Hide map from players without a token** (on/off) | Table tab |
  | Terrain cost | **Difficult terrain applies**: On entry / On exit / Both | Table tab |
  | 0 HP tokens | **Remove tokens at 0 HP**: All / Only NPC tokens / Off. With Off, a downed token is marked on the board. | Table tab |
  | Attack animations | **Attack animations**: All / Current turn / None | Graphics tab (per browser) |

  The Table tab also gained Hide HP, Hide AC and Diagonals. A GM can save these as defaults for new rooms (2026-11-13).
- **Changes.** `settings-button-and-client-options` (`8508cdec`, 2026-11-11), `gm-table-rules` (`04122640`, 2026-11-11, ADR 0057), `path-movement` (`c144b50f`, 2026-11-11, ADR 0055), `downed-token-marker` (`60221c92`, 2026-11-12), `gm-room-defaults` (`719ccf25`, 2026-11-13, ADR 0066). FR-TAC-06, FR-TAC-07, FR-GM-23.
- **Date fixed.** 2026-11-12. The follow-up room defaults landed on 2026-11-13.

### PF-08: Hide area templates under fog and outside sight

- **Request.** Players should not see area templates that lie under fog or outside their line of sight.
- **Resolution.** The server clips other people's areas to the part the player can see. A cone aimed into fog shows only its lit part, and a cone from the dark that reaches lit ground shows where it covers visible squares.
- **Change.** `clip-areas-at-fog` (commit `ab2816d9`), ADR 0059. FR-TAC-06, FR-GM-17, FR-GM-23.
- **Date fixed.** 2026-11-12

### PF-09: Move and resize placed area templates

- **Request.** Allow moving and resizing an area after it is placed, using a select option in the area tool.
- **Resolution.** The person who placed an area, or the GM, can select it and move, resize or turn it by its handles. Other viewers see the edit live, and only the release is saved (`template.update` → `TemplateChanged`). As with placing and removing areas, edits are not undoable.
- **Change.** `edit-placed-area-templates` (commits `ab2816d9`, `0f83dc55`), ADR 0058. FR-TAC-06.
- **Date fixed.** 2026-11-12

### PF-10: No size dropdown in the area tool

- **Request.** Remove the size dropdown. Default to 10 ft and show the size as the area is dragged larger or smaller.
- **Resolution.** The size picker is gone. A click places an area two cells in size (10 ft on a 5 ft grid). A drag sizes it, with the size shown beside the pointer as it changes.
- **Change.** `edit-placed-area-templates` (commit `ab2816d9`), ADR 0058. FR-TAC-06.
- **Date fixed.** 2026-11-12

### PF-11: Terrain shown by default, and Show filters moved

- **Request.** Check the Terrain view filter by default, and move the Show filters into settings.
- **Resolution.** Terrain is drawn by default for everyone. The Show menu is GM-only, and players no longer have a Show control. The filters stay on the board's options button rather than in Settings, because they change the GM's view of the current board, not a saved preference.
- **Change.** `board-tools-and-legibility` (commit `050a25a5`). FR-GM-17, FR-GM-18.
- **Date fixed.** 2026-11-12

### PF-12: No stacking on snapped drops

- **Request.** When dragging a token with snap-to-grid, don't let two tokens end up in the same square. Tokens may still pass through each other while dragging or moving with the arrow keys.
- **Resolution.** A snapped drop or a new placement onto an occupied square is refused with "Another token is already there." Free (Alt) placement and arrow-key moves may still overlap, and a path may pass through other tokens. A downed token doesn't occupy its square.
- **Change.** `token-no-stacking` (commit `60221c92`). FR-TAC-02.
- **Date fixed.** 2026-11-12

### PF-13: Attack range with an out-of-range warning

- **Request.** Add a range to attacks, with a warning when an attack is used out of range.
- **Resolution.** Named attacks have a range: Unlimited, Melee (with optional reach) or Ranged. Out-of-range targets are grouped separately and marked **Out of range**, and the board's aim turns red past the range. Range warns but never blocks a roll.
- **Change.** `attack-range-and-animations` (commit `719ccf25`), ADR 0067. FR-TAC-09.
- **Date fixed.** 2026-11-13

### PF-14: End turn for players, and a clear turn notice

- **Request.** Give players an **End turn** button on their token's turn, and show a pop-up at the top of the screen when their turn starts.
- **Resolution.** Players end their own turn. A banner at the top of the room says "It's *name*'s turn · Round *n*" with **End turn**. The GM can step the turn back, and can turn the banner on for every turn in Preferences.
- **Changes.** `player-end-turn-and-ruling-dismissal` (`ad464d4d`, ADR 0060), `turn-notice`, `gm-turn-banner-preferences` (`633688cc`). FR-GM-21.
- **Date fixed.** 2026-11-12

### PF-15: Roll initiative for everyone at once

- **Request.** Roll initiative for all included tokens in one action.
- **Resolution.** The Start encounter and Add to encounter dialogs have a dice builder (1d20 by default) and a **Roll** button that rolls for every checked token at once. A **Players' tokens** checkbox and group checkboxes tick tokens in bulk. The turn order can also be edited mid-encounter: add a token that joins, remove one that leaves, and drop deleted tokens automatically.
- **Change.** `initiative-mass-roll-and-order-edits` (commit `ab819251`), ADR 0065. FR-GM-21.
- **Date fixed.** 2026-11-13

### PF-16: Carry player tokens between scenes and encounters

- **Request.** Let player-owned tokens move from one scene to the next, or from the board into the next encounter template.
- **Resolution.** Party tokens are carried across scene switches, encounter template applies and map changes, with their owners, HP, conditions and attacks. Carried tokens wait to be placed on the new board.
- **Change.** `carry-party-tokens` (commit `67b581db`), ADR 0068. FR-GM-13, FR-GM-25.
- **Date fixed.** 2026-11-13

### PF-17: Split "Edit map" into "Change map" and "Edit map"

- **Request.** Make replacing the map and preparing the current map two separate buttons.
- **Resolution.** **Change map** replaces the map. **Edit map** opens the map editor for the current one. The GM can also save a prepared map back to the library and export it from the library editor.
- **Change.** `change-and-edit-map` (commit `3710f495`), ADR 0070. FR-GM-09, FR-GM-12, FR-GM-17.
- **Date fixed.** 2026-11-13

---

## 2. Bug Reports

### PB-01: Tokens refused on squares a wall only grazes

- **Problem.** A token couldn't be placed on, or moved onto, a square that a wall barely touched, even with the token's centre on the correct side of the wall.
- **Resolution.** Walls are now tested against a smaller inset of the token's footprint. A wall stub in a corner, a diagonal clipping a square, or detection noise near an edge no longer blocks the square, while a wall through the middle still does.
- **Change.** `token-wall-clearance` (commit `60221c92`), ADR 0063. FR-GM-11, FR-TAC-02.
- **Date fixed.** 2026-11-12

### PB-02: Saved creature attacks missing on placed tokens

- **Problem.** A token placed from a saved creature didn't reliably get the creature's saved attacks and their animations.
- **Resolution.** A creature's attacks are copied onto each token placed from it, with their animations. Built-in creatures also got ranges and animations (2026-11-13). Attacks saved before mixed dice (ADR 0061) are now upgraded when read from stored history, encounter templates and AI-builder draft creatures. Before this, those older attacks showed as unusable or crashed the Attack section.
- **Changes.** `attack-range-and-animations` (`719ccf25`, 2026-11-13), `legacy-attack-dice-crash` (`39169026`, `da7ed6da`, 2026-11-16). FR-TAC-09, FR-GM-13.
- **Date fixed.** 2026-11-16 (merged in PR #215).

### PB-03: Attack and damage dice not animated for other players

- **Problem.** Only the person rolling saw the dice animation for attack and damage rolls. Everyone else saw only the result card.
- **Resolution.** Every public roll, including attack, damage and Roll-button rolls, is thrown on every participant's board.
- **Change.** `fog-inner-fade-and-shared-dice` (commit `23f4c14d`). FR-TAC-09.
- **Date fixed.** 2026-11-12

### PB-04: Drawings not shared

- **Problem.** Drawings were visible only to the person who drew them.
- **Resolution.** Drawings are shared with the whole room and saved with the scene. Players can erase their own drawings, and the GM can erase anyone's.
- **Change.** `fog-inner-fade-and-shared-dice` (commit `23f4c14d`), ADR 0064. FR-TAC-04.
- **Date fixed.** 2026-11-12

### PB-05: Blocked terrain stopped movement into neighbouring squares

- **Problem.** Blocked (obstructed) terrain stopped movement into the squares next to it, not just movement through it.
- **Resolution.** Moves are now costed step by step along a path, and only steps that enter Blocked squares are refused. Squares next to Blocked terrain can be entered normally.
- **Change.** `path-movement` (commit `c144b50f`), ADR 0055. FR-TAC-02, FR-TAC-03.
- **Date fixed.** 2026-11-11

### PB-06: Drag cost measured as a straight line

- **Problem.** The movement cost shown while dragging assumed a straight line to the square, not a path the token could actually take.
- **Resolution.** A snapped drag shows and charges the cheapest valid path to the target square. The path avoids Blocked terrain, walls and closed doors, and follows the room's Diagonals and Difficult terrain rules. Players receive the walls they can see, so their own clients can route around them. Tokens slide along that path on every screen.
- **Changes.** `path-movement` (`c144b50f`, 2026-11-11), `visible-walls-for-players` (`d5cd2d4d`, 2026-11-12, ADR 0056), `token-move-slide` (`f64a61bc`, 2026-11-12). FR-TAC-02, FR-TAC-03, FR-GM-23.
- **Date fixed.** 2026-11-12. The core path search landed on 2026-11-11.

### PB-07: Fog and sight edges faded outward

- **Problem.** The soft edge of fog and of line-of-sight darkness at walls fell on the revealed side, dimming map the player should see clearly.
- **Resolution.** Fog now fades inward, over a narrower band inside the fogged area. Line-of-sight darkness is drawn from every owned token's merged sight with a crisp edge, so nothing the player can see is dimmed.
- **Change.** `fog-inner-fade-and-shared-dice` (commit `23f4c14d`). FR-GM-17, FR-GM-19.
- **Date fixed.** 2026-11-12
