import { PaintBrush } from "@phosphor-icons/react";
import { useAccount } from "../account/accountStore";
import { signInFor } from "../account/safeNext";
import { loadCredentials } from "../net/identity";
import { setActiveDiceLook, useDiceLooks } from "../ui/diceSkinStore";
import { useShowOthersDice } from "../ui/tableLooks";
import { t } from "../i18n/locale";

/**
 * Which dice look your rolls are drawn in (dice-image-skins, shared-dice-looks). Looks are made in
 * the asset library's Dice tab, which opens in a new tab so the room stays open; a look saved
 * there shows up here at once.
 *
 * Signed in, with your seat kept on your account, everyone at the table sees your look; as a
 * guest, only you do, and the note says how to show it. Each viewer can turn other players'
 * looks off for themselves.
 */
export function DiceLookPicker({ roomId }: { roomId: string }) {
  const { looks, activeId, kept } = useDiceLooks();
  const account = useAccount();
  const [showOthers, setShowOthers] = useShowOthersDice();
  const value = looks.some((l) => l.id === activeId) ? activeId! : "";
  const onTable = kept === "account" && loadCredentials(roomId)?.viaAccount === true;
  return (
    <div className="dice-look">
      <label htmlFor="dice-look">{t("diceLook.title")}</label>
      <div className="dice-look-row">
        <select id="dice-look" value={value} onChange={(e) => setActiveDiceLook(e.target.value || null)}>
          <option value="">{t("diceLook.classic")}</option>
          {looks.map((look) => (
            <option key={look.id} value={look.id}>
              {look.name}
            </option>
          ))}
        </select>
        <a href="/library?tab=dice" target="_blank" rel="noopener" className="icon-button dice-look-edit"
          aria-label={looks.length > 0 ? t("diceLook.edit") : t("diceLook.make")} title={looks.length > 0 ? t("diceLook.edit") : t("diceLook.make")}>
          <PaintBrush size={18} aria-hidden="true" />
        </a>
      </div>
      <p className="muted small-print">
        {onTable ? (
          t("diceLook.everyone")
        ) : account.status === "signedIn" ? (
          t("diceLook.onlyYouUntil")
        ) : (
          <>
            {t("diceLook.onlyYou")} <a href={signInFor(`/r/${roomId}`)}>{t("title.signin")}</a> {t("diceLook.keepSeat")}
          </>
        )}
      </p>
      <label className="checkbox">
        <input type="checkbox" checked={showOthers} onChange={(e) => setShowOthers(e.target.checked)} />
        {t("diceLook.showOthers")}
      </label>
    </div>
  );
}
