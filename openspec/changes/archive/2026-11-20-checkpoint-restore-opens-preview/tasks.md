## 1. Panel

- [x] 1.1 Update `apps/web/test/checkpointsPanel.test.tsx` first: rows have Restore and Delete, no Preview button (FR-REC-02); verify it fails before the change
- [x] 1.2 Remove the Preview button from `CheckpointsPanel.tsx`; verify the test passes
- [x] 1.3 Run `npm run lint && npm run typecheck && npm test`
- [x] 1.4 Verify in the browser: Restore opens the preview, no Preview button, restore from the preview works
