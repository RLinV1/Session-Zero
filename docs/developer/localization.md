# Localization

The app ships in English (`en`) and Traditional Chinese (`zh-TW`). Text people read never
appears as a literal in a component. Terms follow [`../GLOSSARY-zh-TW.md`](../GLOSSARY-zh-TW.md).

## Web text

Catalogs live in `apps/web/src/i18n/en/*.ts`, with the same files in `zh-TW/`. Each file
covers one area (`board.ts`, `panels.ts`, `table.ts`, `editor.ts`, `common.ts`, …).

1. Add the key to the English file. Keys are `area.name`. A value is a string, or a function
   of named parameters:

   ```ts
   "board.outOfRange": "Out of range",
   "board.placedN": ({ n }: { n: number }) => ` · ${n} placed`,
   ```

2. Add the same key to the matching zh-TW file. Each zh-TW file is typed
   `satisfies Catalog<typeof common>` (or its own area's English object), so a missing key
   fails `npm run typecheck`.

3. Render it with the hook:

   ```tsx
   import { useT } from "../i18n/locale";

   const t = useT();
   return <span>{t("board.outOfRange")}</span>;
   ```

### The lint guard

`eslint.config.js` refuses literal words in JSX text and in `aria-label`, `title`,
`placeholder` and `alt` across `apps/web/src/**/*.tsx`. The only exemption is
`apps/web/src/pages/build/**` (the AI build screens), which are not translated yet.
`apps/web/test/lintGuard.test.ts` stops that exemption list from growing.

## Server text

Text the server sends that people read, such as rejection messages, is a catalog id, not a
sentence (ADR 0054). Shared messages live in `packages/shared/src/i18n/messages/en/` and
`zh-TW/`. In `decide`, refer to them by id:

```ts
return reject("invalid", sharedMsg("reject.drawingOffMap"));
```

A `rejected` message carries both the English `message` and the `messageId` with its
`params`, so each client shows it in its own language. REST responses honour the
`Accept-Language` header.

## Checking your work

- Switch the language in **Settings → Language** and look at your screen in both languages.
- `npm run lint` catches literal text; `npm run typecheck` catches missing zh-TW keys.
