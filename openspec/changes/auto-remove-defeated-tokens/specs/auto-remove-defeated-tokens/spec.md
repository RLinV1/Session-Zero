# Spec Delta

## Purpose

Lets the GM have the table remove a token automatically when its HP reaches 0 or below, with a death animation, instead of deleting defeated tokens by hand.

## ADDED Requirements

### Requirement: Room setting
The Settings menu SHALL offer the GM a switch labelled **Remove tokens at 0 HP**, with the hint "Defeated tokens leave the board when their HP reaches 0 or below. You can undo it." Players SHALL NOT be shown it. The setting SHALL belong to the room: it SHALL apply to every scene, survive reloads and reconnects, and be the same for every participant. It SHALL default to on, including in rooms created before the setting existed. Only the GM SHALL be able to change it. The server SHALL refuse a player's change (forbidden) and a change to the value it already has (invalid). Everyone in the room SHALL be able to read the setting. Turning it on SHALL NOT remove tokens that are already at 0 HP or below.

#### Scenario: GM turns it on
- **WHEN** the GM opens Settings and switches on "Remove tokens at 0 HP"
- **THEN** the setting is on for the room, and a player who reloads sees it applied

#### Scenario: Players have no switch
- **WHEN** a player opens Settings
- **THEN** there is no "Remove tokens at 0 HP" switch, and a change sent anyway is refused as forbidden

#### Scenario: Old room
- **WHEN** a room created before this setting is loaded
- **THEN** the setting reads as off

### Requirement: Removal at 0 HP or below
While the setting is on, any change that leaves a token with HP at 0 or below SHALL remove that token, in the same action as the HP change. This SHALL apply to applying a damage roll, resolving an Area Effect, a nuke, and editing a token's HP, whoever makes the change. A token with no HP SHALL never be removed. While the setting is off, HP SHALL never remove a token. The removal SHALL be recorded as a token deletion that carries the whole deleted token, marked as a defeat, so the activity log reads "<name> was defeated and removed". A later resolve of an open Area Effect SHALL skip a removed target, as it skips any deleted target.

#### Scenario: Damage drops a token below 1 HP
- **WHEN** the setting is on, Goblin has 3 HP, and the GM applies 5 damage
- **THEN** Goblin's HP becomes -2 and Goblin is removed in the same action

#### Scenario: Exactly 0 is removed
- **WHEN** the setting is on and the GM applies damage that leaves Goblin at 0 HP
- **THEN** Goblin is removed in the same action

#### Scenario: No HP is never removed
- **WHEN** the setting is on and a token with no HP is in an Area Effect that is resolved
- **THEN** the token stays

#### Scenario: Area Effect removes several
- **WHEN** the setting is on and the GM resolves an Area Effect that takes Goblin 1 to -1 HP and Goblin 2 to 4 HP
- **THEN** Goblin 1 is removed and Goblin 2 stays, as one undoable action

#### Scenario: On by default
- **WHEN** a new room is created and a token is damaged to 0 HP with no setting changed
- **THEN** the token is removed

#### Scenario: Off when the GM turns it off
- **WHEN** the GM has turned the setting off and a token is damaged to -10 HP
- **THEN** the token stays with -10 HP

### Requirement: Undoing a removal
The GM SHALL be able to undo an action that removed tokens, as one action. Undo SHALL put each removed token back as it was when removed, in its group, and then restore its HP from before the action. The server SHALL refuse the undo, with the reason shown, when a token created since has taken a removed token's name or when other tokens the action changed have been edited since (invalid).

#### Scenario: Undo brings the token back
- **WHEN** the GM undoes the action that removed Goblin at -2 HP from 3 HP
- **THEN** Goblin is back at its place with 3 HP

#### Scenario: Plain HP edit that removes a token is undoable
- **WHEN** the GM edits Goblin's HP to -4 in the token card and Goblin is removed
- **THEN** the activity log offers undo for that edit, and it brings Goblin back with its earlier HP

### Requirement: Death animation
When a token is removed by a defeat, every viewer who can see that token SHALL see a death animation on its square, and the token SHALL stay drawn until the animation ends. A viewer who cannot see the token (hidden from players, or in fog for them) SHALL see nothing and SHALL NOT be sent the token. The animation SHALL be the same for every viewer who sees it. With reduced animations on (the device preference, the client setting, or the GM's table-wide setting) or low graphics quality, the token SHALL only fade out briefly. The animation SHALL play only for live events, not for a reload, a reconnect or a replay, where the token is simply absent. When many tokens fall at once, the board SHALL cap how many full animations play and fade the rest.

#### Scenario: Everyone sees the token fall
- **WHEN** Goblin, visible to all, is removed by damage
- **THEN** the GM and every player see Goblin play the death animation and then disappear

#### Scenario: Hidden token
- **WHEN** a hidden Goblin is removed
- **THEN** the GM sees the animation and players see nothing, and no event naming Goblin reaches them

#### Scenario: Reduced animations
- **WHEN** a viewer has reduced animations on
- **THEN** that viewer sees Goblin fade out and nothing else

#### Scenario: Reload
- **WHEN** a player reloads after Goblin was removed
- **THEN** Goblin is not on the board and no animation plays
