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
    "Needed only to host a game. Your display name, your email and your password. The password is stored only as an Argon2 hash, so nobody can read it back, us included.",
  "privacy.keep.gm.term": "What a GM makes",
  "privacy.keep.gm.body": "Rooms, and the maps, tokens, creatures, encounters, animations and dice looks in their library.",
  "privacy.keep.room.term": "What happens in a room",
  "privacy.keep.room.body":
    "For everyone in it, guests included: the name you join with, and everything done at the table, such as token moves, rolls, chat messages and uploaded images. A room keeps this as its history, so the GM can undo mistakes and restore earlier points.",
  "privacy.keep.guest.term": "Joining as a guest",
  "privacy.keep.guest.body":
    "You have no account. Your browser keeps a random key that puts you back in your seat; the server keeps only a hash of it.",
  "privacy.dont.title": "What we don't do",
  "privacy.dont.tracking": "No analytics, advertising or tracking, and no scripts, fonts or embeds loaded from other sites.",
  "privacy.dont.sell": "We don't sell or share what you put in the app with anyone.",
  "privacy.dont.ip":
    "Your IP address is used to slow down repeated requests, including sign-in, sign-up and join attempts. It is held in memory for an hour at most and never saved.",
  "privacy.long.title": "How long we keep it",
  "privacy.long.account": "Account data (name, email, password hash, library) is kept until you delete your account.",
  "privacy.long.room": "A room and its history are kept until its GM deletes the room, or the GM's account is deleted.",
  "privacy.long.session": "A sign-in session ends after 30 days without use, or 90 days at most.",
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
  "privacy.delete.title": "Deleting your data",
  "privacy.delete.account.before": "Choose ",
  "privacy.delete.account.strong": "Delete account",
  "privacy.delete.account.after":
    " on your account page, under Your account in the account menu. It removes your rooms, library, uploads and sessions immediately and permanently.",
  "privacy.delete.joined":
    "Rooms you only joined, run by someone else, keep running. What you did there, such as your name, moves and chat messages, stays in that room's history until its GM deletes the room.",
  "privacy.delete.room": "A GM can also delete a single room, which removes its whole history, chat and uploaded images.",
  "privacy.delete.library": "You can delete anything in your library yourself.",
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
  "terms.upload.license":
    "You let us store your uploads and show them to the people in your rooms, only so the app can work. We may remove content that infringes someone's rights or breaks these terms.",
  "terms.use.title": "Acceptable use",
  "terms.use.harassment": "No harassment, hate, or illegal content, in chat, names or images.",
  "terms.use.break": "Don't try to break the app, get into other people's rooms or accounts, or flood it with requests.",
  "terms.use.gm": "A GM runs their own room and can remove anyone from it.",
  "terms.use.password": "Keep your password to yourself.",
  "terms.remove.title": "Removing content and accounts",
  "terms.remove.body": "We may remove content and close accounts that break these terms. You can delete your own account at any time.",
  "terms.software.title": "The software, art and sound",
  "terms.software.body":
    "The source code is released under the MIT License. The built-in art was AI-generated for this project, and the built-in sound effects are CC0 (public-domain) recordings. Where each piece came from is recorded beside it in the source.",
  "terms.changes.title": "Changes",
  "terms.changes.body":
    "When these terms change, this page changes and the date above moves. Using the service after that means you accept the new terms.",
} as const satisfies CatalogSource;
