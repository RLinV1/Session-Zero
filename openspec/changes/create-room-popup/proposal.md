## Why

The dashboard's "Create a room" form is always open in a left column, crowding the room list.

## What Changes

- "Your rooms" heading row gets a primary "Create room" button on the right (FR-GM-01).
- The form (Room name, Your name, Start from template) moves into a "Create a room" modal: Room name autofocused, Enter submits, Esc/Cancel dismiss (blocked while creating), error shown with `role="alert"`.
- The empty state's "Create a room" button opens the same modal.
- Room list uses the full width. Submit logic (`createRoomWith`, navigate to `/r/<id>`) unchanged.
