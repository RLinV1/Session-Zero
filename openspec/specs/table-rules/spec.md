# table-rules Specification

## Purpose
Lets the GM set rules the whole table shares: which tokens leave the board at 0 HP, whether players without a token can see the map, and whether players can see HP and AC on tokens they don't own. The server decides every rule and filters what each player receives accordingly.

## Requirements

### Requirement: Table tab
The Settings dialog's Table tab SHALL be shown only to the GM, and only outside a preview. It SHALL hold exactly these controls, with these labels and no hint text: "Remove tokens at 0 HP" with the choices All, Only NPC tokens and Off; a switch "Hide map from players without a token"; a switch "Hide HP from Players"; a switch "Hide AC from Players". Every rule SHALL belong to the room: it applies on every scene, survives reloads and reconnects, and is the same for every participant. Only the GM SHALL be able to change a rule. The server SHALL refuse a player's change as forbidden and a change to the value a rule already has as invalid. Every participant SHALL be able to read the rules. A change SHALL reach every connected participant without a reload, and the GM's activity log SHALL record who changed which rule to what.

#### Scenario: GM sees the rules
- **WHEN** the GM opens Settings and chooses the Table tab
- **THEN** it shows "Remove tokens at 0 HP" (All, Only NPC tokens, Off), "Hide map from players without a token", "Hide HP from Players" and "Hide AC from Players", and nothing else

#### Scenario: Players cannot change a rule
- **WHEN** a player opens Settings, and then sends a change to "Hide HP from Players" anyway
- **THEN** there is no Table tab, and the change is refused as forbidden

#### Scenario: Unchanged value refused
- **WHEN** the GM sets "Hide AC from Players" on while it is already on
- **THEN** the server refuses it as invalid and nothing is recorded

#### Scenario: Defaults in a new room
- **WHEN** the GM creates a room
- **THEN** "Remove tokens at 0 HP" is All, and the three switches are off

### Requirement: Remove tokens at 0 HP mode
"Remove tokens at 0 HP" SHALL decide which tokens are removed when their HP reaches 0 or below, by every path that changes HP. **All** SHALL remove any such token, as before. **Only NPC tokens** SHALL remove only a token that no player owns; a token with any owner SHALL stay on the board at 0 HP or below. **Off** SHALL remove none. Changing the choice SHALL NOT remove tokens that are already at 0 HP or below. A room saved before this choice existed SHALL keep its earlier setting: on reads as All and off reads as Off. Its recorded history SHALL replay to the same result.

#### Scenario: Only NPC tokens keeps a player's token
- **WHEN** the choice is Only NPC tokens and an area effect takes both Goblin (no owner) and Aria (owned by a player) to 0 HP
- **THEN** Goblin is removed and Aria stays on the board at 0 HP

#### Scenario: All removes both
- **WHEN** the choice is All and the same area effect lands
- **THEN** both Goblin and Aria are removed

#### Scenario: Older room keeps its choice
- **WHEN** a room whose GM had turned automatic removal off before this change is loaded
- **THEN** "Remove tokens at 0 HP" reads Off

#### Scenario: Switching does not sweep the board
- **WHEN** Aria is at 0 HP under Only NPC tokens and the GM changes the choice to All
- **THEN** Aria stays on the board until her HP changes again

### Requirement: Hide map from players without a token
While "Hide map from players without a token" is on, a player who owns no token on the active scene that is visible to them SHALL see the board fully dark, whether or not line of sight is on. They SHALL NOT receive any other token, template, portal or other board content that line of sight would withhold from a player with no sight, in snapshots or in events. A token the GM has hidden SHALL NOT count as the player's token. The map image itself MAY still reach the player's device; it SHALL only be covered on their board. As soon as the GM gives the player a visible token, or reveals one they own, their board SHALL show what they may see without a reload. When the rule is off, a player without a token SHALL see the board as before this change. The GM, and the GM previewing as a player, SHALL see what that player would see.

#### Scenario: Player waiting for a token
- **WHEN** the rule is on and Bram joins a room where he owns no token
- **THEN** his board is fully dark and he receives no tokens, templates or portals

#### Scenario: Given a token
- **WHEN** the GM then assigns Bram the Fighter token
- **THEN** Bram's board shows the map and what he may see from there, without a reload

#### Scenario: Hidden token does not count
- **WHEN** the rule is on and the only token Bram owns is hidden by the GM
- **THEN** Bram's board stays fully dark

#### Scenario: Rule off
- **WHEN** the rule is off, line of sight is off, and Bram owns no token
- **THEN** Bram sees the map and every token he would otherwise see

### Requirement: Hide HP from Players
While "Hide HP from Players" is on, a player SHALL NOT receive the current or maximum HP of any token they don't own, in snapshots, events, replays or any other payload, including the HP a change replaced. Their board and panels SHALL show HP as hidden on those tokens, never as "Not tracked", and SHALL draw no HP bar for them. A player SHALL still see full HP for every token they own. The GM SHALL see every token's HP. Turning the rule on or off, and a player gaining or losing ownership of a token, SHALL update what that player sees without a reload. Damage numbers SHALL still show, since they reveal only how much damage landed; with the rule on, a map nuke's numbers SHALL show only on the player's own tokens.

#### Scenario: Another token's HP is hidden
- **WHEN** the rule is on and Aria's owner selects Goblin
- **THEN** Goblin's card shows HP as hidden and no HP bar is drawn on Goblin, and no payload Aria's owner receives carries Goblin's HP

#### Scenario: Own token stays visible
- **WHEN** the rule is on and Aria's owner selects Aria
- **THEN** Aria's card shows her current and maximum HP

#### Scenario: Another player's token is hidden too
- **WHEN** the rule is on and Aria's owner selects Bram's token
- **THEN** Bram's HP is shown as hidden

#### Scenario: HP change on another token
- **WHEN** the rule is on and the GM sets Goblin's HP from 7 to 3
- **THEN** no player who doesn't own Goblin receives either value

#### Scenario: Gaining ownership
- **WHEN** the rule is on and the GM gives Aria's owner the Goblin token
- **THEN** Aria's owner sees Goblin's HP without a reload

### Requirement: Hide AC from Players
While "Hide AC from Players" is on, a player SHALL NOT receive the AC of any token they don't own, in snapshots, events, replays or any other payload, including the AC a change replaced. Their board and panels SHALL show AC as hidden on those tokens. A player SHALL still see the AC of every token they own, and the GM SHALL see every token's AC. The rule SHALL be independent of "Hide HP from Players". Turning it on or off, and a player gaining or losing ownership of a token, SHALL update what that player sees without a reload. Hit and miss rulings SHALL still show.

#### Scenario: AC hidden, HP shown
- **WHEN** "Hide AC from Players" is on, "Hide HP from Players" is off, and Aria's owner selects Goblin
- **THEN** Goblin's card shows its HP and shows AC as hidden

#### Scenario: Turning it off
- **WHEN** the GM turns "Hide AC from Players" off
- **THEN** every player sees Goblin's AC without a reload
