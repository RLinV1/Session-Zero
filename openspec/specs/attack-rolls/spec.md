# attack-rolls Specification

## Purpose
Lets a participant make an attack by picking the attacking token, pointing at a target on the board and rolling. The table sees who attacked whom and with what, and the GM still decides hit or miss.

## Requirements

### Requirement: Attack section in Play
The Play tab SHALL contain an Attack section. Its attackers SHALL be exactly the tokens the viewer controls: tokens they own, and every visible token for the GM. If the viewer controls exactly one token, the section SHALL name that token and SHALL NOT show a choice. Otherwise it SHALL offer a choice of attacker.

The attacker SHALL be:
- the viewer's token holding the active turn, whenever the turn moves to one, even if the viewer had chosen a different attacker;
- otherwise the attacker the viewer last chose;
- otherwise the first token.

A viewer who controls no token SHALL be told so instead of being offered the controls. Choosing an attacker SHALL be allowed whether or not it is that token's turn. The Tokens roster and the My tokens rows SHALL NOT offer attack controls.

**Outside combat.** Attacks SHALL never be disabled for lack of an encounter; surprise attacks, traps and objects happen outside one. While no encounter is running, the section heading SHALL say so, e.g. "Attack · no encounter running".
- The section SHALL start collapsed when no encounter is running, unless this browser has a remembered choice for it.
- It SHALL open when an encounter starts.
- It SHALL collapse when an encounter ends.
- It SHALL open when the viewer's own token's turn begins, unless the viewer collapsed it themselves during that encounter.

This applies to the GM and players alike.

#### Scenario: Player sees only their own tokens as attackers
- **WHEN** a player who owns Aria opens the Play tab with Aria and Goblin 2 on the board
- **THEN** the Attack section names Aria as the attacker, offers no choice, and does not offer Goblin 2

#### Scenario: The active turn is preselected
- **WHEN** a player owns Aria and Bram and it is Bram's turn
- **THEN** the Attack section preselects Bram

#### Scenario: The attacker follows the turn
- **WHEN** the GM chose Goblin A as attacker during Goblin A's turn and then advances to Goblin B's turn
- **THEN** the Attack section switches to Goblin B

#### Scenario: Quiet outside combat
- **WHEN** a player first opens a room with no encounter running
- **THEN** the Attack section is collapsed, its heading reads "Attack · no encounter running", and opening it offers every control

#### Scenario: Opens for the fight
- **WHEN** the GM starts an encounter while the player's Attack section is collapsed
- **THEN** the section opens, and it collapses again when the GM ends the encounter

#### Scenario: A deliberate choice is kept for the encounter
- **WHEN** during an encounter the player collapses the Attack section, and later their token's turn begins
- **THEN** the section stays collapsed

#### Scenario: Attacking out of turn is allowed
- **WHEN** initiative is running, it is Goblin 2's turn, and Aria's owner picks a target for Aria
- **THEN** the target is selected and Aria can roll

### Requirement: Choosing a target
The viewer SHALL be able to choose a target in either of two ways.

**Pick on board** SHALL put the viewer's board into targeting mode:
- The cursor SHALL be a crosshair.
- A line SHALL run from the attacking token to the token under the pointer, labeled with the distance in the room's grid units.
- Clicking another token the viewer can see SHALL choose it as the target.
- Clicking the attacking token or empty board SHALL NOT choose a target.
- `Esc` or a right-click SHALL leave targeting mode without choosing.

**The target list** SHALL show every token the viewer can see other than the attacker, nearest first, each with its distance in grid units. Choosing one SHALL make it the target.

Targeting SHALL be local to the viewer. Nothing SHALL be sent to other participants until a roll is made. The chosen target SHALL stay selected after a roll until the viewer clears it, the target is no longer visible to the viewer, or the viewer makes it the attacker.

#### Scenario: Hovering shows the distance
- **WHEN** Aria's owner is picking on the board and the pointer is over Goblin 2, three squares away on a 5 ft grid
- **THEN** a line from Aria to Goblin 2 is labeled "15 ft"

#### Scenario: Choosing from the list
- **WHEN** Goblin 2 is 15 ft from Aria and an Orc is 30 ft away
- **THEN** the list shows "Goblin 2 · 15 ft" before "Orc · 30 ft", and choosing Goblin 2 makes it the target

#### Scenario: Cancelling
- **WHEN** the viewer presses `Esc` while picking on the board
- **THEN** the board returns to its previous tool, the target is unchanged, and no roll or ping is sent

#### Scenario: A token cannot target itself
- **WHEN** the viewer clicks the attacking token while picking on the board
- **THEN** no target is chosen and targeting mode continues

#### Scenario: Target stays for the damage roll
- **WHEN** Aria's owner rolls an attack at Goblin 2
- **THEN** Goblin 2 is still the target, and the next roll is made against it without choosing again

### Requirement: Choosing dice and rolling
The Attack section SHALL show the viewer's latest attack roll above its other controls: the dice landing, the result, and its outcome as described under the rulings requirements.

Rolls other than a named attack's SHALL be made with a **Custom roll** builder. The builder SHALL be collapsed by default, SHALL remember in this browser whether it was left open, and SHALL let the viewer set:
- the roll type;
- the dice, with the dice builder (see `dice-pool`): one or more die types from d4, d6, d8, d10, d12, d20 and d100, each with a number of dice, 20 dice in all, and an optional modifier from −99 to 99;
- an optional label of at most 40 characters;
- for the GM only, whether the roll is GM-only. This choice also applies to named-attack rolls, SHALL be offered above the named attacks together with any hidden-token warning, and SHALL be kept when the viewer leaves and returns to the Play tab.

The custom settings SHALL start from the last ones this browser used with the chosen attacker, or a to-hit `1d20` with no label the first time. Settings saved in this browser before mixed dice existed SHALL still be read. The custom Roll control SHALL name the formula, type and target, e.g. "Roll 1d20+5 to hit Goblin 2", and SHALL be unavailable until a target is chosen. Every roll SHALL be a single roll that carries the attacker, the target and the label. Every roll SHALL also send a ping at the target's position; the ping SHALL be sent only for a public roll whose target is visible to players.

#### Scenario: Custom roll
- **WHEN** Aria's owner targets Goblin 2, opens Custom roll, chooses 1 × d20 with modifier +5 and label "Longsword", and rolls
- **THEN** one roll of `1d20+5` is made, carrying Aria as attacker, Goblin 2 as target and "Longsword" as the label, a ping appears on Goblin 2 for everyone, and the result shows at the top of the section

#### Scenario: Custom roll with mixed dice
- **WHEN** Aria's owner chooses Damage, 1 × d8, adds 2 × d6 with + Die and a modifier of 3, and rolls against Goblin 2
- **THEN** one damage roll of `1d8+2d6+3` is made against Goblin 2, and the Roll control read "Roll 1d8+2d6+3 damage to Goblin 2"

#### Scenario: Builder stays out of the way
- **WHEN** a player who has only ever used named attacks opens the Play tab
- **THEN** Custom roll is collapsed and the named attacks are the first controls after the target

#### Scenario: Settings are remembered per token
- **WHEN** the viewer rolls a custom `1d20+5` with Aria, reloads the page, and opens Custom roll for Aria
- **THEN** the dice are set to `1d20+5`

#### Scenario: Older saved settings
- **WHEN** this browser saved Aria's custom settings as 1 × d20 + 5 before mixed dice existed
- **THEN** Custom roll for Aria opens with 1 × d20 and a modifier of 5

#### Scenario: GM-only attack sends no ping
- **WHEN** the GM makes a GM-only attack roll against Aria
- **THEN** players receive neither the roll nor a ping

### Requirement: Attack rolls show who attacked whom
Everywhere the room shows a roll that carries attack context, it SHALL name the attacking token, the target token and the label if any, followed by the expression and total, e.g. "Aria → Goblin 2 · Longsword · 1d20+5 = 17". The names shown SHALL be the tokens' names at the time of the roll, even after a token is renamed or deleted. The system SHALL NOT state whether the attack hits, and SHALL NOT change any token's hit points or conditions as a result of the roll.

#### Scenario: Roll log entry
- **WHEN** Aria's owner rolls 17 on a Longsword attack at Goblin 2
- **THEN** every participant's roll log shows "Aria → Goblin 2 · Longsword · 1d20+5 = 17", with no hit or miss verdict

#### Scenario: Target deleted later
- **WHEN** Goblin 2 is deleted after being attacked
- **THEN** the earlier roll still names Goblin 2

### Requirement: Server authorizes attack rolls
The server SHALL accept a roll with attack context only when all of the following hold:
- The attacking token exists and is visible to the actor.
- The actor controls the attacking token (owns it or is the GM).
- The target token exists and is visible to the actor.
- The target differs from the attacker.

A token the actor cannot see SHALL be answered exactly as a token that does not exist. A roll without attack context SHALL behave exactly as before. The server SHALL NOT restrict attack rolls by turn order, range, or the dice expression used.

#### Scenario: Player attacks with someone else's token
- **WHEN** a player sends an attack roll naming Goblin 2 as the attacker, which they do not own
- **THEN** the server refuses it as forbidden and no roll is recorded

#### Scenario: Player targets a hidden token
- **WHEN** a player sends an attack roll whose target is a hidden token's ID
- **THEN** the server answers "not found", exactly as for a nonexistent token, and no roll is recorded

#### Scenario: Attacker and target are the same
- **WHEN** an attack roll names the same token as attacker and target
- **THEN** the server refuses it as invalid

#### Scenario: Plain rolls are unchanged
- **WHEN** a participant rolls `2d6+1` with no attack context
- **THEN** the roll is accepted and shown as before

### Requirement: Attack rolls never reveal hidden tokens
A player SHALL NOT receive the ID or name of a token that is hidden from them through an attack roll, in any snapshot, live event, reconnect payload or response. This SHALL hold when the GM makes a public attack roll involving a hidden token, and when a token becomes hidden after the roll was made. In that case the player SHALL still see the roll's expression, total and label, with the hidden side shown as an unknown token. A side that has been hidden SHALL stay unknown to players for that roll even after the token is revealed, renamed or deleted. The system SHALL NOT ping the position of a hidden target. GM-only attack rolls SHALL remain withheld from players entirely, as for any GM-only roll.

#### Scenario: Hidden monster attacks in public
- **WHEN** the GM makes a public attack roll with a hidden Shadow against Aria
- **THEN** players see the roll against Aria with the attacker shown as unknown, and no player-bound payload contains the Shadow's ID or name

#### Scenario: Hidden target is not pinged
- **WHEN** the GM makes a public attack roll against a hidden token
- **THEN** players see the roll with the target shown as unknown, and no ping is shown at the hidden token's position

#### Scenario: Revealed after a rename
- **WHEN** the GM makes a public attack roll with a hidden Doppelganger, then renames it Innkeeper and reveals it
- **THEN** players still see that roll's attacker as unknown, and never receive the name Doppelganger

#### Scenario: Target hidden after the roll
- **WHEN** a player attacks the visible Goblin 2 and the GM later hides Goblin 2
- **THEN** players' roll logs no longer contain Goblin 2's ID or name for that roll, and the GM's log still does

### Requirement: Shared named attacks
Each token SHALL hold up to 8 named attacks in the room. Each named attack SHALL have:
- a name of at most 40 characters, unique within the token, ignoring case;
- a to-hit roll, a damage roll, or both, each chosen as die type, number of dice and modifier.

The GM, and each owner of a token, SHALL be able to add, edit and remove that token's named attacks, both in the Attack section (with an **Add attack** control) and in the token editor. The token editor and the New Token form SHALL each show an **Attacks** section that collapses within the dialog: closed when the dialog opens, with the number of attacks in its heading, and listing the attacks with Add attack, Edit and Remove when opened. In New Token, the section SHALL show any attacks a creature filled in, and the attacks it lists SHALL be placed with the token. A change SHALL be saved to the token and reach every device of the GM and the token's owners. Other players SHALL NOT receive a token's named attacks, in snapshots or events. The server MUST refuse a change from a player who doesn't own the token, a change breaking these limits, and any change while the room's game preset has attacks off. The GM SHALL be able to undo a change from the activity log. The app SHALL NOT classify named attacks (weapon, spell or other); the name is only a label. Attacks saved only in a browser before this change SHALL be cleared, not read.

Tapping a named attack, once a target is chosen, SHALL roll immediately:
- a named attack with a to-hit roll rolls it, as a to-hit roll labeled with the named attack's name;
- a named attack with only a damage roll rolls it, as a damage roll labeled "<name> damage".

Attack controls SHALL be unavailable until a target is chosen.

#### Scenario: One tap to hit
- **WHEN** Aria has an attack "Longsword" (to hit `1d20+5`, damage `1d8+3`), Goblin 2 is the target, and her owner taps Longsword
- **THEN** a to-hit roll `1d20+5` labeled "Longsword" is made against Goblin 2 at once

#### Scenario: Damage-only named attack
- **WHEN** Bram has an attack "Burning Hands" with only damage `3d6` and his owner taps it with Goblin A targeted
- **THEN** a damage roll `3d6` labeled "Burning Hands damage" is made against Goblin A at once

#### Scenario: The GM's edit reaches the owner
- **WHEN** the GM opens Goblin's token editor, adds "Scimitar" (to hit `1d20+4`, damage `1d6+2`) and saves, while Goblin's owner is connected on another device
- **THEN** the owner's Attack section offers Scimitar for Goblin without a reload, and so does the GM's other device

#### Scenario: Attacks collapse in the dialogs
- **WHEN** the GM opens Goblin's token editor (2 attacks), or chooses From creature → "Goblin" in New Token
- **THEN** the dialog shows a closed section headed "Attacks · 2", and opening it lists both attacks with Edit, plus Add attack

#### Scenario: Attacks typed into New Token
- **WHEN** the GM adds "Bite" (to hit `1d20+3`, damage `1d6+1`) in New Token's Attacks section and places the token
- **THEN** the placed token has Bite for the GM and its owners

#### Scenario: An owner adds an attack
- **WHEN** Aria's owner adds "Fire Bolt" (to hit `1d20+5`, damage `1d10`) in the Attack section
- **THEN** Aria has Fire Bolt for the GM and her owner, and the activity log shows the change

#### Scenario: Other players never see attacks
- **WHEN** the GM changes the attacks of a goblin that Bram's owner doesn't own
- **THEN** Bram's owner receives nothing about those attacks, live or after a reload

#### Scenario: A forged edit is refused
- **WHEN** a player sends an attack change for a token they don't own
- **THEN** the server refuses it as forbidden and nothing changes

#### Scenario: Undo
- **WHEN** the GM removes Goblin's Scimitar by mistake and undoes it from the activity log
- **THEN** Goblin has Scimitar again for the GM and its owners

#### Scenario: Old browser attacks are cleared
- **WHEN** a browser still holds attacks for Aria saved only in that browser before this change
- **THEN** they are not shown and are removed from the browser, and Aria shows only the attacks on her token
