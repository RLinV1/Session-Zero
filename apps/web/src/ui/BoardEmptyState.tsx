import { EmptyState } from "./EmptyState";

/**
 * A room with no map yet (design-language: "Empty states show the next step"). Players see
 * the picture and a sentence; only the GM can set a map, so only the GM gets the action that
 * takes them to it. It sits over the empty board without taking the board's input around it.
 */
export function BoardEmptyState({ isGm, onChooseMap }: { isGm: boolean; onChooseMap?: () => void }) {
  return (
    <div className="board-empty">
      <EmptyState
        picture="empty-map"
        action={
          isGm && onChooseMap ? (
            <button type="button" className="primary" onClick={onChooseMap}>
              Choose a map
            </button>
          ) : undefined
        }
      >
        {isGm ? "There is no map on the table yet." : "The GM hasn't set a map yet."}
      </EmptyState>
    </div>
  );
}
