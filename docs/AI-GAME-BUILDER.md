# Building a game with your AI

If you have the rules, character sheets and art for a game in a folder, your own AI app can do the typing. It reads your materials and fills in a private draft. You check the draft, fix what's wrong and choose what to publish.

Session Zero never calls a model and never receives your rulebook. Your AI app's usage goes on your own plan with that app.

## How it works

1. You start a build, and get a **build pass** to give your AI.
2. Your AI reads your rules and sheets in its own app, and saves creatures, maps and encounters to the draft.
3. The art and maps reach the draft in one of two ways, described below.
4. You review the draft on the build page and publish what you choose.
5. You start a room from a published encounter, as with any encounter.

## Connecting

1. Open **Library → AI builds**, name your build and choose **Start a build**.
2. Copy the message it shows you. **The pass is shown only once.** You can make a new one on the build page, which ends the old one.
3. Add the build address as a connector in your AI app, with no sign-in:

   ```
   https://sessionzero.codes/mcp/build
   ```

   If you host your own copy, use your own site's address. The message you copied already has the right one. In Claude Code:

   ```bash
   claude mcp add --transport http session-zero-build https://sessionzero.codes/mcp/build
   ```

4. Paste the message into your AI app, and tell it where your materials are.

The AI's first step is to read the build and tell you whose it is. If that isn't your name, someone has given you their pass: stop there.

## Getting art and maps in

| Your AI app | Rules and sheets | Art and maps |
|---|---|---|
| Claude Code, or any app that can run commands | It reads your local files | It uploads them with `curl`, one command per file |
| The Claude app, ChatGPT, or anything else | Attach them to your chat | Drop them on the build page. Your AI sees them by name on its next look |

Files never go through the AI's conversation. A build takes PNG, JPEG and WebP images up to 25 MiB, and `.uvtt`, `.dd2vtt` and `.df2vtt` maps up to 40 MiB. PDFs are refused: rules stay in your AI app.

Claude Code needs `poppler` installed to read most PDFs. Run `brew install poppler` or your system's equivalent, or export the rules as text.

## What can and can't be stored

A creature can hold a name, size, HP, Max HP, AC, up to 8 attacks with simple dice, the app's 12 conditions, a colour and one image.

There is no field for class, level, abilities, skills, saves, speed, spells or gear. Your AI lists those under **Not carried over**, and you can copy that text to give to a player.

An attack roll is one group of dice with a modifier, such as `2d6+3`. Damage like `1d12 + 1d6 + 4`, flat damage, or a d3 can't be stored. The AI leaves that roll blank, flags it, and keeps the original text.

Your AI is told never to invent a value. Anything the source doesn't clearly give stays blank with a flag saying why, and blank values stay blank when published.

## Maps

- **A UVTT file** brings its own grid, walls and doors.
- **A plain image** gets a suggested grid from automatic detection, or a size you told your AI. It only counts once you confirm it on the build page.
- An encounter can't be published until its map's grid is confirmed.
- An AI can't draw walls, doors or fog. After publishing, use wall detection in the map editor.

## Reviewing and publishing

The build page shows flags first. There you can:

- change any value, which also stops your AI from overwriting that item;
- confirm or correct each map's grid;
- check which token names players will see, and which tokens are hidden;
- choose what to publish. An encounter brings its map, creatures and art with it.

Only you can publish, from your own signed-in browser. No AI and no pass can. Publishing only adds: an encounter whose name is already used gets a number.

Published items are ordinary library items. They count toward your library's limits and can be edited as usual.

Characters arrive with no owner. Once a player has joined, open the token and set who controls it.

## Undoing it

- **Cancel pass** stops your AI at once. Changing your password ends every pass.
- **Discard this build** deletes the draft and its unpublished files. What you already published stays.
- **Remove** takes out what a build published, and shows where each thing is in use first. Nothing else in your library changes, and no room is deleted. A room still showing a removed image draws a stand-in.
- A build nobody has changed for 14 days closes by itself.

## Limits

| | |
|---|---|
| Open builds per account | 3 |
| A pass lasts | 24 hours |
| Files per build | 100, of which 20 maps |
| Storage per build | 500 MiB |
| Creatures per build | 200 |
| Encounters per build | 20 |
| Requests per pass | 120 a minute |

## Staying safe

Text in a rulebook can try to give your AI instructions. Session Zero limits what a fooled AI can do: its tools reach only this one draft, and you review the draft before anything is used. The worst outcome is wrong values for you to catch.

- Don't give an AI that's doing this broad permission to run commands.
- Don't connect this next to tools that hold private data, such as your email.
- Your pass sits in your AI app's conversation, and so on that company's servers. It reaches one draft, for at most 24 hours.

Only upload art and maps you have the right to use. Rooms share them with the people at your table, and game text and art are usually protected even when the rules themselves may not be.

## Cost

A full build of a one-session game took Claude Code on Sonnet about 6 minutes and $1 of usage: 58 KB of rules and adventure, 4 maps, 22 tokens, 17 creatures and 4 encounters. On a subscription, it counts toward your usage limits. Long rulebooks cost more, so give your AI only the pages it needs.

## Which apps have been tried

| App | Connects with no sign-in | Sends the pass | Full build |
|---|---|---|---|
| Claude Code | Yes | Yes | Yes |
| The Claude app | Not yet tried | Not yet tried | Not yet tried |
| ChatGPT | Not yet tried | Not yet tried | Not yet tried |
