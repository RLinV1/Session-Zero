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
export const POLICIES_UPDATED = { iso: "2026-11-02", label: "2 November 2026" };

/** README §10. There is no team address, so a request goes to any of the people who built it. */
const TEAM = ["Antonio Cottone", "Raymond Lin", "Christos Psimadas", "Vincent Chen"];
const listOf = (names: string[], last: "and" | "or") => `${names.slice(0, -1).join(", ")} ${last} ${names[names.length - 1]}`;

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
          {PRODUCT_NAME} is a student project, built by {listOf(TEAM, "and")} for CSE 416 at Stony Brook University. It
          is not a business. This page says what the app keeps about you and why.
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
            Your IP address is used to slow down repeated sign-in, sign-up and join attempts. It is held in memory for an
            hour at most and never saved.
          </li>
        </ul>
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
          <li>A GM can delete a room. That removes its whole history, chat and the images uploaded into it.</li>
          <li>You can delete anything in your library yourself.</li>
          <li>
            There is no button to delete an account yet. Ask any of us ({listOf(TEAM, "or")}) through the CSE 416
            course, and we will delete your account and everything it owns.
          </li>
        </ul>
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
          {PRODUCT_NAME} is a free student project, built by {listOf(TEAM, "and")} for CSE 416 at Stony Brook University.
          Using it means agreeing to these terms and to the <Link href="/privacy">privacy notice</Link>.
        </>
      }
    >
      <Part title="As is">
        <p>
          The app is provided as is, with no warranty. It may change, break, be reset or be taken down, for example when
          the course ends. Keep your own copies of maps and art you care about.
        </p>
      </Part>

      <Part title="What you upload">
        <ul>
          <li>You keep the rights to the maps, tokens and other images you upload.</li>
          <li>Upload only what you have the right to use: your own work, work licensed to you, or work that is free to use.</li>
          <li>
            You let us store your uploads and show them to the people in your rooms, only so the app can work. We remove
            anything shown to infringe someone's rights.
          </li>
        </ul>
      </Part>

      <Part title="At the table">
        <ul>
          <li>No harassment, hate, or illegal content, in chat, names or images.</li>
          <li>Don't try to break the app, get into other people's rooms or accounts, or flood it with requests.</li>
          <li>A GM runs their own room and can remove anyone from it.</li>
          <li>Keep your password to yourself. We may close an account that breaks these terms.</li>
        </ul>
      </Part>

      <Part title="The software, art and sound">
        <p>
          The source code is released under the MIT License. The art that ships with the app was made for this project,
          and its sound effects are public-domain (CC0) recordings. Where each piece came from is recorded beside it in
          the source.
        </p>
      </Part>

      <Part title="Changes">
        <p>When these terms change, this page changes and the date above moves.</p>
      </Part>
    </PolicyPage>
  );
}
