# Tasks

## 1. Contracts and storage

- [x] 1.1 Add validated shared detection contracts and an ADR; verify shared tests, lint and typecheck.
- [x] 1.2 Persist detection state in Prisma and memory stores with conditional attempts and recovery; verify store race and deletion tests.

## 2. Processing

- [x] 2.1 Build bounded Python/OpenCV detector and at least 24 labeled fixtures; verify at least 90% of positives are within 2 px and negatives never score high confidence.
- [x] 2.2 Add server-owned image reads, BullMQ and in-process dispatch, private service call, startup recovery and error handling; verify worker tests.
- [x] 2.3 Wire both upload paths and GM-only status/retry endpoints; verify map, token, ownership, retry and privacy server tests.

## 3. Editors and deployment

- [x] 3.1 Poll only while library Edit grid or room Adjust grid is open, show status/confidence, and copy suggestions to draft only on Use suggestion; verify UI tests and typecheck.
- [x] 3.2 Add vision to Compose, CI and deployment documentation, reconcile KAN-10 wording, and verify OpenSpec strict validation.
- [x] 3.3 Run lint, typecheck, tests, build and two-browser review covering private preview, dirty drafts, replacement, low confidence and manual play.

## Verification record (2026-09-27)

- Detector fixtures: 20/20 positive maps within 2 px for size and both offsets; 0/8 negative maps high confidence. Node client received the expected 48 px, (11, 17) suggestion from the live Python HTTP service.
- Repository gates: lint, typecheck, full test suite (221 shared, 134 server, 144 web passed), build, and strict OpenSpec validation passed. The 21 database-dependent server tests, including two new detection store contracts, remained skipped without a local Postgres container.
- Two isolated browser contexts (GM and player): low confidence warning, unchanged dirty draft on result arrival, GM-only preview, explicit Apply and Save, map replacement during an old poll, and manual alignment during analysis were reviewed in Chromium.

## Verification update (2026-09-28)

- An isolated native Postgres 17 database and Redis 8 instance ran on dedicated local ports. All five Prisma migrations applied. The full JS suite passed with both services enabled: 221 shared, 160 server, and 144 web tests; no skips.
- The BullMQ worker processed a queued Postgres map. A full Postgres → Redis → Node → Python request returned the expected 48 px grid at (11, 17), and deleting the asset removed its analysis row. The Python fixture suite, lint, typecheck, build, Prisma schema validation, and strict OpenSpec validation passed.
- Review fixes bound vision responses during streaming, align memory recovery with the 60-second Postgres threshold, keep memory jobs local when Redis is configured, and hide a previous map's poll result during a target change. The shared contract ADR still needs Real-Time Architecture owner review before merge.
