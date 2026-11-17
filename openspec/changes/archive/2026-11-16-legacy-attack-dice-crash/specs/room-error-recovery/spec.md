## Purpose

Keeps a failure while drawing part of the room page from leaving the person on a dead, blank screen: they see what happened and have a way back, and the rest of the app keeps working.

## ADDED Requirements

### Requirement: Room failure screen
If the room page fails while rendering, it SHALL replace the room with a failure screen instead of an empty or black page. The screen SHALL say that something went wrong showing this room, SHALL offer "Reload" (reloads the page) and "Back to home" (opens the home page), and SHALL take keyboard focus. Its text SHALL come from the app's text catalogs, in English and zh-TW. It SHALL NOT show the error message, stack or any room data. The failure SHALL be logged to the browser console.

#### Scenario: Render error in the room
- **WHEN** a panel in the room throws while rendering
- **THEN** the person sees the failure screen with Reload and Back to home, not a black page

#### Scenario: No details shown
- **WHEN** the failure screen is shown
- **THEN** it shows no error text, stack trace, token names or other room content

### Requirement: Navigation works after a room failure
After the room failure screen has been shown, the person SHALL be able to leave the room by the screen's controls or by the browser's Back button. The page they reach SHALL render normally without a reload. Opening a different room SHALL show that room, not the failure screen.

#### Scenario: Browser Back to the library
- **WHEN** the failure screen is showing and the GM presses the browser's Back button to return to the library
- **THEN** the library page shows, without a reload

#### Scenario: Another room
- **WHEN** the failure screen is showing for one room and the GM opens a different room
- **THEN** that room loads normally
