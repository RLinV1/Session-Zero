## 1. Web

- [x] 1.1 Remove the Checkpoint button and panel from `SceneSetupModal.tsx`; verify `apps/web/test/sceneSetupModal.test.tsx` asserts no Checkpoint button (FR-GM-25)
- [x] 1.2 Update `browser/scenes.spec.ts` and ADR 0045 wording; verify no remaining text offers checkpoints at scene creation

## 2. Verification

- [x] 2.1 Run `npm run lint && npm run typecheck && npm test --workspace=@vtt/web -- sceneSetupModal` and verify all pass
