import type { DomainEvent } from "./events";
import type { TableState } from "./state";
import type { SavedScene } from "./scenes";

/**
 * Built-in art is served by the web origin under `/img/` (shipped maps, built-in tokens and
 * creatures). True only for an origin-relative path there, with nothing that could climb out of it:
 * no `..`, `//`, `\`, `?`, `#`, or `%` (a browser reads `%2e%2e` as `..`). A path under `/img/` that
 * names no file just fails to load. Guest rooms may show nothing else (guest-gm-hosting D5).
 */
export function isBuiltinImageUrl(url: string): boolean {
  return url.startsWith("/img/") && !/\.\.|\/\/|[?#%\\]/.test(url);
}

const tableUrls = (table: TableState): string[] => [
  ...(table.scene.map ? [table.scene.map.url] : []),
  ...Object.values(table.tokens).flatMap((t) => (t.imageUrl ? [t.imageUrl] : [])),
];
const sceneUrls = (saved: SavedScene) => tableUrls(saved.table);

/**
 * The map and token image URLs this event would put on the board. Pure. The `never` default makes a
 * new `DomainEvent` type a compile error until it is classified here, so an event that carries art
 * cannot slip past the guest-room check.
 */
export function boardImageUrls(event: DomainEvent): string[] {
  switch (event.type) {
    case "MapSet":
      return event.map ? [event.map.url] : [];
    case "TokenCreated":
      return event.token.imageUrl ? [event.token.imageUrl] : [];
    case "TokenImageSet":
      return event.imageUrl ? [event.imageUrl] : [];
    case "SceneDraftCreated":
      return sceneUrls(event.saved);
    case "ScenePrepared":
      return sceneUrls(event.prepared);
    case "SceneCreated":
    case "SceneSwitched":
      return sceneUrls(event.restored);
    case "CheckpointRestored":
      return tableUrls(event.restored);
    case "EncounterApplied":
      return tableUrls(event.applied);
    case "SceneRenamed": case "SceneDeleted": case "RoomCreated": case "ParticipantJoined":
    case "ParticipantRenamed": case "ParticipantDiceLookSet": case "ParticipantLeft": case "ParticipantRevoked":
    case "GridSet": case "LineOfSightSet": case "IsometricSet": case "SightRangeSet": case "TerrainPainted":
    case "TerrainEffectCreated": case "TerrainEffectRemoved": case "TerrainEffectRenamed": case "TokenMoved":
    case "TokenAppearanceSet": case "TokenDeleted": case "TokenOwnersSet": case "TokenHiddenSet":
    case "TokenStatsSet": case "TokenConditionsSet": case "TokenAttacksSet": case "InitiativeStarted":
    case "InitiativeStartUndone": case "GroupCreated": case "GroupRenamed": case "GroupDeleted":
    case "TokensGrouped": case "InitiativeAdvanced": case "InitiativeRewound": case "InitiativeEnded":
    case "InitiativeJoined": case "InitiativeLeft": case "DiceRolled": case "GroupRolled":
    case "AreaEffectStarted": case "AreaEffectCalled": case "AreaEffectDamageRolled": case "AreaEffectResolved":
    case "AreaEffectClosed": case "RollRuled": case "RollDamageApplied": case "RollsDismissed":
    case "RollsRestored": case "MapNuked": case "ReducedEffectsSet": case "AutoRemoveDefeatedSet":
    case "DefeatRemovalSet": case "HideMapWithoutTokenSet": case "HideHpSet": case "HideAcSet":
    case "DiagonalRuleSet": case "DifficultTerrainSet": case "JoinsLockSet": case "MapNukeUndone":
    case "RollDamageUnapplied": case "ChatMessageSent": case "TemplatePlaced": case "TemplateChanged":
    case "TemplateRemoved": case "DrawingAdded": case "DrawingRemoved": case "FogAdded": case "FogRemoved":
    case "WallsAdded": case "WallsRemoved": case "WallUpdated": case "PortalChanged": case "CheckpointCreated":
    case "CheckpointDeleted": case "ActionUndone": case "MapLinked": case "StagedTokensPlaced": case "StagedTokensRestaged":
      return [];
    default: {
      const unclassified: never = event;
      throw new Error(`boardImageUrls: unclassified event ${(unclassified as { type: string }).type}`);
    }
  }
}
