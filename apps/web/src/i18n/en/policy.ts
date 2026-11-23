import type { CatalogSource } from "@vtt/shared";

/**
 * The privacy notice and terms of use (site-policies). The English governs: a translated page says
 * so and links to this text (localization: "Policy pages in the chosen language").
 */
export const policy = {
  "policy.lastUpdated": "Last updated",
  "policy.englishGoverns": "This page is a translation. If it differs from the English version, the English version governs.",
  "policy.showEnglish": "Show the English version",
  "policy.showTranslation": "Show the translation",

  "privacy.title": "Privacy",
  "privacy.lead": ({ product }: { product: string }) =>
    `${product} is a hosted virtual tabletop. This page says what the service keeps about you, why, and how to have it deleted.`,
  "privacy.keep.title": "What we keep",
  "privacy.keep.account.term": "Your account",
  "privacy.keep.account.body":
    "Needed only to host a game. Your display name, your email and your password. The password is stored only as an Argon2 hash, so nobody can read it back, us included. If you sign up through a referral link, we record the platform with your account and show only aggregate counts in our admin panel.",
  "privacy.keep.gm.term": "What a GM makes",
  "privacy.keep.gm.body": "Rooms, and the maps, tokens, creatures, encounters, animations and dice looks in their library.",
  "privacy.keep.room.term": "What happens in a room",
  "privacy.keep.room.body":
    "For everyone in it, guests included: the name you join with, and everything done at the table, such as token moves, rolls, chat messages and uploaded images. A room keeps this as its history, so the GM can undo mistakes and restore earlier points.",
  "privacy.keep.guest.term": "Joining as a guest",
  "privacy.keep.guest.body":
    "You have no account. Your browser keeps a random key that puts you back in your seat; the server keeps only a hash of it.",
  "privacy.keep.build.term": "An AI build",
  "privacy.keep.build.body":
    "The files your AI app adds to a build, and the creatures, maps and encounters it drafts, are kept in a private draft that only you can see until you publish it. The pass that lets the AI in is shown once; the server keeps only a hash of it.",
  "privacy.keep.feedback.term": "Feedback you send",
  "privacy.keep.feedback.body":
    "A report you send through Feedback: what you wrote, any screenshots you attached and, unless you turn them off, technical details (the page, your browser, screen size and language, and in a room its ID, event number and your role). Screenshots are re-encoded to remove location and camera data. Only the Session Zero team reads reports. If you are signed in, the report is linked to your account so we can reply.",
  "privacy.dont.title": "What we don't do",
  "privacy.dont.tracking": "We use no advertising or third-party tracking and load no scripts, fonts or embeds from other sites.",
  "privacy.dont.sell": "We don't sell or share what you put in the app with anyone.",
  "privacy.dont.ai":
    "We don't send what you put in the app to any AI company. An AI app gets room or build data only when a person connects it, as described under AI apps below.",
  "privacy.dont.ip":
    "Your IP address is used to slow down repeated requests, including sign-in, sign-up and join attempts. It is held in memory for an hour at most and never saved.",
  "privacy.long.title": "How long we keep it",
  "privacy.long.account": "Account data (name, email, password hash, library) is kept until you delete your account.",
  "privacy.long.room": "A room and its history are kept until its GM deletes the room, or the GM's account is deleted.",
  "privacy.long.session": "A sign-in session ends after 30 days without use, or 90 days at most.",
  "privacy.long.pass":
    "A build pass stops working after 24 hours, or sooner when you make a new one, cancel it, discard the build, change your password or delete your account.",
  "privacy.long.build":
    "A build nobody has changed for 14 days is closed, as if discarded: its unpublished files and drafts are deleted. What you published stays in your library.",
  "privacy.long.feedback":
    "Feedback is kept until we have dealt with it. Deleting your account deletes the reports you sent while signed in.",
  "privacy.where.title": "Where it is stored",
  "privacy.where.body":
    "Our hosting provider stores the database and uploaded files on our behalf. It processes them only to run the service for us.",
  "privacy.cookies.title": "Cookies and browser storage",
  "privacy.cookies.one":
    "There is one cookie. It is set when you sign in and keeps you signed in. Scripts on the page can't read it, and it ends after 30 days without use or 90 days at most. Because the app can't sign you in without it, there is no cookie banner.",
  "privacy.cookies.local":
    "Your browser's local storage keeps your guest seat key and your preferences, such as the theme, language, dice look and panel layout. These stay in your browser; clearing site data removes them.",
  "privacy.who.title": "Who sees what",
  "privacy.who.body":
    "People in a room see what the GM shows them: the board, chat and public rolls. Hidden tokens, fog, walls and GM rolls are removed on the server before anything reaches a player. The GM of a room sees everything in it.",
  "privacy.who.ai":
    "A player may seat their own AI app at the table. That seat sees what any player sees, including the chat you write, and passes it to that person's AI app. Its name ends in (AI), and the GM can remove it like any player.",
  "privacy.ai.title": "AI apps",
  "privacy.ai.lead":
    "You can connect your own AI app, such as a chat app, to our MCP server: to hold a player seat in a room, or to fill a build with the AI game builder.",
  "privacy.ai.vendor":
    "Whatever the AI reads, such as the board, the map with fog painted on, names, chat and rolls, or the build's files, goes to the company that runs your AI app. That company handles it under its own terms and privacy policy, not ours.",
  "privacy.ai.seat":
    "An AI seat is a player seat. It never gets what players can't see, and the MCP server refuses a GM's seat.",
  "privacy.ai.build":
    "A build pass reaches only that one draft. It can't publish, or read your library, rooms or account.",
  "privacy.ai.server":
    "The MCP server runs on our host and stores nothing. It holds a seat's key in memory only while the seat is connected, and the latest ping from each person for 60 seconds. It never writes seat keys or passes to disk or to its logs.",
  "privacy.ai.ip": "It passes your IP address on to the room server, so the limits on repeated requests apply to you, not to everyone using AI.",
  "privacy.delete.title": "Deleting your data",
  "privacy.delete.account.before": "Choose ",
  "privacy.delete.account.strong": "Delete account",
  "privacy.delete.account.after":
    " on your account page, under Your account in the account menu. It removes your rooms, library, uploads and sessions immediately and permanently.",
  "privacy.delete.joined":
    "Rooms you only joined, run by someone else, keep running. What you did there, such as your name, moves and chat messages, stays in that room's history until its GM deletes the room.",
  "privacy.delete.room": "A GM can also delete a single room, which removes its whole history, chat and uploaded images.",
  "privacy.delete.library": "You can delete anything in your library yourself.",
  "privacy.delete.build":
    "Choose Discard this build on a build's page to delete its unpublished files and drafts at once. Deleting your account removes your builds too.",
  "privacy.delete.ai":
    "To remove an AI seat, its user can tell it to leave, or the GM can remove it. What the AI app already received stays with that app; ask its company to delete it.",
  "privacy.contact.title": "Contact",
  "privacy.contact.before": "Questions or requests: open an issue on the project's ",
  "privacy.contact.link": "GitHub issue tracker",
  "privacy.contact.after": ". Do not post private details there.",

  "terms.title": "Terms of use",
  "terms.lead.before": ({ product }: { product: string }) => `Using ${product} means agreeing to these terms and to the `,
  "terms.lead.link": "privacy notice",
  "terms.lead.after": ".",
  "terms.asIs.title": "As is",
  "terms.asIs.body":
    "The service is provided as is, with no warranty of any kind. It may change, break or be unavailable. Keep your own copies of maps and art you care about.",
  "terms.upload.title": "What you upload",
  "terms.upload.rights": "You keep the rights to the maps, tokens and other images you upload.",
  "terms.upload.only": "Upload only what you have the right to use: your own work, work licensed to you, or work that is free to use.",
  "terms.upload.ai": "This also covers anything an AI app adds to a build on your behalf. You review it, and you decide what to publish.",
  "terms.upload.license":
    "You let us store your uploads and show them to the people in your rooms, only so the app can work. We may remove content that infringes someone's rights or breaks these terms.",
  "terms.use.title": "Acceptable use",
  "terms.use.harassment": "No harassment, hate, or illegal content, in chat, names or images.",
  "terms.use.break": "Don't try to break the app, get into other people's rooms or accounts, or flood it with requests.",
  "terms.use.gm": "A GM runs their own room and can remove anyone from it.",
  "terms.use.password": "Keep your password to yourself.",
  "terms.ai.title": "AI apps",
  "terms.ai.yours":
    "You can connect your own AI app to hold a player seat or to fill a build. What it does through your seat or pass counts as what you do, and these terms apply to it.",
  "terms.ai.vendor":
    "Your AI app is a separate service with its own terms and costs. We don't provide it, and we aren't responsible for what it writes or does, or for what it does with what it reads.",
  "terms.ai.secret":
    "Treat a seat and a build pass like a password: anyone holding one can act through it. If one leaks, cancel the pass on the build page or ask the GM to remove the seat.",
  "terms.ai.table":
    "Seat an AI only at a table where it is welcome. Don't present an AI as a person, or use one to flood a room or get around a GM.",
  "terms.ai.review": "AI output can be wrong. Check a build before you publish it; publishing is always your decision.",
  "terms.ai.limits": "The AI tools have their own request limits, and we may change or turn them off at any time.",
  "terms.remove.title": "Removing content and accounts",
  "terms.remove.body": "We may remove content and close accounts that break these terms. You can delete your own account at any time.",
  "terms.software.title": "The software, art and sound",
  "terms.software.body":
    "The source code is released under the MIT License. The built-in art was AI-generated for this project, and the built-in sound effects are CC0 (public-domain) recordings. Where each piece came from is recorded beside it in the source.",
  "terms.changes.title": "Changes",
  "terms.changes.body":
    "When these terms change, this page changes and the date above moves. Using the service after that means you accept the new terms.",
} as const satisfies CatalogSource;
