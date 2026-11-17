import { Fragment, useId, useRef, useState, type FormEvent, type RefObject } from "react";
import { FolderSimple, FolderSimplePlus } from "@phosphor-icons/react";
import { MAX_LIBRARY_FOLDER } from "@vtt/shared";
import { Modal } from "../ui/Modal";
import { formattingLocale, t } from "../i18n/locale";

/**
 * Library folders (library-organize, ADR 0075). A folder is a name on its items, so it exists
 * while it holds one. Every library list with folders (maps, token art, creatures, templates,
 * animations) shares these rules and dialogs; each tab's folders are its own.
 */

/** Anything a library tab lists in folders. */
export interface Foldered {
  id: string;
  name: string;
  folder?: string | null;
}

/** Which items a tab shows: all of them, one folder's, or those in none. */
export type FolderView = { kind: "all" } | { kind: "unfiled" } | { kind: "folder"; name: string };
export const ALL_FOLDERS: FolderView = { kind: "all" };

export interface FolderCount {
  name: string;
  count: number;
}

const folderOf = (item: Foldered): string | null => item.folder ?? null;

/** The folders among `items`, by name in the page's language, with how many items each holds. */
export function libraryFolders(items: readonly Foldered[], locale = formattingLocale()): FolderCount[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const folder = folderOf(item);
    if (folder !== null) counts.set(folder, (counts.get(folder) ?? 0) + 1);
  }
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: "base" });
  return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => collator.compare(a.name, b.name) || (a.name < b.name ? -1 : 1));
}

export function inFolderView(item: Foldered, view: FolderView): boolean {
  const folder = folderOf(item);
  return view.kind === "all" || (view.kind === "unfiled" ? folder === null : folder === view.name);
}

/** A view whose folder has gone (renamed, emptied, deleted) falls back to All. */
export function liveFolderView(view: FolderView, folders: readonly FolderCount[], unfiled: number): FolderView {
  if (view.kind === "folder" && !folders.some((f) => f.name === view.name)) return ALL_FOLDERS;
  if (view.kind === "unfiled" && unfiled === 0) return ALL_FOLDERS;
  return view;
}

/** The folder a view stands for, for filing something new into it: null under All or No folder. */
export const viewFolder = (view: FolderView | undefined): string | null => (view?.kind === "folder" ? view.name : null);

/**
 * The folder a typed name means: an existing folder whose name matches it apart from case, so
 * "cairnkeepers" joins "Cairnkeepers" instead of making a second one, or the name as typed.
 */
export function resolveFolderName(typed: string, folders: readonly (FolderCount | string)[]): string {
  const name = typed.trim();
  const names = folders.map((f) => (typeof f === "string" ? f : f.name));
  return names.find((f) => f.localeCompare(name, undefined, { sensitivity: "accent" }) === 0) ?? name;
}

/** Items in sections by folder, in `folders` order, with those in no folder last. Order inside each is kept. */
export function groupByFolder<T extends Foldered>(items: readonly T[], folders: readonly FolderCount[]): { folder: string | null; items: T[] }[] {
  const groups = new Map<string | null, T[]>([...folders.map((f) => [f.name, []] as [string, T[]]), [null, []]]);
  for (const item of items) groups.get(folderOf(item))?.push(item);
  return [...groups].filter(([, list]) => list.length > 0).map(([folder, list]) => ({ folder, items: list }));
}

/** The folder all of `items` are in, null for none, or undefined when they are spread out. */
export function sharedFolder(items: readonly Foldered[]): string | null | undefined {
  const folders = new Set(items.map(folderOf));
  return folders.size === 1 ? [...folders][0] : undefined;
}

/** The folder chips above a list: All, each folder, No folder, and New folder. */
export function FolderBar({ total, folders, unfiled, view, onView, onNew }: {
  total: number;
  folders: readonly FolderCount[];
  unfiled: number;
  view: FolderView;
  onView: (view: FolderView) => void;
  onNew: () => void;
}) {
  const chip = (pressed: boolean, label: string, count: number, onClick: () => void, accessible?: string, folder = false) => (
    <button type="button" className="folder-chip" aria-pressed={pressed} aria-label={accessible} onClick={onClick}>
      {folder && <FolderSimple size={14} aria-hidden="true" />}
      <span className="folder-chip-name">{label}</span>
      <span className="folder-count" aria-hidden={accessible ? true : undefined}>{count}</span>
    </button>
  );
  return (
    <div className="folder-bar" role="group" aria-label={t("library.folder.bar")}>
      {chip(view.kind === "all", t("library.folder.all"), total, () => onView(ALL_FOLDERS))}
      {folders.map((f) => (
        <Fragment key={f.name}>
          {chip(view.kind === "folder" && view.name === f.name, f.name, f.count, () => onView({ kind: "folder", name: f.name }), t("library.folder.named", { folder: f.name, count: f.count }), true)}
        </Fragment>
      ))}
      {folders.length > 0 && unfiled > 0 && chip(view.kind === "unfiled", t("library.folder.unfiled"), unfiled, () => onView({ kind: "unfiled" }))}
      <button type="button" className="folder-chip folder-new" onClick={onNew}>
        <FolderSimplePlus size={14} aria-hidden="true" />
        {t("library.folder.new")}
      </button>
    </div>
  );
}

/** A folder name field's problem, or null when it can be saved. */
export function folderNameProblem(name: string): string | null {
  if (name.trim() === "") return null;
  return name.trim().length > MAX_LIBRARY_FOLDER ? t("library.folder.tooLong", { max: MAX_LIBRARY_FOLDER }) : null;
}

/** Names a folder: New folder and Rename folder. */
export function FolderNameDialog({ open, title, initial = "", hint, submitLabel, busy = false, error = null, onSubmit, onClose }: {
  open: boolean;
  title: string;
  initial?: string;
  hint?: string;
  submitLabel: string;
  busy?: boolean;
  error?: string | null;
  onSubmit: (name: string) => void;
  onClose: () => void;
}) {
  // The native dialog focuses its first control when it opens, so the field is named here.
  const fieldRef = useRef<HTMLInputElement>(null);
  return (
    <Modal open={open} title={title} onClose={() => !busy && onClose()} initialFocus={fieldRef}>
      {open && <FolderNameForm fieldRef={fieldRef} initial={initial} hint={hint} submitLabel={submitLabel} busy={busy} error={error} onSubmit={onSubmit} onClose={onClose} />}
    </Modal>
  );
}

function FolderNameForm({ fieldRef, initial, hint, submitLabel, busy, error, onSubmit, onClose }: {
  fieldRef: RefObject<HTMLInputElement | null>;
  initial: string;
  hint?: string;
  submitLabel: string;
  busy: boolean;
  error: string | null;
  onSubmit: (name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial);
  const hintId = useId();
  const problem = folderNameProblem(name);
  const ready = name.trim() !== "" && !problem && !busy;
  return (
    <form className="stack" onSubmit={(e) => { e.preventDefault(); if (ready) onSubmit(name.trim()); }}>
      <div className="stack">
        <label>
          {t("library.folder.name")}
          <input ref={fieldRef} value={name} onFocus={(e) => e.currentTarget.select()} onChange={(e) => setName(e.target.value)} maxLength={MAX_LIBRARY_FOLDER + 20} required aria-describedby={hint ? hintId : undefined} />
        </label>
        {/* Outside the label, so the field is named "Folder name" and the hint is its description. */}
        {hint && <span id={hintId} className="muted">{hint}</span>}
      </div>
      {(problem ?? error) && <p role="alert" className="error">{problem ?? error}</p>}
      <div className="row modal-actions">
        <button type="button" className="secondary" disabled={busy} onClick={onClose}>{t("common.cancel")}</button>
        <button type="submit" className="primary" disabled={!ready}>{busy ? t("common.saving") : submitLabel}</button>
      </div>
    </form>
  );
}

/** "Move to folder" for the chosen items: an existing folder, a new one, or none. */
export function MoveToFolderDialog({ open, count, folders, current, busy, error, onMove, onClose }: {
  open: boolean;
  count: number;
  folders: readonly FolderCount[];
  /** The folder every chosen item is in now, if they share one; it isn't offered as the default. */
  current?: string | null;
  busy: boolean;
  error: string | null;
  onMove: (folder: string | null) => void;
  onClose: () => void;
}) {
  const choiceRef = useRef<HTMLInputElement>(null);
  return (
    <Modal open={open} title={t("library.folder.moveTitle", { count })} onClose={() => !busy && onClose()} initialFocus={choiceRef}>
      {open && <MoveToFolderForm choiceRef={choiceRef} folders={folders} current={current} busy={busy} error={error} onMove={onMove} onClose={onClose} />}
    </Modal>
  );
}

const NEW_FOLDER = "\u0000new";
const NO_FOLDER = "\u0000none";

function MoveToFolderForm({ choiceRef, folders, current, busy, error, onMove, onClose }: {
  choiceRef: RefObject<HTMLInputElement | null>;
  folders: readonly FolderCount[];
  current?: string | null;
  busy: boolean;
  error: string | null;
  onMove: (folder: string | null) => void;
  onClose: () => void;
}) {
  // Start on somewhere they aren't already: the first other folder, else a new one.
  const [choice, setChoice] = useState<string>(() => folders.find((f) => f.name !== current)?.name ?? NEW_FOLDER);
  const [typed, setTyped] = useState("");
  const groupName = useId();
  const problem = choice === NEW_FOLDER ? folderNameProblem(typed) : null;
  const ready = !busy && !problem && (choice !== NEW_FOLDER || typed.trim() !== "");

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!ready) return;
    onMove(choice === NO_FOLDER ? null : choice === NEW_FOLDER ? resolveFolderName(typed, folders) : choice);
  }

  const option = (value: string, label: string) => (
    <label key={value} className="folder-option">
      <input ref={choice === value ? choiceRef : undefined} type="radio" name={groupName} value={value} checked={choice === value} onChange={() => setChoice(value)} />
      {value !== NO_FOLDER && <FolderSimple size={16} aria-hidden="true" />}
      <span>{label}</span>
    </label>
  );

  return (
    <form className="stack" onSubmit={submit}>
      <fieldset className="folder-options">
        <legend className="sr-only">{t("library.folder.move")}</legend>
        {folders.map((f) => option(f.name, f.name))}
        <label className="folder-option">
          <input ref={choice === NEW_FOLDER ? choiceRef : undefined} type="radio" name={groupName} value={NEW_FOLDER} checked={choice === NEW_FOLDER} onChange={() => setChoice(NEW_FOLDER)} />
          <FolderSimplePlus size={16} aria-hidden="true" />
          <span>{t("library.folder.newOption")}</span>
        </label>
        {choice === NEW_FOLDER && (
          <input className="folder-new-name" aria-label={t("library.folder.name")} placeholder={t("library.folder.name")} value={typed} maxLength={MAX_LIBRARY_FOLDER + 20} onChange={(e) => setTyped(e.target.value)} />
        )}
        {option(NO_FOLDER, t("library.folder.unfiled"))}
      </fieldset>
      {(problem ?? error) && <p role="alert" className="error">{problem ?? error}</p>}
      <div className="row modal-actions">
        <button type="button" className="secondary" disabled={busy} onClick={onClose}>{t("common.cancel")}</button>
        <button type="submit" className="primary" disabled={!ready}>{busy ? t("common.saving") : t("library.folder.move")}</button>
      </div>
    </form>
  );
}

/** Confirms removing a folder: what is in it stays, with no folder. */
export function RemoveFolderDialog({ folder, count, busy, error, onConfirm, onClose }: {
  folder: string | null;
  count: number;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  return (
    <Modal open={folder !== null} title={t("library.folder.remove")} onClose={() => !busy && onClose()} initialFocus={cancelRef}>
      <div className="stack">
        <p>{t("library.folder.removeBody", { folder: folder ?? "", count })}</p>
        {error && <p role="alert" className="error">{error}</p>}
        <div className="row modal-actions">
          <button ref={cancelRef} type="button" className="secondary" disabled={busy} onClick={onClose}>{t("common.cancel")}</button>
          <button type="button" className="primary" disabled={busy} onClick={onConfirm}>{busy ? t("common.saving") : t("library.folder.remove")}</button>
        </div>
      </div>
    </Modal>
  );
}
