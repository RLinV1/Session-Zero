import { useEffect, useState } from "react";
import type { AssetKind, LibraryAsset, LibraryUsageResponse } from "@vtt/shared";
import { api } from "../net/api";
import { assetDisplayName } from "../net/builtinAssets";
import { t } from "../i18n/locale";
import { BulkDeleteDialog, nameList } from "./LibraryListTools";

type Named = { id: string; name: string };

/** At most `size` requests in flight, so a large selection doesn't open dozens of connections at once. */
async function inBatches<T, R>(items: readonly T[], size: number, run: (item: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = [];
  for (let i = 0; i < items.length; i += size) results.push(...(await Promise.allSettled(items.slice(i, i + size).map(run))));
  return results;
}

/** Everything that uses any of the assets, each room, creature and template named once. */
export function combineUsage(usages: readonly LibraryUsageResponse[]): LibraryUsageResponse {
  const unique = (lists: Named[][]) => [...new Map(lists.flat().map((x) => [x.id, x])).values()];
  return {
    rooms: unique(usages.map((u) => u.rooms)),
    creatures: unique(usages.map((u) => u.creatures)),
    encounters: unique(usages.map((u) => u.encounters)),
  };
}

/** What deleting several items left behind: the ids that went and the ones that did not. */
export interface BulkDeleteOutcome {
  deleted: string[];
  failed: string[];
}

function outcomeOf(ids: readonly string[], results: readonly PromiseSettledResult<unknown>[]): BulkDeleteOutcome {
  return {
    deleted: ids.filter((_, i) => results[i]?.status === "fulfilled"),
    failed: ids.filter((_, i) => results[i]?.status !== "fulfilled"),
  };
}

/**
 * Deletes several maps or token images after one confirmation (library-organize). Like deleting
 * one, it first asks the server who uses them now, so the warning is never stale (asset-library),
 * and names those rooms, creatures and templates together.
 */
export function AssetBulkDelete({ assets, kind, onClose, onDeleted }: {
  /** The assets to delete; the dialog is open while this is non-null. */
  assets: readonly LibraryAsset[] | null;
  kind: AssetKind;
  onClose: () => void;
  onDeleted: (outcome: BulkDeleteOutcome) => void;
}) {
  const [usage, setUsage] = useState<LibraryUsageResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = assets?.map((a) => a.id).join("\n") ?? "";

  useEffect(() => {
    setUsage(null);
    setError(null);
    if (!assets) return;
    let live = true;
    void inBatches(assets, 4, (a) => api.library.usage(a.id)).then((results) => {
      if (!live) return;
      const read = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
      if (read.length < results.length) setError(t("library.usageCheckFailed"));
      else setUsage(combineUsage(read));
    });
    return () => {
      live = false;
    };
    // Read again only when the set of assets changes (`ids`), not on every render of the same choice.
  }, [ids]);

  async function confirm() {
    if (!assets) return;
    setBusy(true);
    setError(null);
    const list = assets.map((a) => a.id);
    const outcome = outcomeOf(list, await inBatches(list, 4, (id) => api.library.remove(id)));
    setBusy(false);
    onDeleted(outcome);
  }

  const standIn = kind === "map" ? t("library.standIn.map") : t("library.standIn.token");
  const sep = t("library.listSeparator");
  return (
    <BulkDeleteDialog
      open={assets !== null}
      title={t(kind === "map" ? "library.bulk.deleteTitle.map" : "library.bulk.deleteTitle.token", { count: assets?.length ?? 0 })}
      names={(assets ?? []).map(assetDisplayName)}
      busy={busy || (usage === null && error === null)}
      error={error}
      onCancel={onClose}
      onConfirm={() => void confirm()}
    >
      {usage === null && error === null && <p className="muted" aria-busy="true">{t("common.checking")}</p>}
      {usage && usage.rooms.length > 0 && (
        <p>
          {t("library.usedInRooms", { count: usage.rooms.length })}{" "}
          <strong>{usage.rooms.map((r) => r.name || t("common.untitledRoom")).join(sep)}</strong>{t("library.roomsStandIn", { standIn })}
        </p>
      )}
      {usage && usage.creatures.length > 0 && (
        <p>
          {t("library.usedByCreatures", { count: usage.creatures.length })}{" "}
          <strong>{nameList(usage.creatures.map((c) => c.name))}</strong>{t("library.creaturesLoseImage", { count: usage.creatures.length })}
        </p>
      )}
      {usage && usage.encounters.length > 0 && (
        <p>
          {t("library.usedByEncounters", { count: usage.encounters.length })}{" "}
          <strong>{nameList(usage.encounters.map((e) => e.name))}</strong>{t("library.encountersUnusable", { count: usage.encounters.length })}
        </p>
      )}
      {usage && usage.rooms.length === 0 && usage.creatures.length === 0 && usage.encounters.length === 0 && <p>{t("library.bulk.assetsUnused")}</p>}
    </BulkDeleteDialog>
  );
}

/**
 * Deletes several items that nothing else depends on, encounter templates or animations, after one
 * confirmation naming them (library-organize).
 */
export function ItemsBulkDelete({ items, title, body, remove, onClose, onDeleted }: {
  /** The items to delete; the dialog is open while this is non-null. */
  items: readonly { id: string; name: string }[] | null;
  title: string;
  /** What deleting them leaves alone. */
  body: string;
  remove: (id: string) => Promise<unknown>;
  onClose: () => void;
  onDeleted: (outcome: BulkDeleteOutcome) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function confirm() {
    if (!items) return;
    setBusy(true);
    const list = items.map((item) => item.id);
    const outcome = outcomeOf(list, await inBatches(list, 4, remove));
    setBusy(false);
    onDeleted(outcome);
  }

  return (
    <BulkDeleteDialog
      open={items !== null}
      title={title}
      names={(items ?? []).map((item) => item.name)}
      busy={busy}
      error={null}
      onCancel={onClose}
      onConfirm={() => void confirm()}
    >
      <p>{body}</p>
    </BulkDeleteDialog>
  );
}
