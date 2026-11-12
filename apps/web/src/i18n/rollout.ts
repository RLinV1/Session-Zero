/**
 * Whether people may choose a language (localization rollout, design.md "Migration Plan").
 *
 * On everywhere since every area of the app is translated (task 8.2): the header and Settings
 * offer the choice, and a saved choice or the browser's languages pick the starting language.
 * Kept as a named switch so a future language can ship dark the same way.
 */
export const LANGUAGE_CHOICE_ENABLED: boolean = true;
