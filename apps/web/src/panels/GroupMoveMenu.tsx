import type { DragEvent } from "react";
import { Check, DotsSixVertical } from "@phosphor-icons/react";
import type { Token, TokenGroup } from "@vtt/shared";
import { PopoverButton } from "../ui/Popover";

/**
 * The grip on a GM roster row (roster-group-move): click it for a Move to menu, or drag it onto a
 * group in the roster. Either way the token moves through `onMove`, one undoable action.
 */
export function GroupMoveMenu({ token, groups, groupId, onMove, onDragStart, onDragEnd }: {
  token: Token;
  /** In creation order, as the roster's headings are. */
  groups: readonly TokenGroup[];
  /** The token's group, or null when ungrouped. */
  groupId: string | null;
  onMove: (groupId: string | null) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const entries: { id: string | null; name: string }[] = [...groups.map((g) => ({ id: g.id, name: g.name })), { id: null, name: "Ungrouped" }];

  return (
    <PopoverButton
      label={`Move ${token.name} to group`}
      title={`Move ${token.name} to`}
      className="move-handle"
      placement="fixed"
      buttonContent={<DotsSixVertical size={14} aria-hidden="true" />}
      buttonProps={{
        draggable: true,
        "data-move-handle": token.id,
        onDragStart: (e: DragEvent<HTMLButtonElement>) => {
          e.dataTransfer.effectAllowed = "move";
          // Firefox starts a drag only when something is set.
          e.dataTransfer.setData("text/plain", token.name);
          onDragStart();
        },
        onDragEnd,
      }}
    >
      {(close) => (
        <div className="stack move-menu">
          <p className="muted small-print">Move {token.name} to</p>
          <ul className="plain">
            {entries.map((entry) => {
              const current = entry.id === groupId;
              return (
                <li key={entry.id ?? ""}>
                  <button
                    type="button"
                    className="move-menu-item"
                    disabled={current}
                    aria-current={current ? "true" : undefined}
                    onClick={() => {
                      close();
                      onMove(entry.id);
                    }}
                  >
                    <span className="move-menu-check" aria-hidden="true">{current && <Check size={14} />}</span>
                    {entry.name}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </PopoverButton>
  );
}
