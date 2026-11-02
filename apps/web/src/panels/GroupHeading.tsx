import { useState } from "react";
import { Eye, EyeSlash, FolderSimplePlus, PencilSimple, Plus, Trash } from "@phosphor-icons/react";
import { MAX_GROUP_NAME, type Token, type TokenGroup } from "@vtt/shared";
import type { RoomConnection } from "../net/roomConnection";
import { Modal } from "../ui/Modal";

/**
 * A group's heading in the GM's roster (KAN-82): its name and size, and Add tokens, Rename, Delete and one
 * Hide all / Show all button. Hide and Show send one visibility change per token (FR-GM-16), only for the tokens
 * that need it. Deleting a group never deletes its tokens.
 */
export function GroupHeading({ group, tokens, others, connection, onError, collapsed, onToggle }: {
  group: TokenGroup;
  tokens: readonly Token[];
  /** Every token of the room not in this group, to offer for adding in bulk. */
  others: readonly Token[];
  connection: RoomConnection;
  onError: (message: string | null) => void;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(group.name);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());

  const send = async (command: Parameters<RoomConnection["command"]>[0]) => {
    const r = await connection.command(command);
    onError(r.ok ? null : r.message);
    return r.ok;
  };
  const setHidden = async (hidden: boolean) => {
    setBusy(true);
    try {
      for (const token of tokens) {
        if (token.hidden === hidden) continue;
        if (!(await send({ type: "token.setHidden", tokenId: token.id, hidden }))) break;
      }
    } finally {
      setBusy(false);
    }
  };

  const anyVisible = tokens.some((t) => !t.hidden);

  return (
    <div className="group-heading">
      <CollapseToggle label={group.name} count={tokens.length} collapsed={collapsed} onToggle={onToggle} />
      <span className="group-actions">
        <button type="button" className="icon-button" disabled={busy || others.length === 0} title="Add tokens"
          onClick={() => { setPicked(new Set()); setAdding(true); }} aria-label={`Add tokens to ${group.name}`}>
          <Plus size={16} aria-hidden="true" />
        </button>
        <button type="button" className="icon-button" disabled={busy || tokens.length === 0} title={anyVisible ? "Hide all" : "Show all"}
          onClick={() => void setHidden(anyVisible)} aria-label={`${anyVisible ? "Hide" : "Show"} all of ${group.name}`}>
          {anyVisible ? <Eye size={16} aria-hidden="true" /> : <EyeSlash size={16} aria-hidden="true" />}
        </button>
        <button type="button" className="icon-button" title="Rename" onClick={() => { setName(group.name); setRenaming(true); }}
          aria-label={`Rename ${group.name}`}>
          <PencilSimple size={16} aria-hidden="true" />
        </button>
        <button type="button" className="icon-button token-delete" title="Delete group" onClick={() => setConfirmingDelete(true)}
          aria-label={`Delete group ${group.name}`}>
          <Trash size={16} aria-hidden="true" />
        </button>
      </span>

      <Modal open={adding} title={`Add tokens to ${group.name}`} onClose={() => setAdding(false)}>
        <form className="stack" onSubmit={async (e) => {
          e.preventDefault();
          if (await send({ type: "group.assign", groupId: group.id, tokenIds: [...picked] })) setAdding(false);
        }}>
          <button type="button" className="link small" onClick={() => setPicked(new Set(picked.size === others.length ? [] : others.map((t) => t.id)))}>
            {picked.size === others.length ? "Clear selection" : "Select all"}
          </button>
          <ul className="plain stack">
            {others.map((t) => (
              <li key={t.id}>
                <label className="checkbox">
                  <input type="checkbox" checked={picked.has(t.id)}
                    onChange={(e) => setPicked((prev) => { const next = new Set(prev); if (e.target.checked) next.add(t.id); else next.delete(t.id); return next; })} />
                  {t.name}
                </label>
              </li>
            ))}
          </ul>
          <div className="row modal-actions">
            <button type="button" className="secondary" onClick={() => setAdding(false)}>Cancel</button>
            <button className="primary" type="submit" disabled={picked.size === 0}>Add {picked.size || ""} {picked.size === 1 ? "token" : "tokens"}</button>
          </div>
        </form>
      </Modal>
      <Modal open={renaming} title={`Rename ${group.name}`} onClose={() => setRenaming(false)}>
        <form className="stack" onSubmit={async (e) => {
          e.preventDefault();
          if (await send({ type: "group.rename", groupId: group.id, name })) setRenaming(false);
        }}>
          <label>Group name<input value={name} onChange={(e) => setName(e.target.value)} required maxLength={MAX_GROUP_NAME} autoFocus /></label>
          <div className="row modal-actions">
            <button type="button" className="secondary" onClick={() => setRenaming(false)}>Cancel</button>
            <button type="submit" className="primary">Rename</button>
          </div>
        </form>
      </Modal>
      <Modal open={confirmingDelete} title={`Delete ${group.name}?`} onClose={() => setConfirmingDelete(false)}>
        <div className="stack">
          <p>The group goes; its {tokens.length} {tokens.length === 1 ? "token stays" : "tokens stay"} on the board, ungrouped.</p>
          <div className="row modal-actions">
            <button type="button" className="secondary" onClick={() => setConfirmingDelete(false)} autoFocus>Keep</button>
            <button type="button" className="danger-fill" onClick={async () => {
              if (await send({ type: "group.delete", groupId: group.id })) setConfirmingDelete(false);
            }}>Delete group</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/** "Create group" at the right of the roster's heading (KAN-82): a button that asks for the name. */
export function NewGroupButton({ connection, onError }: { connection: RoomConnection; onError: (message: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  return (
    <>
      <button type="button" className="icon-button new-group-button" title="Create group" aria-label="Create group" onClick={() => { setName(""); setOpen(true); }}>
        <FolderSimplePlus size={18} aria-hidden="true" />
      </button>
      <Modal open={open} title="Create group" onClose={() => setOpen(false)}>
        <form className="stack" onSubmit={async (e) => {
          e.preventDefault();
          const r = await connection.command({ type: "group.create", name });
          onError(r.ok ? null : r.message);
          if (r.ok) setOpen(false);
        }}>
          <label>Group name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Gate guards"
              maxLength={MAX_GROUP_NAME} required autoComplete="off" autoFocus />
          </label>
          <div className="row modal-actions">
            <button type="button" className="secondary" onClick={() => setOpen(false)}>Cancel</button>
            <button type="submit" className="primary">Create group</button>
          </div>
        </form>
      </Modal>
    </>
  );
}

/** The group's name and size; toggles whether its tokens are listed. */
export function CollapseToggle({ label, count, collapsed, onToggle }: { label: string; count: number; collapsed: boolean; onToggle: () => void }) {
  return (
    <button type="button" className="group-toggle" aria-expanded={!collapsed} onClick={onToggle}>
      <span aria-hidden="true" className="group-caret">{collapsed ? "▸" : "▾"}</span>
      <span className="group-name">{label}</span>
      <span className="muted">{count} {count === 1 ? "token" : "tokens"}</span>
    </button>
  );
}
