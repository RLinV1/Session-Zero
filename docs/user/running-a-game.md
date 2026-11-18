# Running a Game (GM Guide)

This guide follows a GM from an empty room to a finished encounter. For individual tools,
see [Board tools](board-tools.md). For table options, see [Settings](settings.md).

## 1. Rooms

**Your rooms** lists the rooms you host and the rooms you've joined, with a preview of each
board. From here you can create, open and delete rooms.

**Room settings** (the gear on the dashboard) sets your defaults for every new room: the
table rules, distance per square and unit label. A new room starts with these; each room can
still be changed on its own.

In a room, **Share** holds:

- the **invite link** and **QR code**;
- **Reset link**, which replaces the link if it has leaked (old links stop working);
- **Lock the room**, which stops anyone new joining, even with the link (players already
  seated can still come back);
- **Play with your AI**, for seating your own AI app ([guide](../AI-PLAYERS.md)).

To remove a player, open the people list in the room bar and choose **Remove**. Their tokens
stay for you to hand to someone else.

## 2. Preparing the map

### Choosing a map

On the **Manage** tab, **Change map** replaces the map with an upload (PNG, JPEG or WebP, up
to 25 MB), a map from your library, a built-in map, or a `.uvtt` / `.dd2vtt` file from a map
maker. When tokens are already on the board, you can choose to move them with the new map.

### Editing the map

**Edit map** opens the map editor for the current map. It walks through:

| Step | What you do |
| --- | --- |
| **Grid** | Automatic grid detection proposes a grid. Check the preview and correct the cell size and offset if needed. |
| **Walls** | Detect walls automatically (when available) or draw them. Review detected walls, doors and windows as a set before applying them. Add doors and windows on walls, and set each one open, closed or locked. |
| **Fog** | Cover areas players haven't explored. |
| **Sight** | Turn line of sight on or off, set an optional sight range (for torchlight or dim dungeons), preview what test tokens see, and mark the map flat or 2.5D. |

**Save to library** keeps the prepared map (grid, walls, fog and terrain) in your library to
reuse. **Export .uvtt** downloads it for other tools.

### Terrain

Pick **Terrain** on the tool rail and paint with a brush or a rectangle:

- **Difficult** costs double movement.
- **Blocked** can't be entered.
- **Normal** erases terrain.

Terrain is outlined by area and shown to everyone. Your room's **Difficult terrain applies**
rule decides whether the cost counts when entering a square, leaving it, or both.

## 3. Tokens

On the **Tokens** tab:

- **New Token** creates a token for a character or monster.
- **Saved Creatures** places one of your library creatures with its stats, conditions and
  attacks. You can place several in a row: click squares, then press Esc when done.

Click a token to open its card. **Edit** sets name, art, colour, size, rotation, HP, AC,
conditions, initiative score, named attacks, **Controlled by** (the players who may move it)
and whether players can see it. Saving applies at once with no confirmation; only deleting a
token asks first.

Other token actions:

- **Duplicate** a token onto a square you choose.
- Put tokens in **groups** to select, move and add them to an encounter together.
- **Quick HP** on the token card adjusts HP without opening the editor.
- **Reposition next move** lets one move ignore walls and Blocked terrain on the way. The
  destination must still be clear.
- **View as** a token shows the board exactly as its owner sees it.
- Hidden tokens never reach players' screens.

### Named attacks

Each attack has a to-hit roll, a damage roll, a **range** and an **animation**:

- **Range** is Unlimited, Melee (with an optional reach) or Ranged. Targets out of range are
  listed separately and marked **Out of range**. Range warns but never stops a roll.
- **Animation** plays on the board when the attack is rolled. The editor previews the one you
  choose. **Automatic** plays a slash for melee and an arrow for ranged. Make your own in the
  library's **Animations** tab.

### Placement rules

- A snapped drop or a new token can't land on a square another token is standing on. Free
  placement (hold Alt) and arrow-key moves may overlap.
- A token may stand where a wall only grazes its square, as long as the wall doesn't cut
  through the middle of it.

## 4. Running an encounter

### Initiative

1. On the **Play** tab, choose **Start encounter**.
2. Tick the tokens to include. **Players' tokens** and group checkboxes tick many at once.
3. Type scores, or set a dice formula (1d20 by default) and press **Roll** to roll for every
   ticked token at once.
4. Start. The turn banner shows whose turn it is.

During the encounter:

- The token's owner presses **End turn**, or you press **Next turn**. You can also step a
  turn back.
- **Add to encounter** brings in a token that joins mid-fight. You can also remove a token
  from the order. Deleted tokens leave the order on their own.
- Turn on **Turn banner on every turn** in **Settings → Preferences** to get the banner, with
  **End turn**, on monsters' turns too.

### Attacks and rulings

Attack rolls arrive in **Rulings** on your **Play** tab. The target's AC is shown beside each
roll:

- Mark each to-hit roll **Hit** or **Miss**.
- On a damage roll, **Apply −N** takes the full amount off the target's HP. **Resolve** opens
  a dialog where you choose the amount, **Half** or **None**, and add conditions. A negative
  amount heals, up to max HP.
- The small **X** ignores one roll without ruling on it. **Clear all** empties the list.

The app never decides a hit for you. You can change a ruling later from the **Dice** tab.

### Areas and area effects

Place an area with the **AoE** tool. Tick **GM only** to keep it from players. Areas can be
selected and moved, resized or turned after they're placed. Players see other people's areas
only where they can see the board.

An **area effect** runs a whole spell across every token in an area: saves, your call on each
save, and damage.

## 5. Hidden information

| Tool | Hides |
| --- | --- |
| **Fog** | Everything under it, until you reveal it |
| **Line of sight** | Everything a player's tokens can't see. Walls and closed doors block sight; windows and open doors don't. |
| **Hidden tokens** | The token, from every player |
| **GM-only areas and rolls** | The area or roll result |
| **Table rules** | The map from players without a token, and other tokens' HP and AC |

Hidden information is removed on the server before anything is sent to a player, so it
can't be found in the browser.

## 6. Scenes and encounter templates

**Scenes** are separate boards in one room. Switch scenes from the room header. Leaving a
scene saves everything on it. You can prepare a new scene privately from the current map, an
encounter template or another map, and switch to it when the party arrives. Players never see
inactive scenes.

**Encounter templates** (library → **Encounters**) save a map with its walls, fog and
monsters. Apply one to a live room in a single step.

Party tokens come with you. When you switch scenes, apply a template or change the map,
players' tokens are carried over with their HP, conditions and attacks, and wait for you to
place them.

## 7. Fixing mistakes

| Tool | Where | Use it to |
| --- | --- | --- |
| **Undo** | **More → Activity log** | Reverse an action from its entry: a move, fog, walls, HP, an applied template |
| **Activity log** | **More** | See everything that has happened, move by move |
| **Replay** | **More → Replay** | Step through an encounter from its start |
| **Scenes** | Room header | Keep a prepared board safe while you try something on another one |

Undo never erases history. The log keeps both lines: what happened, and that it was undone.

## 8. The library

The **Asset library** keeps reusable content across all your rooms:

| Tab | Holds |
| --- | --- |
| **Maps** | Your maps with their grid, walls and fog, plus built-in maps. Import `.uvtt` files here too. |
| **Token Art** | Token images, with framing |
| **Creatures** | Saved creatures with HP, AC, conditions and attacks |
| **Encounters** | Encounter templates |
| **Animations** | Your own attack animations, made in an editor with a live preview |
| **Dice** | Dice looks, including your own painted dice skins |
| **AI builds** | Games your AI app has drafted for you to review ([guide](../AI-GAME-BUILDER.md)) |

Each account can hold up to 1,000 uploaded library items and 2 GB of images.
