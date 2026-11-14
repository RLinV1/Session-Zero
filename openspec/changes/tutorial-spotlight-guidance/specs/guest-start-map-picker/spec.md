## Purpose

Shows the shipped maps on the guest start page at their real shape and a size that lets the visitor compare several at once.

## ADDED Requirements

### Requirement: Map thumbnails keep their shape
Each map on the guest start page SHALL show its thumbnail at the thumbnail's own aspect ratio, without stretching or cropping it to another shape. Each card SHALL be at most 16rem wide. On a screen at least 1024px wide the page SHALL show at least three maps in one row with their names, without scrolling, below the page heading. At 390px wide the page SHALL show two maps per row with no horizontal scroll.

#### Scenario: Desktop shows a row of maps
- **WHEN** a visitor opens `/start` in a 1024x768 window
- **THEN** at least three map cards and their names are visible without scrolling, and each thumbnail is as wide as it is shaped (16:9 for the shipped maps), not a tall portrait

#### Scenario: Phone width
- **WHEN** a visitor opens `/start` 390px wide
- **THEN** maps show two per row and the page does not scroll sideways
