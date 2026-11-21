# Spec Delta

## Purpose

Lets every viewer use Session Zero in their own language. It covers the language choice, which text follows it (the web UI, the board, server messages and formatting), which text never does (what people typed), and how other specs' quoted English text applies in other languages.

## ADDED Requirements

### Requirement: Supported languages
The app SHALL offer English (`en`) and Traditional Chinese (`zh-TW`). Each language SHALL be named in itself wherever it is offered, "English" and "繁體中文", so a viewer can find their own language whatever the current one is. English SHALL be the fallback language.

#### Scenario: Languages are named in themselves
- **WHEN** a viewer reading the app in English opens the language control
- **THEN** the options are "English" and "繁體中文"

#### Scenario: Same names in Chinese
- **WHEN** a viewer reading the app in Traditional Chinese opens the language control
- **THEN** the options are still "English" and "繁體中文"

### Requirement: First visit follows the browser's languages
With no saved choice, the app SHALL take the first entry in the browser's preferred languages that it can map: `zh-TW`, `zh-HK`, `zh-MO` and any `zh-Hant` tag map to Traditional Chinese, and any `en` tag maps to English. Other tags, including Simplified Chinese and bare `zh`, SHALL be skipped. If nothing maps, the app SHALL use English.

#### Scenario: Taiwan browser
- **WHEN** a first-time visitor's browser prefers `zh-TW`, then `en-US`
- **THEN** the home page opens in Traditional Chinese

#### Scenario: Hong Kong browser
- **WHEN** a first-time visitor's browser prefers `zh-HK`
- **THEN** the app opens in Traditional Chinese

#### Scenario: Unsupported first preference
- **WHEN** a first-time visitor's browser prefers `ja-JP`, then `zh-TW`
- **THEN** the app opens in Traditional Chinese

#### Scenario: Simplified Chinese browser
- **WHEN** a first-time visitor's browser prefers only `zh-CN`
- **THEN** the app opens in English, and the language control offers "繁體中文"

### Requirement: The choice is saved in this browser
A language the viewer picks SHALL be saved in this browser and SHALL win over the browser's preferences on every later visit, on every page, for guests and signed-in users alike. It SHALL NOT be saved to the account or sent to other devices. If the browser cannot store it, the choice SHALL last until the page is closed.

#### Scenario: Choice survives a reload
- **WHEN** a viewer whose browser prefers English picks "繁體中文" and reloads the page
- **THEN** the page reloads in Traditional Chinese

#### Scenario: Choice holds across pages
- **WHEN** a viewer picks "繁體中文" on the home page and then opens an invite link
- **THEN** the join page is in Traditional Chinese

#### Scenario: Private window
- **WHEN** storage is unavailable and the viewer picks "繁體中文"
- **THEN** the app switches to Traditional Chinese for that page and returns to the browser default on the next visit

### Requirement: The language control is reachable everywhere
A language control SHALL be available on the home and hub pages (dashboard, library, account, policy pages), on the entry pages (sign-in, sign-up, join, not found), and at the table through the Settings dialog. It SHALL be operable by keyboard, SHALL have an accessible name in the current language, and SHALL show which language is selected.

#### Scenario: Join page before joining
- **WHEN** a player opens an invite link in an English page
- **THEN** a language control is visible before they enter a display name, and choosing "繁體中文" switches the join page

#### Scenario: Language at the table
- **WHEN** a player at the table opens Settings
- **THEN** a Language section offers "English" and "繁體中文" with the current one selected

#### Scenario: Keyboard only
- **WHEN** a viewer reaches the language control with Tab and chooses a language with the keyboard
- **THEN** the language changes and focus stays on the control

### Requirement: Switching applies at once
Changing the language SHALL update everything on screen without a reload: the page, open dialogs and menus, the board's own text, and the document title. It SHALL NOT disconnect from a room, discard an unsaved draft or form input, close an open dialog, or change any room state.

#### Scenario: Switch during play
- **WHEN** a player at the table switches to "繁體中文" in Settings
- **THEN** the Settings dialog, the sidebar panels and the board's condition markers show Traditional Chinese, and the player stays connected with no change to the room

#### Scenario: Draft kept
- **WHEN** a GM has typed into the token editor and switches language
- **THEN** the typed values are still in the fields

### Requirement: The whole web UI is translated
In Traditional Chinese, all text the app itself provides SHALL be in Traditional Chinese: visible text, accessible names, tooltips, placeholders, image alt text, empty states, errors, confirmations, guided tours, notices, the document title and the meta description. The product name "Session Zero" and dice notation such as "1d20+5" SHALL stay as they are.

#### Scenario: Home page
- **WHEN** a viewer opens the home page in Traditional Chinese
- **THEN** its headings, buttons, demo captions and footer links are Traditional Chinese, and the product name reads "Session Zero"

#### Scenario: Accessible names
- **WHEN** a screen reader user reaches the board tool rail in Traditional Chinese
- **THEN** every tool's accessible name and tooltip is Traditional Chinese

#### Scenario: Document title
- **WHEN** a viewer switches to Traditional Chinese on the library page
- **THEN** the browser tab's title is the Traditional Chinese page title

### Requirement: Policy pages in the chosen language
The privacy and terms pages SHALL be shown in the chosen language. A translated policy page SHALL state, in that language, that the English version governs if the two differ, and SHALL link to the English version.

#### Scenario: Terms in Chinese
- **WHEN** a viewer reading in Traditional Chinese opens the terms page
- **THEN** the terms are in Traditional Chinese, with a note that the English version governs and a link that shows the English text

### Requirement: The page declares its language
The document's `lang` attribute SHALL be `en` or `zh-TW` to match the current language, and SHALL change when the language changes. Text shown in a language other than the page's, such as a language's own name in the language control, SHALL carry its own `lang`.

#### Scenario: Lang follows the choice
- **WHEN** a viewer switches from English to "繁體中文"
- **THEN** `<html lang>` changes from `en` to `zh-TW`

#### Scenario: Language names marked
- **WHEN** the page is in English
- **THEN** the "繁體中文" option is marked `lang="zh-TW"`

### Requirement: What people typed is never translated
Text that a person entered SHALL be shown exactly as entered in every language: room names, display names, token names, scene and map names, attack names, chat messages, GM notes, library item names and labels. The app SHALL NOT machine-translate content.

#### Scenario: Token name unchanged
- **WHEN** a GM named a token "Goblin Archer" and a player views the board in Traditional Chinese
- **THEN** the token's label reads "Goblin Archer"

#### Scenario: Chat unchanged
- **WHEN** a player sends "Ready!" in chat and another viewer reads the chat in Traditional Chinese
- **THEN** the message reads "Ready!"

### Requirement: Text the app copies into a room becomes room data
When the app copies its own text into the room or the library on a person's behalf, such as a built-in creature's name when it is placed or a preset attack's name when it is added, the copied text SHALL be in that person's current language. From then on it SHALL be treated as typed content and SHALL NOT change with any viewer's language.

#### Scenario: Built-in creature placed in Chinese
- **WHEN** a GM reading in Traditional Chinese places the built-in Goblin creature
- **THEN** the new token is named with the Traditional Chinese name, and a player reading in English sees that same name

### Requirement: Command rejections in the viewer's language
When the server refuses a room action, the reason SHALL be shown in the viewer's current language, including when the language changed after the room was opened. Clients that do not ask for a language SHALL keep receiving the English reason.

#### Scenario: Blocked move in Chinese
- **WHEN** a player reading in Traditional Chinese drags a token onto a wall
- **THEN** the refusal reads in Traditional Chinese

#### Scenario: Script client
- **WHEN** a client that never chose a language sends a refused command
- **THEN** the rejection's message is the English reason, as before

### Requirement: Server errors in the requested language
REST responses that carry a message for people, including sign-in, sign-up, account, room, library, upload, map import and wall analysis errors and per-field form errors, SHALL be in the language the request asks for. A request that asks for no supported language SHALL get English. Error codes and status codes SHALL be the same in every language.

#### Scenario: Wrong password in Chinese
- **WHEN** a viewer reading in Traditional Chinese signs in with a wrong password
- **THEN** the sign-in form shows the error in Traditional Chinese next to the password field

#### Scenario: Field error in Chinese
- **WHEN** a viewer reading in Traditional Chinese submits sign-up with an invalid email
- **THEN** the email field's error is in Traditional Chinese

#### Scenario: Unsupported language
- **WHEN** a request asks for `fr-FR` only
- **THEN** the error message is in English and the status code is unchanged

### Requirement: Activity log in the viewer's language
Activity log sentences SHALL be written in the GM's current language, with names that people typed kept as typed. Switching language while the log is open SHALL show the entries again in the new language.

#### Scenario: Move sentence in Chinese
- **WHEN** a GM reading in Traditional Chinese opens the activity log after Sam moved token "Aria"
- **THEN** the entry is a Traditional Chinese sentence that names "Sam" and "Aria" as typed

#### Scenario: Switch with the log open
- **WHEN** the GM switches to English with the activity log open
- **THEN** the same entries are shown in English

### Requirement: Dates, times and numbers follow the language
Dates, times, relative times ("5 minutes ago"), numbers and lists the app formats SHALL use the conventions of the current language. Board coordinates, dice totals and dice notation SHALL keep plain digits in every language.

#### Scenario: Chat time in Chinese
- **WHEN** a viewer reads chat in Traditional Chinese
- **THEN** message times use Traditional Chinese time formatting, such as "下午3:05"

#### Scenario: Relative time
- **WHEN** a room on the dashboard was last opened three days ago and the viewer reads in Traditional Chinese
- **THEN** it reads as a Traditional Chinese relative time, such as "3 天前"

### Requirement: Chinese text renders in a matching system face
Chinese text SHALL render in a Traditional Chinese system font that follows the app's typeface in every font stack, on the page and on the board. The app SHALL NOT download a Chinese web font or request fonts from a third party.

#### Scenario: Board label in Chinese
- **WHEN** a token is named "弓箭手" and the board draws its label
- **THEN** the label shows all three characters with no missing-glyph boxes

#### Scenario: No font download
- **WHEN** a viewer loads the app in Traditional Chinese
- **THEN** no font file other than the app's own Geist faces is requested

### Requirement: Game terms are consistent
Traditional Chinese text SHALL use one glossary for game terms, such as hit points, armor class, initiative, conditions, advantage and the area shapes, so a term reads the same in the panels, on the board, in server messages and in the activity log.

#### Scenario: Condition name everywhere
- **WHEN** a GM marks a token Prone while reading in Traditional Chinese
- **THEN** the token editor, the board marker's tooltip and the activity log all use the glossary's term for Prone

### Requirement: Quoted English UI text in other specs
Where another capability's requirement quotes English text the app shows, such as a button reading "Leave table", the requirement SHALL be met in Traditional Chinese by the catalog translation of that text, with the same role, position and behaviour.

#### Scenario: Leave table in Chinese
- **WHEN** a player reading in Traditional Chinese is at the table
- **THEN** the sidebar shows the Traditional Chinese "Leave table" button in the place and with the behaviour the leave-table spec requires

### Requirement: No untranslated text ships
Every text entry in the English catalog SHALL have a Traditional Chinese entry, and the project's checks SHALL fail when one is missing or when app code shows English text that is not in a catalog. At runtime, an entry missing from the current language SHALL show its English text, never an internal id.

#### Scenario: Missing translation blocks the build
- **WHEN** a developer adds an English entry without a Traditional Chinese one
- **THEN** the typecheck fails and names the missing entry

#### Scenario: Hard-coded label blocks lint
- **WHEN** a developer writes a button with the literal text "Save" in a component
- **THEN** lint fails on that line
