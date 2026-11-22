## Purpose

Tells people what changed in Session Zero, in their language, on a page they can link to.

## ADDED Requirements

### Requirement: What's new page
The web app SHALL serve a What's new page at `/news`, linked from the site footer, listing posts newest first with an index of all posts. Each post SHALL have a date, a kind, a title, one image or video with alternative text and a caption, and a body, in English and Traditional Chinese.

#### Scenario: Reading in Traditional Chinese
- **WHEN** the language is zh-TW
- **THEN** every post's title, body, alternative text and caption are in Traditional Chinese

#### Scenario: Linking to one post
- **WHEN** someone opens `/news#<post id>`
- **THEN** the page scrolls to that post

### Requirement: Posts are accurate and illustrated with the real app
Each post's image SHALL be a screenshot of the feature it describes, taken in the app. Each post SHALL be written as a dated press release whose claims match the shipped behaviour.

#### Scenario: Post shapes match across languages
- **WHEN** the posts are checked
- **THEN** each post's English and Chinese bodies have the same sequence of paragraphs, headings and lists, and every image file exists
