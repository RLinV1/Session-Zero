# Spec Delta

## Purpose

Lets the owner decide, separately from grids and walls, whether their AI may propose permanent terrain.

## ADDED Requirements

### Requirement: The owner chooses whether the AI may propose terrain
Starting a build SHALL offer a third choice, "Let my AI propose terrain", off by default. A build that existed before this choice SHALL read as off. The owner SHALL be able to change it on the build page at any time. Changing the other two choices without sending this one SHALL leave it as it was. The first build tool result SHALL report it to the AI as `allowed.terrain`. A pass MUST NOT be able to change it. It SHALL be independent of the grid and walls choices.

#### Scenario: Start with terrain on
- **WHEN** a user ticks "Let my AI propose terrain" when starting a build
- **THEN** the build records it, and the AI's first read of the build says terrain is allowed

#### Scenario: Left off
- **WHEN** a user starts a build without ticking it
- **THEN** any attempt by the AI to save terrain is refused with a message naming the choice

#### Scenario: An older page changes the other choices
- **WHEN** a page sends only the grid and walls choices
- **THEN** the terrain choice keeps its stored value

#### Scenario: The AI tries to turn it on
- **WHEN** a request carrying only a pass tries to change the terrain choice
- **THEN** it is refused, and the choice is unchanged

### Requirement: Turning terrain off keeps what was proposed
Turning the terrain choice off SHALL stop the AI's later terrain changes, including a save already under way that has not yet been written. It SHALL keep the terrain already proposed, for the owner to review, clear or publish.

#### Scenario: Turned off during a save
- **WHEN** the owner turns terrain off after the AI's save was read and before it was written
- **THEN** the save is refused, and the terrain saved before stays as it was
