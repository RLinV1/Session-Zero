import { useId, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import { PencilSimple, Trash } from "@phosphor-icons/react";
import { BulkCreaturePatch, type LibraryCreature } from "@vtt/shared";
import { api } from "../net/api";
import { EmptyState } from "../ui/EmptyState";
import { Modal } from "../ui/Modal";
import type { Selection } from "../ui/selection";
import { t } from "../i18n/locale";
import { CreatureCard } from "./LibraryCreatures";
import { FolderedList } from "./LibraryFolderedList";
import type { FolderView } from "./LibraryFolders";
import { BulkDeleteDialog, nameList } from "./LibraryListTools";

/** A bulk action under way: what it acts on, and the selection to end once it is done. */
type Bulk = { kind: "edit" | "delete"; chosen: LibraryCreature[]; selection: Selection } | null;

const createdAt = (c: LibraryCreature) => c.createdAt;

/**
 * The Creatures tab's list (library-creatures, library-organize): folders, sorting and choosing
 * several, as every library tab has, plus Edit for values a group of creatures shares.
 */
export function CreaturesTab({ creatures, setCreatures, loading, query, view, onView, onEdit }: {
  creatures: LibraryCreature[] | null;
  setCreatures: Dispatch<SetStateAction<LibraryCreature[] | null>>;
  loading: boolean;
  query: string;
  view: FolderView;
  onView: (view: FolderView) => void;
  onEdit: (creature: LibraryCreature) => void;
}) {
  const [bulk, setBulk] = useState<Bulk>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading) return <p className="muted" aria-busy="true">{t("common.loading")}</p>;
  if (!creatures) return null;
  if (creatures.length === 0) {
    return query.trim() ? <p className="muted">{t("library.noCreatureMatch")}</p> : <EmptyState picture="empty-library">{t("library.noCreatures")}</EmptyState>;
  }

  const start = (kind: "edit" | "delete", chosen: LibraryCreature[], selection: Selection) => {
    setError(null);
    setBulk({ kind, chosen, selection });
  };
  const close = () => !busy && setBulk(null);

  async function save(change: BulkCreaturePatch) {
    if (!bulk) return;
    setBusy(true);
    setError(null);
    try {
      const updated = new Map((await api.library.creatures.updateMany({ ids: bulk.chosen.map((c) => c.id), patch: change })).map((c) => [c.id, c]));
      setCreatures((list) => (list ?? []).map((c) => updated.get(c.id) ?? c));
      setBulk(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("library.bulk.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!bulk) return;
    setBusy(true);
    setError(null);
    try {
      const ids = new Set(bulk.chosen.map((c) => c.id));
      await api.library.creatures.removeMany([...ids]);
      setCreatures((list) => (list ?? []).filter((c) => !ids.has(c.id)));
      bulk.selection.stop();
      setBulk(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.deleteFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <FolderedList
        kind="creature"
        sortKey="creature"
        items={creatures}
        query={query}
        date={createdAt}
        view={view}
        onView={onView}
        onMoved={(ids, folder) => setCreatures((list) => (list ?? []).map((c) => (ids.includes(c.id) ? { ...c, folder } : c)))}
        noMatch={t("library.noCreatureMatch")}
        renderCard={(creature, selection) => (
          <CreatureCard
            key={creature.id}
            creature={creature}
            selection={selection}
            onEdit={() => onEdit(creature)}
            onDeleted={() => setCreatures((list) => (list ?? []).filter((c) => c.id !== creature.id))}
          />
        )}
        actions={({ chosen, selection }) => (
          <>
            <button type="button" className="secondary" disabled={chosen.length === 0} onClick={() => start("edit", chosen, selection)}>
              <PencilSimple size={16} aria-hidden="true" />
              {t("library.bulk.edit")}
            </button>
            <button type="button" className="secondary danger" disabled={chosen.length === 0} onClick={() => start("delete", chosen, selection)}>
              <Trash size={16} aria-hidden="true" />
              {t("library.bulk.delete")}
            </button>
          </>
        )}
      />
      <BulkEditCreaturesDialog creatures={bulk?.kind === "edit" ? bulk.chosen : null} busy={busy} error={error} onSave={(change) => void save(change)} onClose={close} />
      <BulkDeleteDialog
        open={bulk?.kind === "delete"}
        title={t("library.bulk.deleteTitle.creature", { count: bulk?.chosen.length ?? 0 })}
        names={bulk?.chosen.map((c) => c.name) ?? []}
        busy={busy}
        error={error}
        onCancel={close}
        onConfirm={() => void remove()}
      >
        <p>{t("library.bulk.creaturesBody")}</p>
      </BulkDeleteDialog>
    </>
  );
}

/** The value the chosen creatures share, or "mixed" when they differ. */
function shared<T>(creatures: readonly LibraryCreature[], read: (c: LibraryCreature) => T): { value: T } | "mixed" {
  const first = creatures[0];
  if (!first) return "mixed";
  const value = read(first);
  return creatures.every((c) => read(c) === value) ? { value } : "mixed";
}

/**
 * Edit several creatures at once: size, Max HP and AC. A blank field keeps each creature's own
 * value; its placeholder shows the value they share, or "Mixed".
 */
export function BulkEditCreaturesDialog({ creatures, busy, error, onSave, onClose }: {
  /** The creatures to change; the dialog is open while there are some. */
  creatures: readonly LibraryCreature[] | null;
  busy: boolean;
  error: string | null;
  onSave: (patch: BulkCreaturePatch) => void;
  onClose: () => void;
}) {
  const firstRef = useRef<HTMLInputElement>(null);
  return (
    <Modal open={creatures !== null} title={t("library.bulk.editTitle", { count: creatures?.length ?? 0 })} onClose={() => !busy && onClose()} initialFocus={firstRef}>
      {creatures && <BulkEditForm firstRef={firstRef} creatures={creatures} busy={busy} error={error} onSave={onSave} onClose={onClose} />}
    </Modal>
  );
}

function BulkEditForm({ firstRef, creatures, busy, error, onSave, onClose }: {
  firstRef: RefObject<HTMLInputElement | null>;
  creatures: readonly LibraryCreature[];
  busy: boolean;
  error: string | null;
  onSave: (patch: BulkCreaturePatch) => void;
  onClose: () => void;
}) {
  const [size, setSize] = useState("");
  const [maxHp, setMaxHp] = useState("");
  const [ac, setAc] = useState("");
  const hintId = useId();
  const typed = (value: string) => (value.trim() === "" ? undefined : Number(value));
  const parsed = BulkCreaturePatch.safeParse(Object.fromEntries(
    Object.entries({ size: typed(size), maxHp: typed(maxHp), ac: typed(ac) }).filter(([, v]) => v !== undefined),
  ));
  const nothing = size.trim() === "" && maxHp.trim() === "" && ac.trim() === "";
  // Max HP can't drop below a creature's starting HP: name them, rather than let the server refuse.
  const tooLow = parsed.success && parsed.data.maxHp != null
    ? creatures.filter((c) => c.hp != null && c.hp > parsed.data.maxHp!).map((c) => c.name)
    : [];
  const problem = nothing ? null : !parsed.success ? t("creature.checkValues") : tooLow.length > 0 ? t("library.bulk.hpOver", { names: nameList(tooLow) }) : null;
  const ready = !busy && !nothing && parsed.success && tooLow.length === 0;

  const placeholder = (read: (c: LibraryCreature) => number | null) => {
    const common = shared(creatures, read);
    return common === "mixed" ? t("library.bulk.mixed") : common.value === null ? "" : String(common.value);
  };

  return (
    <form className="stack" onSubmit={(e) => { e.preventDefault(); if (ready && parsed.success) onSave(parsed.data); }}>
      <p id={hintId} className="muted">{t("library.bulk.editHint")}</p>
      <div className="token-setup-grid token-setup-grid-3" aria-describedby={hintId}>
        <label>{t("creature.size")}<input ref={firstRef} type="number" value={size} placeholder={placeholder((c) => c.size)} onChange={(e) => setSize(e.target.value)} min="0.25" max="10" step="any" /></label>
        <label>{t("creature.maxHp")}<input type="number" value={maxHp} placeholder={placeholder((c) => c.maxHp ?? null)} onChange={(e) => setMaxHp(e.target.value)} min="1" max="9999" step="1" /></label>
        <label>{t("creature.ac")}<input type="number" value={ac} placeholder={placeholder((c) => c.ac ?? null)} onChange={(e) => setAc(e.target.value)} min="0" max="99" step="1" /></label>
      </div>
      {(problem ?? error) && <p role="alert" className="error">{problem ?? error}</p>}
      <div className="row modal-actions">
        <button type="button" className="secondary" disabled={busy} onClick={onClose}>{t("common.cancel")}</button>
        <button type="submit" className="primary" disabled={!ready}>{busy ? t("common.saving") : t("library.bulk.apply", { count: creatures.length })}</button>
      </div>
    </form>
  );
}
