import type { ReactNode } from "react";
import { Link } from "../Link";
import { SiteFooter, PolicyNav, type PolicyPageName } from "../ui/SiteFooter";
import { PRODUCT_NAME, SiteHeader } from "../ui/SiteHeader";
import { AccountLinks } from "./home/AccountLinks";

/**
 * The privacy notice and terms of use (site-policies). Each statement here is checked against the
 * code, not copied from a template: change the page when what the app stores or sets changes.
 *
 * A document, not a decision, so it is a reading page rather than an entry card: the shared
 * header with the two policies as its navigation, one column at reading width on the hub's
 * ground, sections grouped by hairline and space (design-language: "Space and materiality").
 */
export const POLICIES_UPDATED = { iso: "2026-11-04", label: "4 November 2026" };

/** Where a person reaches the project: the repository's issue tracker. */
const CONTACT_URL = "https://github.com/RLinV1/Session-Zero/issues";

function PolicyPage({ page, title, lead, children }: { page: PolicyPageName; title: string; lead: ReactNode; children: ReactNode }) {
  return (
    <div className="policy-page">
      <div className="page-shell page-bar">
        <SiteHeader nav={<PolicyNav current={page} />} account={<AccountLinks />} />
      </div>
      <main className="page-shell">
        <article className="policy" aria-labelledby="policy-title">
          <header className="policy-head">
            <h1 id="policy-title">{title}</h1>
            <p className="policy-lead">{lead}</p>
            <p className="policy-meta">
              Last updated <time dateTime={POLICIES_UPDATED.iso}>{POLICIES_UPDATED.label}</time>
            </p>
          </header>
          {children}
        </article>
      </main>
      <SiteFooter current={page} />
    </div>
  );
}

function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="policy-part">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function PrivacyPage() {
  return (
    <PolicyPage
      page="privacy"
      title="Privacy"
      lead={
        <>
          {PRODUCT_NAME} is a hosted virtual tabletop. This page says what the service keeps about you, why, and how to
          have it deleted.
        </>
      }
    >
      <Part title="What we keep">
        <dl className="policy-terms">
          <dt>Your account</dt>
          <dd>
            Needed only to host a game. Your display name, your email and your password. The password is stored only as
            an Argon2 hash, so nobody can read it back, us included.
          </dd>
          <dt>What a GM makes</dt>
          <dd>Rooms, and the maps, tokens, creatures, encounters, animations and dice looks in their library.</dd>
          <dt>What happens in a room</dt>
          <dd>
            For everyone in it, guests included: the name you join with, and everything done at the table, such as token
            moves, rolls, chat messages and uploaded images. A room keeps this as its history, so the GM can undo
            mistakes and restore earlier points.
          </dd>
          <dt>Joining as a guest</dt>
          <dd>
            You have no account. Your browser keeps a random key that puts you back in your seat; the server keeps only
            a hash of it.
          </dd>
        </dl>
      </Part>

      <Part title="What we don't do">
        <ul>
          <li>No analytics, advertising or tracking, and no scripts, fonts or embeds loaded from other sites.</li>
          <li>We don't sell or share what you put in the app with anyone.</li>
          <li>
            Your IP address is used to slow down repeated requests, including sign-in, sign-up and join attempts. It is
            held in memory for an hour at most and never saved.
          </li>
        </ul>
      </Part>

      <Part title="How long we keep it">
        <ul>
          <li>Account data (name, email, password hash, library) is kept until you delete your account.</li>
          <li>A room and its history are kept until its GM deletes the room, or the GM's account is deleted.</li>
          <li>A sign-in session ends after 30 days without use, or 90 days at most.</li>
        </ul>
      </Part>

      <Part title="Where it is stored">
        <p>
          Our hosting provider stores the database and uploaded files on our behalf. It processes them only to run the
          service for us.
        </p>
      </Part>

      <Part title="Cookies and browser storage">
        <p>
          There is one cookie. It is set when you sign in and keeps you signed in. Scripts on the page can't read it,
          and it ends after 30 days without use or 90 days at most. Because the app can't sign you in without it, there
          is no cookie banner.
        </p>
        <p>
          Your browser's local storage keeps your guest seat key and your preferences, such as the theme, dice look and
          panel layout. These stay in your browser; clearing site data removes them.
        </p>
      </Part>

      <Part title="Who sees what">
        <p>
          People in a room see what the GM shows them: the board, chat and public rolls. Hidden tokens, fog, walls and GM
          rolls are removed on the server before anything reaches a player. The GM of a room sees everything in it.
        </p>
      </Part>

      <Part title="Deleting your data">
        <ul>
          <li>
            Choose <strong>Delete account</strong> on your account page, under Your account in the account menu. It
            removes your rooms, library, uploads and sessions immediately and permanently.
          </li>
          <li>
            Rooms you only joined, run by someone else, keep running. What you did there, such as your name, moves and
            chat messages, stays in that room's history until its GM deletes the room.
          </li>
          <li>A GM can also delete a single room, which removes its whole history, chat and uploaded images.</li>
          <li>You can delete anything in your library yourself.</li>
        </ul>
      </Part>

      <Part title="Contact">
        <p>
          Questions or requests: open an issue on the project's <a href={CONTACT_URL}>GitHub issue tracker</a>. Do not
          post private details there.
        </p>
      </Part>
    </PolicyPage>
  );
}

export function TermsPage() {
  return (
    <PolicyPage
      page="terms"
      title="Terms of use"
      lead={
        <>
          Using {PRODUCT_NAME} means agreeing to these terms and to the <Link href="/privacy">privacy notice</Link>.
        </>
      }
    >
      <Part title="As is">
        <p>
          The service is provided as is, with no warranty of any kind. It may change, break or be unavailable. Keep your
          own copies of maps and art you care about.
        </p>
      </Part>

      <Part title="What you upload">
        <ul>
          <li>You keep the rights to the maps, tokens and other images you upload.</li>
          <li>Upload only what you have the right to use: your own work, work licensed to you, or work that is free to use.</li>
          <li>This also covers anything an AI app adds to a build on your behalf. You review it, and you decide what to publish.</li>
          <li>
            You let us store your uploads and show them to the people in your rooms, only so the app can work. We may
            remove content that infringes someone's rights or breaks these terms.
          </li>
        </ul>
      </Part>

      <Part title="Acceptable use">
        <ul>
          <li>No harassment, hate, or illegal content, in chat, names or images.</li>
          <li>Don't try to break the app, get into other people's rooms or accounts, or flood it with requests.</li>
          <li>A GM runs their own room and can remove anyone from it.</li>
          <li>Keep your password to yourself.</li>
        </ul>
      </Part>

      <Part title="Removing content and accounts">
        <p>We may remove content and close accounts that break these terms. You can delete your own account at any time.</p>
      </Part>

      <Part title="The software, art and sound">
        <p>
          The source code is released under the MIT License. The built-in art was AI-generated for this project, and the
          built-in sound effects are CC0 (public-domain) recordings. Where each piece came from is recorded beside it in
          the source.
        </p>
      </Part>

      <Part title="Changes">
        <p>When these terms change, this page changes and the date above moves. Using the service after that means you accept the new terms.</p>
      </Part>
    </PolicyPage>
  );
}
