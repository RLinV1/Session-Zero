## Why

The app takes an email and password for every GM account, keeps everything said and uploaded in a room, and sets a sign-in cookie, but nowhere tells people what it keeps, who sees it, or how to get it removed. Uploads have no stated rules either: nothing says people need the right to the maps and tokens they upload. The four built-in maps in `public/img/` were the only shipped art with no credits file.

## What Changes

- **A privacy notice at `/privacy`.** It says what the app keeps (account, GM library, room history, guest seat key), what it does not do (no analytics, tracking, third-party scripts or embeds; the IP address is held in memory only, for rate limits), the one cookie and why there is no cookie banner, who sees what in a room, and how data gets deleted. There is no delete-account control, so it names the four team members to ask.
- **Terms of use at `/terms`.** Provided as is by a student project; uploads stay the uploader's and must be theirs to use; conduct at the table; the MIT licence and where the shipped art and sound came from.
- **Links.** One footer, shared by the home page and both policy pages, links both. The sign-up form says, under the fields, that creating an account means agreeing to both, with links. No checkbox.
- **Both are reading pages, not entry cards.** A document is not a decision, and the design language keeps cards for elevation. They get the shared header with Privacy and Terms as its navigation (the current one marked as the hub marks its page), one 65-character column on the hub layer's ground, and sections grouped by hairline. A first version stretched the sign-in card into a long document; the second pass replaced it.
- **A page opens at its top.** `navigate()` kept the scroll position, so the footer's links landed at the bottom of the next page. It now scrolls to the top when the path changes.
- **`public/img/CREDITS.md`** records where the four built-in maps came from. The tool and prompts for the three generated ones were never committed; the file says so.

## Capabilities

### New Capabilities
- `site-policies`: the privacy notice and terms of use, where they are linked from, and the rule that each statement in them matches what the code does.

### Modified Capabilities
None. The footer and sign-up form gain links; no existing requirement changes.

## Impact

- **apps/web:** `pages/PolicyPages.tsx` and `ui/SiteFooter.tsx` (new), routes in `router.ts` and `App.tsx`, the hub layer in `theme.ts`, the footer in `pages/HomePage.tsx`, the sign-up line in `account/AccountPages.tsx`, styles in `styles.css` (`.home-footer` becomes `.site-footer`), test `test/sitePolicies.test.tsx`.
- **docs/INTERFACE.md:** the page inventory, the hub layer's routes, and `SiteFooter` among the shared components.
- **apps/web/public/img/CREDITS.md** (new).
- No change to `packages/shared`, the server, or what the app stores.
