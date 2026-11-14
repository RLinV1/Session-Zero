import type { RefObject } from "react";
import { ClockCounterClockwise, DotsThree, FloppyDisk, Rewind, GearSix, Play, ShareNetwork } from "@phosphor-icons/react";
import { GuideIcon } from "./GuideTour";
import { PopoverButton } from "./Popover";
import { t } from "../i18n/locale";

/**
 * The room bar's "More" menu: the activity log, replay and the guide, folded into one button so
 * the bar stays short. Each item closes the menu, then opens its own view. Settings has its own
 * button on desktop and folds in here only on phones (client-settings).
 */
export function RoomMenu({ onActivityLog, onReplay, replaying, onGuide, onShare, onSettings, onDemo, onSave, buttonRef }: {
  /** Phone only: Settings folds into this menu instead of the top bar's gear. */
  onSettings?: () => void;
  /** GM only; omitted for everyone else. */
  onActivityLog?: () => void;
  /** Omitted while previewing as a player. */
  onReplay?: () => void;
  replaying: boolean;
  onGuide: () => void;
  /** Phone only: Share folds into this menu instead of a button of its own. */
  onShare?: () => void;
  /** Guest GM only: starts the interactive demo again. */
  onDemo?: () => void;
  /** Guest GM only: to sign-up, keeping this room. Always offered, so "Not now" never hides saving. */
  onSave?: () => void;
  /** The menu button, so the guide and Settings can hand focus back to it. */
  buttonRef?: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <PopoverButton
      label={t("menu.more")}
      title={t("menu.more")}
      align="right"
      tourId="guide"
      buttonRef={buttonRef}
      buttonContent={<><DotsThree size={16} aria-hidden="true" /> <span className="menu-label">{t("menu.more")}</span></>}
    >
      {(close) => {
        const item = (action: () => void) => () => { close(); action(); };
        return (
          <div className="room-menu">
            {onShare && (
              <button type="button" className="tool-button" onClick={item(onShare)}>
                <ShareNetwork size={16} aria-hidden="true" /> {t("share.share")}
              </button>
            )}
            {onSettings && (
              <button type="button" className="tool-button" onClick={item(onSettings)}>
                <GearSix size={16} aria-hidden="true" /> {t("settings.title")}
              </button>
            )}
            {onActivityLog && (
              <button type="button" className="tool-button" onClick={item(onActivityLog)}>
                <ClockCounterClockwise size={16} aria-hidden="true" />
                {t("home.recover.log")}
              </button>
            )}
            {onReplay && (
              <button type="button" className="tool-button" aria-pressed={replaying} onClick={item(onReplay)}>
                <Rewind size={16} aria-hidden="true" />
                {replaying ? t("menu.exitReplay") : t("menu.replay")}
              </button>
            )}
            {onDemo && (
              <button type="button" className="tool-button" onClick={item(onDemo)}>
                <Play size={16} aria-hidden="true" /> {t("menu.demo")}
              </button>
            )}
            {onSave && (
              <button type="button" className="tool-button" onClick={item(onSave)}>
                <FloppyDisk size={16} aria-hidden="true" /> {t("guest.save")}
              </button>
            )}
            <button type="button" className="tool-button" onClick={item(onGuide)}>
              <GuideIcon />
              {t("common.guide")}
            </button>
          </div>
        );
      }}
    </PopoverButton>
  );
}
