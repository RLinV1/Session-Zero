## Context

The site has Privacy and Terms reading pages and a room "More" menu. There is no news and no way to report a problem. The Figma file "News & Feedback" page holds the agreed layouts: the `/news` reading page, the Feedback dialog with screenshots, its sent state, and the room menu item.

## Goals / Non-Goals

**Goals:** one dialog used everywhere; a report that is useful to Claude Code on its own (what happened, where, on which browser, with pictures); nothing private leaves the reporter's browser unless they attach it or leave technical details on.

**Non-Goals:** an inbox or admin page on the site; replying from the site; showing reports to anyone outside the team; a public roadmap or voting.

## Decisions

### D1. Feedback is not room state
A report is not part of a game, so it never goes through `Command` → `decide` → events. It is a plain REST request. Nothing about it is broadcast, and no seq is spent.

### D2. Anyone can send, within limits
Signed-out visitors, guests and players hit bugs too, so no account is required. `requireSameOrigin` already refuses cross-site posts. A per-address limiter (`feedbackPerIp`, 10 per hour) bounds abuse; every attempt counts. Multer limits the body: at most 3 files of 5 MB and one JSON field of 16 KB.

### D3. Screenshots are re-encoded and kept in the database
Each file's real format is read with `sharp` (PNG, JPEG or WebP only, at most 40 megapixels). It is turned upright from its EXIF orientation, fitted inside 2560 px and written as WebP at quality 85. `sharp` writes no metadata by default, so location and camera data are gone. The bytes go into `feedback_screenshots.bytes` (Postgres `bytea`), not object storage. Reasons:
- they must never be reachable by URL, and `/uploads` is public;
- the private Studio media store is optional and would make feedback depend on it;
- a re-encoded screenshot is usually 100–400 KB and reports are rare, so the database cost is small;
- one transaction stores the report and its images, and deleting the report deletes them.
ADR 0079 records this.

### D4. What technical details contain
`FeedbackTechnical` is an allow-list: page path (pathname only: no query or hash, so an invite token in a URL can never be sent), user agent, screen and viewport size, device pixel ratio, language, and in a room the room ID, the last event number and the role (`gm` or `player`). Every field is length-capped. The dialog's "What's sent" lists the same fields. The schema also accepts an optional `appVersion` for when the web build gets a version number; today it has none, so the dialog doesn't send one.

### D5. Board capture is the viewer's own view
"Capture the board" asks the board for a PNG of exactly what this viewer's canvas shows, through a function in `board/` (React never touches Pixi). A player's capture can only contain what that player already sees. A GM's capture shows fog-hidden areas, so the dialog says so when a GM attaches one.

### D6. Who the report belongs to
A signed-in report stores `reporter_user_id` so the team can look up the address and reply; the dialog says so. The column cascades on user delete, and the memory store mirrors that, so deleting an account removes its reports and images. Reports from people who aren't signed in store no identity, and the dialog says the team can't reply to them.

### D7. Export for Claude Code
`npm run feedback:export --workspace=@vtt/server` reads Postgres (`DATABASE_URL`) and writes `feedback/<reference>/report.md` plus `screenshot-<n>.webp`. `--since <ISO date>` limits it, and `--out <dir>` changes the folder. The report file starts with the kind, summary, date and reference, then the details as written, then the technical details as a list, then the image file names. Reports from the memory store exist only in that server process and can't be exported; the dev default is fine with that. `feedback/` is in `.gitignore`, because reports are user data.

### D8. References
A reference is `FB-` plus 4 characters of Crockford base32 (no I, L, O or U), drawn at random. On a clash the store tries again, up to 5 times. It is unique in the table and is the only id a reporter sees.

## Risks / Trade-offs

- [Images in Postgres grow the database] → 3 images × ~400 KB per report and a rate limit; revisit if reports reach thousands (move to the private media store behind the same interface).
- [Free text can contain personal data] → only the team reads reports, the Privacy page says so, and account deletion removes signed-in reports. Anonymous reports have no owner to delete them for; they can be deleted by reference.
- [A capture reveals fog to its GM's report] → shown in the dialog; the GM is the one sending it.

## Open Questions

- How long to keep reports. Proposed: the team deletes exported reports once fixed; no automatic sweep in this change.
