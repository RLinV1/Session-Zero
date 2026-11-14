## Purpose

Defines the browser security headers that every production response carries, so browsers refuse framing, MIME sniffing, protocol downgrades and content the app never loads.

## ADDED Requirements

### Requirement: Every production response carries browser security headers
In the production deployment, every response served through the edge proxy SHALL carry:
- `Strict-Transport-Security` with a `max-age` of at least one year, without `preload`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- a `Referrer-Policy`

This SHALL hold for the web app, client-side routes that fall back to `index.html`, `/uploads/*`, `/api/*`, `/health` and `/mcp`. Responses under `/api/*` SHALL keep `Referrer-Policy: no-referrer`.

#### Scenario: Home page headers
- **WHEN** a client requests `/` from the production proxy
- **THEN** the response has Strict-Transport-Security, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` and a Referrer-Policy

#### Scenario: Client route fallback
- **WHEN** a client requests a client-side route such as `/gm-dashboard` that is served as `index.html`
- **THEN** the response carries the same headers as `/`

#### Scenario: API keeps its stricter referrer policy
- **WHEN** a client requests any `/api/*` path
- **THEN** the response has `Referrer-Policy: no-referrer` and the other headers in this requirement

### Requirement: Content Security Policy for the web app
HTML responses SHALL carry a `Content-Security-Policy` that:
- allows scripts, styles, fonts, images, media, workers and connections only from the app's own origin
- also allows `data:` and `blob:` where the app creates such URLs
- allows the app's own WebSocket on the same host
- sets `frame-ancestors 'none'`, `object-src 'none'` and `base-uri 'self'`

The policy SHALL NOT include `'unsafe-eval'`. Using the app SHALL produce no CSP violation in the browser console.

#### Scenario: Framing is refused
- **WHEN** another origin embeds the app in an iframe
- **THEN** the browser refuses to render it

#### Scenario: No violations in normal use
- **WHEN** a GM signs in, opens the dashboard, opens a room with a map and tokens, rolls dice, and a player joins from an invite
- **THEN** the browser console shows no Content Security Policy violation

#### Scenario: Eval is not allowed
- **WHEN** the CSP header is read
- **THEN** it does not contain `'unsafe-eval'`
