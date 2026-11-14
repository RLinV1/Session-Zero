# ADR 0069: Sign-up discloses a taken email, bounded by a per-address limit

**Status:** Accepted · **Owner:** Real-Time Architecture (Raymond) · **Relates to:** `docs/adr/0017` (accounts), `docs/EDGE-PROTECTION.md`
**Change:** `openspec/changes/security-review-findings`

## Context

A security review on 2026-11-13 noted that sign-up answers 409 with `field: "email"` when an address is already registered, so anyone can test whether a person has an account. The usual fix is to answer every sign-up the same way and send a confirmation email, but the app cannot send email, so a user could never learn that their address was taken, or confirm a new account.

## Decision

- Keep the 409 `field: "email"` response, so a person who forgot they had an account is told so.
- No email verification.
- Sign-in stays uniform: a wrong email and a wrong password get the same answer and cost the same time.
- Sign-ups are limited to 50 attempts per IP address per hour (`signUpPerIp`), shared across accounts on that IP and retained at the owner's request. Refused sign-ups get a 429 that says nothing about the email.

## Consequences

- Enumeration is bounded to 50 guesses per address per hour, and each guess creates an account when the email is free.
- A classroom behind one NAT can hit the limit when a whole class signs up in one hour.
- Revisit with a different key (for example per email domain) or a challenge if classes report the limit, or when the app can send email, at which point sign-up can answer uniformly.
