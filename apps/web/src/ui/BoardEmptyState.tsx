import { EmptyState } from "./EmptyState";
import { t } from "../i18n/locale";

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
              {t("stage.chooseMap")}
            </button>
          ) : undefined
        }
      >
        {isGm ? t("empty.gmNoMap") : t("empty.playerNoMap")}
      </EmptyState>
    </div>
  );
}
