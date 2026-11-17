import { useEffect, useMemo, useState, type ReactNode } from "react";
import { FolderOpen, FolderSimple, TextAa, XCircle } from "@phosphor-icons/react";
import type { LibraryFolderKind } from "@vtt/shared";
import { api } from "../net/api";
import { useSelection, type CardSelection, type Selection } from "../ui/selection";
import { t } from "../i18n/locale";
import {
  ALL_FOLDERS,
  FolderBar,
  FolderNameDialog,
  MoveToFolderDialog,
  RemoveFolderDialog,
  groupByFolder,
  inFolderView,
  libraryFolders,
  liveFolderView,
  resolveFolderName,
  sharedFolder,
  type Foldered,
  type FolderView,
} from "./LibraryFolders";
import { ListBar, SelectionBar } from "./LibraryListTools";
import { sortItems, useSortPreference } from "./librarySort";

/** What a tab's own bulk actions act on: the chosen items, in the order shown, and the selection itself. */
export interface ChosenItems<T> {
  chosen: T[];
  selection: Selection;
}

type Dialog =
  | { kind: "none" }
  | { kind: "newFolder" }
  | { kind: "move" }
  | { kind: "renameFolder"; folder: string }
  | { kind: "removeFolder"; folder: string };

const NO_DIALOG: Dialog = { kind: "none" };

/**
 * One library tab's own items, organized (library-organize, ADR 0075): folder chips and New
 * folder, sorting, sections by folder under All, a folder's own view with Rename and Remove, and
 * choosing several cards to move to a folder or to act on with the tab's own `actions`.
 * Every tab with folders uses this, so they behave the same; each has its own folders.
 */
export function FolderedList<T extends Foldered>({ kind, sortKey, items, query, date, view, onView, onMoved, renderCard, actions, noMatch }: {
  kind: LibraryFolderKind;
  /** The tab's name for its remembered order: "map", "token", "creature", … */
  sortKey: string;
  /** All the GM's own items on this tab, before the search. */
  items: readonly T[];
  query: string;
  /** When an item counts as made, for Newest and Oldest first. */
  date: (item: T) => string;
  view: FolderView;
  onView: (view: FolderView) => void;
  /** The server has filed `ids` in `folder`; the tab updates its own copies. */
  onMoved: (ids: readonly string[], folder: string | null) => void;
  renderCard: (item: T, selection: CardSelection) => ReactNode;
  /** The tab's own actions on the chosen items, after Move to folder: Delete, Edit… */
  actions?: (chosen: ChosenItems<T>) => ReactNode;
  /** Said when the search or the folder shows nothing. */
  noMatch: string;
}) {
  const [sort, setSort] = useSortPreference(sortKey);
  const [dialog, setDialog] = useState<Dialog>(NO_DIALOG);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  /** New folder with nothing chosen yet: the folder the next choice is moved into. */
  const [pendingFolder, setPendingFolder] = useState<string | null>(null);

  const folders = useMemo(() => libraryFolders(items), [items]);
  const unfiled = items.filter((item) => (item.folder ?? null) === null).length;
  const shownView = liveFolderView(view, folders, unfiled);
  useEffect(() => {
    if (shownView !== view) onView(shownView);
  }, [shownView, view, onView]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matching = items.filter((item) => (!q || item.name.toLowerCase().includes(q)) && inFolderView(item, shownView));
    const sorted = sortItems(matching, sort, date);
    return shownView.kind === "all" && folders.length > 0 ? groupByFolder(sorted, folders) : [{ folder: null, items: sorted }];
  }, [items, query, shownView, sort, date, folders]);
  const shown = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const order = useMemo(() => shown.map((item) => item.id), [shown]);
  const selection = useSelection(order);
  const chosen = useMemo(() => shown.filter((item) => selection.selected.has(item.id)), [shown, selection.selected]);

  // Leaving selection drops a New folder that was never given anything: a folder exists while it holds something.
  useEffect(() => {
    if (!selection.active) setPendingFolder(null);
  }, [selection.active]);

  const open = (next: Dialog) => {
    setDialogError(null);
    setDialog(next);
  };
  const close = () => !busy && setDialog(NO_DIALOG);
  const idsIn = (folder: string) => items.filter((item) => item.folder === folder).map((item) => item.id);

  /** Files `ids` in `folder`, all or none, then closes the dialog. */
  async function move(ids: string[], folder: string | null): Promise<boolean> {
    setBusy(true);
    setDialogError(null);
    try {
      await api.library.moveToFolder({ kind, ids, folder });
      onMoved(ids, folder);
      setDialog(NO_DIALOG);
      return true;
    } catch (err) {
      setDialogError(err instanceof Error ? err.message : t("library.folder.moveFailed"));
      return false;
    } finally {
      setBusy(false);
    }
  }

  /** Moves the chosen items; a new folder is then opened, to show what went into it. */
  async function moveChosen(folder: string | null, openAfter = false) {
    if (!(await move(selection.ids, folder)) || !openAfter || folder === null) return;
    selection.stop();
    onView({ kind: "folder", name: folder });
  }

  function startNewFolder(name: string) {
    const folder = resolveFolderName(name, folders);
    if (selection.ids.length > 0) return void moveChosen(folder, true);
    // Nothing chosen yet: show everything and let the GM choose what to put in it.
    setDialog(NO_DIALOG);
    onView(ALL_FOLDERS);
    selection.start();
    setPendingFolder(folder);
  }

  const none = selection.ids.length === 0;
  const folderCount = shownView.kind === "folder" ? folders.find((f) => f.name === shownView.name)?.count ?? 0 : 0;

  return (
    <>
      <ListBar sort={sort} onSort={setSort} selection={selection}>
        <FolderBar total={items.length} folders={folders} unfiled={unfiled} view={shownView} onView={onView} onNew={() => open({ kind: "newFolder" })} />
      </ListBar>

      {shownView.kind === "folder" && (
        <div className="folder-heading-row">
          <h2 className="folder-heading">
            <FolderOpen size={20} aria-hidden="true" />
            <span>{shownView.name}</span>
            <span className="folder-count">{folderCount}</span>
          </h2>
          <button type="button" className="secondary small folder-action" onClick={() => open({ kind: "renameFolder", folder: shownView.name })}>
            <TextAa size={14} aria-hidden="true" />
            {t("library.folder.rename")}
          </button>
          <button type="button" className="secondary small folder-action" onClick={() => open({ kind: "removeFolder", folder: shownView.name })}>
            <XCircle size={14} aria-hidden="true" />
            {t("library.folder.remove")}
          </button>
        </div>
      )}

      {shown.length === 0 && <p className="muted">{noMatch}</p>}
      {groups.map((group) => (
        <section key={group.folder ?? ""} className="library-folder-group" aria-label={groups.length > 1 ? group.folder ?? t("library.folder.unfiled") : undefined}>
          {groups.length > 1 && (
            <h2 className="folder-heading">
              <button
                type="button"
                className="folder-open"
                aria-label={group.folder === null ? t("library.folder.unfiled") : t("library.folder.open", { folder: group.folder })}
                onClick={() => onView(group.folder === null ? { kind: "unfiled" } : { kind: "folder", name: group.folder })}
              >
                {group.folder !== null && <FolderSimple size={18} aria-hidden="true" />}
                <span>{group.folder ?? t("library.folder.unfiled")}</span>
              </button>
              <span className="folder-count">{group.items.length}</span>
            </h2>
          )}
          <ul className="plain asset-grid" role="tabpanel">
            {group.items.map((item) => renderCard(item, selection.card(item.id)))}
          </ul>
        </section>
      ))}

      <SelectionBar selection={selection} total={order.length} hint={pendingFolder !== null ? t("library.folder.chooseFor", { folder: pendingFolder }) : undefined}>
        {pendingFolder !== null ? (
          <button type="button" className="primary" disabled={none || busy} onClick={() => void moveChosen(pendingFolder, true)}>
            <FolderSimple size={16} aria-hidden="true" />
            {t("library.folder.moveTo", { folder: pendingFolder })}
          </button>
        ) : (
          <>
            <button type="button" className="secondary" disabled={none} onClick={() => open({ kind: "move" })}>
              <FolderSimple size={16} aria-hidden="true" />
              {t("library.folder.move")}
            </button>
            {actions?.({ chosen, selection })}
          </>
        )}
      </SelectionBar>
      {pendingFolder !== null && dialogError && <p role="alert" className="error">{dialogError}</p>}

      <FolderNameDialog
        open={dialog.kind === "newFolder"}
        title={t("library.folder.new")}
        hint={none ? t("library.folder.newHint") : undefined}
        submitLabel={none ? t("library.folder.next") : t("library.folder.move")}
        busy={busy}
        error={dialogError}
        onSubmit={startNewFolder}
        onClose={close}
      />
      <MoveToFolderDialog open={dialog.kind === "move"} count={chosen.length} folders={folders} current={sharedFolder(chosen)} busy={busy} error={dialogError} onMove={(folder) => void moveChosen(folder)} onClose={close} />
      <FolderNameDialog
        open={dialog.kind === "renameFolder"}
        title={t("library.folder.rename")}
        initial={dialog.kind === "renameFolder" ? dialog.folder : ""}
        submitLabel={t("common.save")}
        busy={busy}
        error={dialogError}
        onSubmit={(name) => {
          if (dialog.kind !== "renameFolder") return;
          const from = dialog.folder;
          // Renaming onto another folder's name merges the two.
          const to = resolveFolderName(name, folders.filter((f) => f.name !== from));
          if (to === from) return setDialog(NO_DIALOG);
          void move(idsIn(from), to).then((ok) => ok && onView({ kind: "folder", name: to }));
        }}
        onClose={close}
      />
      <RemoveFolderDialog
        folder={dialog.kind === "removeFolder" ? dialog.folder : null}
        count={dialog.kind === "removeFolder" ? idsIn(dialog.folder).length : 0}
        busy={busy}
        error={dialogError}
        onConfirm={() => {
          if (dialog.kind !== "removeFolder") return;
          void move(idsIn(dialog.folder), null).then((ok) => ok && onView(ALL_FOLDERS));
        }}
        onClose={close}
      />
    </>
  );
}
