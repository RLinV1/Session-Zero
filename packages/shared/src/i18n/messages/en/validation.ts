/**
 * Messages our own zod schemas attach to their checks (ADR 0054). The schemas read their English
 * from here through `validationMessage`, so the server and the web can map an issue back to its id.
 */
export const validationEn = {
  "valid.offsetsWithinCell": "Offsets must be within one cell",
  "valid.gridOffset": "Grid offset must be less than the cell size",
  "valid.unknownPreset": "Unknown game preset",
  "valid.nukeNotAttack": "A nuke cannot be used for an attack",
  "valid.nukeOnly": "Only a nuke animation can be used for a nuke",
  "valid.nothingToChange": "Nothing to change",
  "valid.nameBlank": "Name can't be blank",
  "valid.nameTooLong": ({ max }: { max: number }) => `Name must be ${max} characters or fewer`,
  "valid.supportedDie": "Choose a supported die",
  "valid.attackNeedsRoll": "An attack needs a to-hit or damage roll",
  "valid.attackNamesUnique": "Attack names must be unique",
  "valid.mapUploadSize": "Map uploads require image width and height",
  "valid.conditionTwice": "A condition is listed twice",
  "valid.emailTooLong": ({ max }: { max: number }) => `Email must be ${max} characters or fewer`,
  "valid.email": "Enter an email address like name@example.com",
  "valid.passwordTooShort": ({ min }: { min: number }) => `Password must be at least ${min} characters`,
  "valid.passwordTooLong": ({ max }: { max: number }) => `Password must be ${max} characters or fewer`,
  "valid.displayNameBlank": "Display name can't be blank",
  "valid.displayNameTooLong": ({ max }: { max: number }) => `Display name must be ${max} characters or fewer`,
  "valid.passwordIsEmail": "Password can't be your email address",
  "valid.hexColour": "Use a six-digit hex colour like #ff8800",
  "valid.diceLookPicture": ({ width, height, max }: { width: number; height: number; max: number }) =>
    `Use a painted template (${width} × ${height} or smaller, 3:2) or a square picture up to ${max} × ${max}`,
  "auth.signInFailed": "Email or password is incorrect.",
} as const;
