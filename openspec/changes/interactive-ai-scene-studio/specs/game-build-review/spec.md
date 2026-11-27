# Spec Delta

## ADDED Requirements

### Requirement: The website reviews a Studio working revision before publication

The signed-in owner SHALL review the pinned candidate and the effective dependency closure in the build page. Selecting an encounter SHALL bring in its map, placed creatures and their art. The review SHALL identify reused library values and other encounters on the same map, offer explicit restore for a historical revision, and require fresh review after a relevant change. The owner SHALL see the link-based original-art disclosure before public delivery is enabled.

#### Scenario: The working head or library data changes

- **WHEN** a newer correction lands or a reused creature or map changes after the review opens
- **THEN** the dialog retains its pinned preview, offers Review latest, and the original review cannot commit

#### Scenario: Publish and retry

- **WHEN** the owner publishes a reviewed selection and retries the same operation after losing the response
- **THEN** the server returns the original receipt and the library gains one set of items
