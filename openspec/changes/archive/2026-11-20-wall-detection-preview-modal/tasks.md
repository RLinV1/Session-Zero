## 1. Web

- [x] 1.1 Remove the candidate overlay from `WallCanvas` and the preview figure, placeholder and review stepper from `WallSetup`; verify the canvas draws only the room's walls
- [x] 1.2 Add the "Detected walls" modal (map + walls, count, legend, Apply, Apply confident only, Discard) using `ui/Modal`, returning focus to Detect walls; verify with tests
- [x] 1.3 Update `mapEditorWalls.test.tsx` (FR-GM-09, FR-GM-11): modal opens, Apply, Discard, Escape, doubtful styling, no canvas overlay
- [x] 1.4 Restore wall-review in the modal: click or keyboard erase, doubtful count, Review doubtful walls stepper, Apply sends erased indices, Apply confident only; verify with tests
- [x] 1.5 Add `data-guide` hooks (walls-detection, sight-toggle, sight-add) for the editor Guide
