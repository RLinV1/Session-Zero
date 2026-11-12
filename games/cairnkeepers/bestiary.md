# Cairnkeepers — Bestiary

Every foe ends with a **platform entry**: the values to type into a **library creature** (Library →
Creatures → New creature), so placing one puts its HP, Guard and attacks on the board at once.

- **AC** on the board is the creature's **Guard**.
- **Attacks** are written as the attack editor takes them: to-hit `count d sides + modifier` and
  damage `count d sides + modifier`. "—" means that roll is left empty.
- **Token art** is the name of the token image to use.
- **Initiative** is fixed: type it as the creature's score when the encounter starts.

Save modifiers are listed as **G / F / S / L** (Grit, Footing, Sense, Lore).

---

## White-coat

*A mountain wolf in its winter coat, white to the skin. It lies down in the snow and waits for the
weather to bring something to it.*

**Size** 1 · **HP** 7 · **Guard** 9 · **Move** 8 · **Initiative** 8 · **Saves** +1 / +2 / +2 / −1 · **Threat** 1

- **Bite.** +2 to hit, **1d6+1**.
- **Pack.** Edge on its bite when another white-coat is next to the target.
- **Pull Down.** When its attack roll totals 11 or more, the target is also **Prone**.
- **Snow-runner.** Deep snow costs it nothing extra.
- **Lies Still.** While it doesn't move, it's hidden in snow: coming into sight isn't enough to see
  it; a Guide must spot it (**Sense 8**).

**Tactics.** Wait in a line across the trail, downwind. Rise together when the first Guide is two
squares away, go for whoever is alone, and run when half the pack is down.

| Platform entry | |
|---|---|
| Name | White-coat |
| Size | 1 |
| Max HP | 7 |
| AC | 9 |
| Colour | `#b9c7d3` |
| Attacks | **Bite** — to-hit `2d6+2`, damage `1d6+1` |
| Token art | White-coat |
| Starting conditions | Invisible (remove when it's spotted) |

---

## Scree Goat

*Shaggy, yellow-eyed, and completely at home on ground that kills people. It doesn't want to fight.
It wants you off its ledge.*

**Size** 1 · **HP** 8 · **Guard** 9 · **Move** 8 · **Initiative** 9 · **Saves** +2 / +3 / +1 / −1 · **Threat** 1

- **Butt.** +3 to hit, **1d6+1**, and the target is pushed 1 square. Pushed into a gorge or a
  crevasse, it saves to catch the edge.
- **Sure-footed.** No ground is Difficult for it.

**Tactics.** Ignore the Guides until one comes within 2 squares, then butt them toward the nearest
edge and bound away.

| Platform entry | |
|---|---|
| Name | Scree Goat |
| Size | 1 |
| Max HP | 8 |
| AC | 9 |
| Colour | `#c8b48a` |
| Attacks | **Butt** — to-hit `2d6+3`, damage `1d6+1` |
| Token art | Scree Goat |

---

## Rimehand

*A wrecker in a patched fur coat and a scarf over the mouth. Rimehands knock down cairns, wait for
travellers to walk off the safe way, and loot what's left.*

**Size** 1 · **HP** 8 · **Guard** 9 · **Move** 6 · **Initiative** 7 · **Saves** +1 / +1 / +1 / 0 · **Threat** 1

- **Hatchet.** +2 to hit, **1d6+1**. Can be thrown 4 squares.
- **Crossbow.** +2 to hit, range 12, **1d8**. It takes an Action to reload.
- **Know the Ice.** Rimehands roll **Footing** for bad ground with an Edge.

**Tactics.** Shoot from behind rock, close in on whoever falls. Each one runs when it drops to 3 HP
or less, and all of them run when Kettle Varga goes down.

| Platform entry | |
|---|---|
| Name | Rimehand |
| Size | 1 |
| Max HP | 8 |
| AC | 9 |
| Colour | `#6b4a33` |
| Attacks | **Hatchet** — to-hit `2d6+2`, damage `1d6+1` · **Crossbow** — to-hit `2d6+2`, damage `1d8+0` |
| Token art | Rimehand |

---

## Kettle Varga

*The Rimehands' boss: broad, patient, and polite, with an iron hook-axe and a kettle of smoking
pitch. She has been paying something in the ice to move the cairns. She's starting to regret it.*

**Size** 1 · **HP** 18 · **Guard** 10 · **Move** 6 · **Initiative** 9 · **Saves** +2 / +1 / +2 / +1 · **Threat** 4

- **Hook-axe.** +3 to hit, **1d8+2**. On a hit she may pull the target 1 square toward her.
- **Smoke Kettle** (once). She throws the kettle: everyone within 2 squares of the point saves
  **Grit 9** or is **Blinded** until the end of their next turn. The smoke is obscuring until the
  end of the round.
- **Talk First.** If the Guides talk before they fight, she'll trade the hospice for her crew's
  lives. At 6 HP or less she surrenders and tells what she knows (adventure, scene 3).

**Tactics.** Keep the Guides at the hall's doors while her crossbows shoot. Kettle when two Guides
stand together.

| Platform entry | |
|---|---|
| Name | Kettle Varga |
| Size | 1 |
| Max HP | 18 |
| AC | 10 |
| Colour | `#8a3b1f` |
| Attacks | **Hook-axe** — to-hit `2d6+3`, damage `1d8+2` |
| Token art | Kettle Varga |

> **On the board.** For the Smoke Kettle, place a 2-square circle, start an **Area Effect** with
> the expression `2d6`, and add **Blinded** to each target that fails. Then lay a fog region over
> the circle until the end of the round.

---

## Ice-crawler Swarm

*Pale, many-legged things the length of a finger, by the hundred. They live inside the ice and come
out of it like water.*

**Size** 1 · **HP** 10 · **Guard** 8 · **Move** 6 · **Initiative** 8 · **Saves** −1 / +2 / 0 / −2 · **Threat** 2

- **Bites.** +2 to hit, **2d4**, against **up to 2** creatures next to it.
- **Through the Ice.** It moves through ice walls and ice as if they weren't there.
- **Fire.** It takes double damage from fire, and won't come within 1 square of a lit lantern
  set down on the ground.

| Platform entry | |
|---|---|
| Name | Ice-crawler Swarm |
| Size | 1 |
| Max HP | 10 |
| AC | 8 |
| Colour | `#7fb4d1` |
| Attacks | **Bites** — to-hit `2d6+2`, damage `2d4+0`, **max targets 2** |
| Token art | Ice-crawlers |

> **On the board.** Moving through ice is a GM drag: the server lets the GM place a token
> anywhere.

---

## The Cairn-Taker

*What moves the stones. A hunched shape of rock and old ice the size of a cart, with cairn-stones
grown into its back like barnacles. It doesn't eat people. It eats* the way: *every cairn it
carries off is a road nobody can find again.*

**Size** 3 · **HP** 34 · **Guard** 10 · **Move** 4 · **Initiative** 8 · **Saves** +4 / 0 / +2 / +2 · **Threat** 10

- **Stone Fists.** +4 to hit, **1d8+2**, against **up to 2** creatures within 2 squares.
- **Whiteout Breath.** At the start of its turn, roll a d6: on **5–6** it breathes a 15 ft cone.
  Everyone in it saves **Grit 10**: **2d6** cold, half on a save. Until its next turn, the sight
  range in the cave is **10 ft**.
- **Pull the Roof** (instead of its Fists, once per round). Three squares in a line within 8 squares
  of it come down: everyone there saves **Footing 9** or takes **1d8+2** and is **Prone**. The
  squares are **Blocked** for the rest of the scene.
- **Cairn-bound.** When a Guide raises a cairn within 6 squares of it, it's **Stunned** until the
  end of its next turn. When all three cairns in its den stand, its Guard drops to **8** and it can
  no longer breathe.

**Tactics.** Stay in the dark at the back of the den, let the Guides come through the ice maze,
and bring the roof down behind them. Go for whoever is raising a cairn.

| Platform entry | |
|---|---|
| Name | The Cairn-Taker |
| Size | 3 |
| Max HP | 34 |
| AC | 10 |
| Colour | `#46525e` |
| Attacks | **Stone Fists** — to-hit `2d6+4`, damage `1d8+2`, **max targets 2** · **Whiteout Breath** — to-hit —, damage `2d6+0` |
| Token art | The Cairn-Taker |

> **On the board.** **Whiteout Breath** is a cone and an **Area Effect** (`2d6` saves), then
> **sight range 10 ft** until its next turn. **Pull the Roof** paints a temporary effect named
> **Rockfall** (§4.3 of the rules).

---

## Brother Aldric

*The last brother of the Hospice of St. Brenn: seventy, deaf in one ear, and entirely unafraid. He
knows the caves under the hospice, and he knows what's down there.*

**Size** 1 · **HP** 10 · **Guard** 8 · **Move** 5 · **Initiative** 5

- **Hot Broth.** A Guide next to him regains **1d6+2** HP (an Action; three bowls a day).
- **The Way Down.** He knows the safe path through the ice caves: with him, the Guides roll
  Footing for bad ground there with an Edge.

| Platform entry | |
|---|---|
| Name | Brother Aldric |
| Size | 1 |
| Max HP | 10 |
| AC | 8 |
| Colour | `#a8562a` |
| Attacks | **Hot Broth** — to-hit —, damage `1d6+2` (a heal) |
| Token art | Brother Aldric |

---

## Caravan Survivor

*A salt-trader, a muleteer, a child wrapped in three coats. Cold, frightened, and alive.*

**Size** 1 · **HP** 5 · **Guard** 7 · **Move** 4

A survivor follows the Guide who leads them and does nothing else. Getting them down the mountain
is the point.

| Platform entry | |
|---|---|
| Name | Caravan Survivor |
| Size | 1 |
| Max HP | 5 |
| AC | 7 |
| Colour | `#8a7a5a` |
| Attacks | **Struggle** — to-hit `2d6+0`, damage `1d4+0` |
| Token art | Survivor |

---

## Board pieces

These aren't creatures, but they're tokens, and their HP bar does the work.

| Token | Size | HP / Max HP | Hidden? | Art | Use |
|---|---|---|---|---|---|
| **Warmth** | 1 | 10 / 10 | no | Warmth | the party's shared heat (rules §7); 12 with a Hauler |
| **Storm Clock** | 1 | 0 / 6 | **yes** | Storm Clock | the GM's weather clock (rules §7) |
| **Cairn** | 1 | — | no | Cairn (fallen) → Cairn (raised) | change the image when it's raised (rules §5.4) |
