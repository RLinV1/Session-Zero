## 1. Server

- [x] 1.1 Change `WallJobData` to carry `imageKey` instead of `image`, add `putImage` and `dropImage` to `WallJobQueue`, and implement them in `bullmqWallQueue` with a raw `SET ... EX`; verify `npm run typecheck` passes.
- [x] 1.2 In `WallDetections.start`, derive the key from a SHA-256 of the bytes, count live jobs per key, delete the key at zero when a job finishes, fails, times out or is dropped, and refuse a new job beyond the pending cap before storing anything; verify with tests in `apps/server/test/wallDetection.test.ts` for each scenario in the spec.
- [x] 1.3 Map the new refusal to a 503 with a "try again shortly" message in `routes.ts`; verify with a route test.

## 2. Worker

- [x] 2.1 In `wall_worker.py`, read the bytes from Redis by `imageKey`, accept only `vtt:wall-image:<64 hex>`, enforce the size limit on the bytes read, and fail the job when the key is missing; verify with updated tests in `test_wall_worker.py`, including a foreign key that is not read.

## 3. Docs and gates

- [x] 3.1 Update `docs/WALL-DETECTION.md` and add an amendment to ADR 0029 (transport, expiry, sharing, cap, deploy together); verify the text matches the code.
- [x] 3.2 Run `npm run lint && npm run typecheck && npm test`, then the Python tests (`python -m unittest -v test_wall_worker.py` in `services/vision`), then `openspec validate wall-job-image-key --strict`.
