# ADR 0052 — Localized messages: ids on rejections, `Accept-Language` on REST

**Status:** Proposed — awaiting review by the Real-Time Architecture owner · **Extends:** `docs/adr/0001-event-model.md`, `docs/adr/0002-transport-and-identity.md`
**Change:** `openspec/changes/language-setting-zh-tw` · **Capability:** `localization`

## Context

The app is being offered in English and Traditional Chinese (`zh-TW`), chosen per browser. Most text is the web client's own and moves into client catalogs with no contract change. Three kinds of text that people read are produced outside the client, in English:

| Source | Volume | Reaches the viewer as |
|---|---|---|
| `decide` rejections, `reject(code, message)` | 146 call sites, 32 interpolated | `ServerMessage.rejected.message` |
| Live-room rejections outside `decide` (`liveRoom.ts`) | about 12 | the same |
| REST errors (`identity/`, `http/`, `uvtt/`, wall detection) and zod field issues | about 140 | `{ error, field?, issues? }` |
| Activity-log sentences, `formatActivity` | one per event type | `HistoryResponse.entries[].sentence` |

`decide` and `reduce` must stay pure (invariant 2), so they cannot read a viewer's language. A rejection is shown after it arrives, and the viewer may have switched language since the room opened. Activity sentences need the room's historical state, which only the server has.

## Decision

**Messages are data.** `packages/shared/src/i18n` defines a message reference `{ id, params? }`, where a param is a string, a number or another reference. Catalogs map ids to a string or to a function of typed params, English first; other languages are checked against English at compile time. User content always travels as a plain string param and is never looked up.

**Rejections carry an id.** `reject(code, id, params?)` returns `{ ok: false, code, message, text }`: `text` is the reference and `message` is its English formatting, byte-identical to today's text. `liveRoom.ts` uses ids for its own rejections too. The server message gains two optional fields:

```ts
| { type: "rejected"; clientCommandId: string; code: RejectionCode | "bad_request"; message: string;
    /** Shared catalog id for `message` (ADR 0052); absent for zod parse failures. */
    messageId?: string;
    params?: Record<string, MessageParam> }
```

The client formats `messageId` and `params` in its current language and falls back to `message` when the id is unknown (an older client, a newer server). No connection state holds a language.

**REST asks with `Accept-Language`.** The web client sets `Accept-Language` to its chosen language on every request. A middleware resolves `req.locale` from the header's q-ordered tags with the same mapping the browser default uses (`zh-TW`, `zh-HK`, `zh-MO`, `zh-Hant*` → `zh-TW`; `en*` → `en`; anything else skipped; English when nothing maps), and localized responses send `Content-Language` and `Vary: Accept-Language`. Status codes, error codes and `field` are unchanged in every language. Zod's built-in issues are formatted with zod's bundled `zh-TW` locale; our own `refine` messages are read from the English shared catalog and translated through an English-text → id index.

**Activity sentences take a locale.** `formatActivity(event, actorName, before, locale = "en")` and `activityHistory(roomId, events, viewer, query, locale = "en")`. The history route passes `req.locale`. Entries' `committed` payloads and viewer filtering are unchanged; only `sentence` differs by language.

**Defaults keep English.** A client that sends no `Accept-Language` it can map, or ignores `messageId`, sees exactly today's English: tests, scripts and AI players are unaffected. Persistent state, events and `seq` are untouched.

## Alternatives rejected

- **A per-connection locale** (`HandshakeAuth.locale` plus a `setLocale` client message, with the server formatting rejections). Two schema changes and connection state, and a rejection already on screen stays in the old language after a switch.
- **Ids on REST too, formatted by the client.** The activity log needs server-side history to write its sentences, so REST would end up with two styles. A request-scoped header is the natural fit for request-scoped responses.
- **Translating English text on the client by lookup.** Interpolated messages cannot be matched reliably, and any English edit would silently stop the lookup.
- **An i18n library (i18next, FormatJS, Lingui).** None reaches pure shared code, the server, React and Pixi without the same wrapper; see the change's design.md §1.

## Consequences

- `Decision`'s rejection gains `text`. Code that builds a rejection must use a catalog id; a test formats every id in every language.
- English rejection text is now defined in `packages/shared/src/i18n/en/`, so editing it means editing the catalog entry. Existing English assertions remain the regression guard.
- `ServerMessage.rejected` and the two activity functions change shape additively; no stored data or replay path changes.
