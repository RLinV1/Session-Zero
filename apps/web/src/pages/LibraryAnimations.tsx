import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Copy, PencilSimple, Sparkle, TextAa, Trash } from "@phosphor-icons/react";
import { MAX_ANIMATION_NAME, type AnimationDef, type LibraryAnimation } from "@vtt/shared";
import { BUILTIN_ANIMATIONS } from "../board/effectPresets";
import { api } from "../net/api";
import { IconAction } from "../ui/IconAction";
import { Modal } from "../ui/Modal";
import { Picker } from "../ui/Picker";
import { AnimationEditor } from "./animationEditor/AnimationEditor";
import { SHAPE_LABELS } from "./animationEditor/animationLabels";
import { AnimationThumbnail } from "../ui/AnimationThumbnail";
import { retainThumbnailRenderer } from "../board/animationThumbnail";
import { EmptyState } from "../ui/EmptyState";

/** Library animations whose name contains `query`, in the order given (case-insensitive). */
export function filterAnimations(animations: readonly LibraryAnimation[], query: string): LibraryAnimation[] {
  const q = query.trim().toLowerCase();
  return animations.filter((a) => !q || a.name.toLowerCase().includes(q));
}

/** A copy's name: "<name> copy", kept within the name limit. */
export function copyName(name: string): string {
  return `${name.slice(0, MAX_ANIMATION_NAME - " copy".length).trimEnd()} copy`;
}

/**
 * The library's Animations tab (ADR 0038): the GM's saved board animations with search, create,
 * rename, duplicate, delete and "Start from built-in", and an editor with a live preview.
 */
export function AnimationsTab({ query, onError }: { query: string; onError: (message: string | null) => void }) {
  const [animations, setAnimations] = useState<LibraryAnimation[] | null>(null);
  const [editing, setEditing] = useState<LibraryAnimation | "new" | null>(null);
  useEffect(retainThumbnailRenderer, []);

  useEffect(() => {
    let live = true;
    api.library.animations.list().then(
      (list) => live && setAnimations(list),
      (err: unknown) => live && onError(err instanceof Error ? err.message : "Could not load your animations"),
    );
    return () => {
      live = false;
    };
  }, [onError]);

  const shown = useMemo(() => filterAnimations(animations ?? [], query), [animations, query]);
  const upsert = (saved: LibraryAnimation) =>
    setAnimations((all) => (all?.some((a) => a.id === saved.id) ? all.map((a) => (a.id === saved.id ? saved : a)) : [saved, ...(all ?? [])]));

  const create = async (name: string, def: AnimationDef): Promise<LibraryAnimation | null> => {
    try {
      const saved = await api.library.animations.create({ name, def });
      upsert(saved);
      onError(null);
      return saved;
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not create the animation");
      return null;
    }
  };

  return (
    <>
      <div className="row">
        <button type="button" className="primary" onClick={() => setEditing("new")}>New animation</button>
        <div className="start-from-builtin">
          <Picker
            label="Start from built-in"
            icon={<Sparkle size={16} aria-hidden="true" />}
            placeholder="Start from built-in…"
            value={null}
            onChange={(key) => {
              const builtin = BUILTIN_ANIMATIONS.find((b) => b.id === key);
              if (builtin) void create(builtin.name, builtin.def).then((saved) => saved && setEditing(saved));
            }}
            options={BUILTIN_ANIMATIONS.map((b) => ({ key: b.id, label: b.name }))}
          />
        </div>
      </div>

      {!animations && <p className="muted" aria-busy="true">Loading…</p>}
      {animations && shown.length === 0 && (
        query ? (
          <p className="muted">None of your animations match that search.</p>
        ) : (
          // The toolbar's New animation is right above, so the empty state adds no second one.
          <EmptyState picture="empty-library">
            You haven't made any animations yet. Start from a built-in, then give an attack its own look from the attack editor.
          </EmptyState>
        )
      )}
      <ul className="plain asset-grid" role="tabpanel">
        {shown.map((animation) => (
          <AnimationCard
            key={animation.id}
            animation={animation}
            onEdit={() => setEditing(animation)}
            onRenamed={upsert}
            onDuplicate={() => void create(copyName(animation.name), animation.def)}
            onDeleted={() => setAnimations((all) => (all ?? []).filter((a) => a.id !== animation.id))}
            onError={onError}
          />
        ))}
      </ul>

      {editing !== null && (
        <AnimationEditor
          key={editing === "new" ? "new" : editing.id}
          animation={editing === "new" ? null : editing}
          onSaved={(saved) => {
            upsert(saved);
            setEditing(null);
          }}
          onCancel={() => setEditing(null)}
        />
      )}
    </>
  );
}

function AnimationCard(props: {
  animation: LibraryAnimation;
  onEdit: () => void;
  onRenamed: (animation: LibraryAnimation) => void;
  onDuplicate: () => void;
  onDeleted: () => void;
  onError: (message: string | null) => void;
}) {
  const { animation } = props;
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const rename = async (e: FormEvent) => {
    e.preventDefault();
    const name = (renaming ?? "").trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      props.onRenamed(await api.library.animations.update(animation.id, { name }));
      setRenaming(null);
      props.onError(null);
    } catch (err) {
      props.onError(err instanceof Error ? err.message : "Rename failed");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api.library.animations.remove(animation.id);
      props.onDeleted();
    } catch (err) {
      props.onError(err instanceof Error ? err.message : "Delete failed");
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <li className="asset-card animation-card">
      <AnimationThumbnail animation={animation} />
      <strong className="asset-name" title={animation.name}>{animation.name}</strong>
      <Modal open={renaming !== null} title="Rename animation" onClose={() => setRenaming(null)}>
        <form className="stack" onSubmit={rename} aria-label={`Rename ${animation.name}`}>
          <label>Name
            <input aria-label="Animation name" value={renaming ?? ""} maxLength={MAX_ANIMATION_NAME} autoFocus onChange={(e) => setRenaming(e.target.value)} />
          </label>
          <div className="row modal-actions">
            <button type="button" className="secondary" onClick={() => setRenaming(null)}>Cancel</button>
            <button type="submit" className="primary" disabled={busy || !(renaming ?? "").trim()}>Save</button>
          </div>
        </form>
      </Modal>
      <span className="muted asset-meta">{SHAPE_LABELS[animation.def.shape]} · {animation.def.duration}s</span>
      {confirming ? (
        <div className="confirm" role="alertdialog" aria-label={`Delete ${animation.name}?`}>
          <p>Delete “{animation.name}”? Attacks that already use it keep their copy.</p>
          <div className="row modal-actions">
            <button type="button" className="secondary small" disabled={busy} onClick={() => setConfirming(false)}>Cancel</button>
            <button type="button" className="small danger-fill" disabled={busy} onClick={() => void remove()}>{busy ? "Deleting…" : "Delete"}</button>
          </div>
        </div>
      ) : (
        <div className="row asset-actions">
          <IconAction icon={<PencilSimple size={16} aria-hidden="true" />} label="Edit" onClick={props.onEdit} />
          <IconAction icon={<TextAa size={16} aria-hidden="true" />} label="Rename" onClick={() => setRenaming(animation.name)} />
          <IconAction icon={<Copy size={16} aria-hidden="true" />} label="Duplicate" onClick={props.onDuplicate} />
          <IconAction icon={<Trash size={16} aria-hidden="true" />} label="Delete" danger onClick={() => setConfirming(true)} />
        </div>
      )}
    </li>
  );
}
