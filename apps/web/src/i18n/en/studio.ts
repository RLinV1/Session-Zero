import type { CatalogSource } from "@vtt/shared";

/**
 * Connecting an AI app to builds (FR-GM-26, ADR 0073, design D7): the consent page an AI app sends
 * the owner to, and the connections listed on a build's page.
 */
export const studio = {
  "title.studioConnect": "Connect an AI app",

  "studio.connect.title": "Connect an AI app to your builds",
  "studio.connect.claims": ({ name }: { name: string }) => `An app that calls itself “${name}” is asking to work on your builds.`,
  "studio.connect.returnsTo": ({ host }: { host: string }) => `Your answer goes back to ${host}. Continue only if that is the AI app you are using.`,
  "studio.connect.host": ({ host }: { host: string }) => `App at ${host}`,
  "studio.connect.unverified": "Unverified app: this site cannot confirm who made it. The name is whatever the app chose to call itself and may be false. Continue only if you trust the address above.",
  "studio.connect.signedInAs": ({ name }: { name: string }) => `Signed in as ${name}.`,
  "studio.connect.chooseBuilds": "Builds it may work on",
  "studio.connect.unnamedApp": "Unnamed app",
  "studio.connect.claimsUnnamed": "An app that gave no name is asking to work on your builds.",
  "studio.connect.noBuilds": "You have no open builds. Start one in the library, then connect again from your AI app.",
  "studio.connect.can": "It can read these drafts and small copies of their pictures, add protected map and token images, and save creatures, maps, walls, terrain and encounters in them, within the choices you set on each build.",
  "studio.connect.cannot": "It can't publish, change your choices, reach your library or rooms, or see your other builds. You review and publish on this site.",
  "studio.connect.lasts": "The connection lasts up to 30 days. You can disconnect it on a build's page at any time.",
  "studio.connect.allow": "Allow",
  "studio.connect.deny": "Cancel",
  "studio.connect.chooseOne": "Choose at least one build.",
  "studio.connect.returning": "Returning to your AI app…",
  "studio.connect.invalidTitle": "This connection request can't be used",
  "studio.connect.failed": "Couldn't send your answer. Try again.",
  "studio.connect.goBack": ({ host }: { host: string }) => `Back to ${host}`,

  "studio.grants.title": "AI app connections",
  "studio.grants.intro": "These AI apps can work on this build until you disconnect them or the connection ends.",
  "studio.grants.app": ({ name, host }: { name: string; host: string }) => `${name}, returning to ${host}`,
  "studio.grants.covers": ({ names }: { names: string }) => `Builds: ${names}`,
  "studio.grants.dates": ({ since, until }: { since: string; until: string }) => `Connected ${since} · ends ${until}`,
  "studio.grants.lastUsed": ({ date }: { date: string }) => `Last used ${date}`,
  "studio.grants.notUsed": "Not used yet",
  "studio.grants.disconnect": "Disconnect",
  "studio.grants.disconnectNamed": ({ name }: { name: string }) => `Disconnect ${name}`,
  "studio.grants.disconnecting": "Disconnecting…",
  "studio.grants.disconnectAll": "Disconnecting ends this app's access to every build listed with it.",
  "studio.grants.failed": "Couldn't disconnect. Try again.",
  "studio.grants.loadFailed": "Couldn't load AI app connections.",
  "studio.grants.corrections": ({ name }: { name: string }) => `Allow ${name} to request corrections and restore private revisions`,
  "studio.grants.correctionsHint": "Applies to eligible scenes in this build.",
  "studio.grants.correctionsFailed": "Couldn't save correction permission. Try again.",
} as const satisfies CatalogSource;
