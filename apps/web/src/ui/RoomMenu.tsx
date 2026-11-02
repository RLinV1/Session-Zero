import { useRef, useState, type RefObject } from "react";
import { ClockCounterClockwise, DotsThree, Rewind, GearSix } from "@phosphor-icons/react";
import { SettingsMenu } from "./SettingsMenu";
import { GuideIcon } from "./GuideTour";
import { PopoverButton } from "./Popover";

/**
 * The room bar's "More" menu: the activity log, replay and the guide, folded into one button so
 * the bar stays short. Each item closes the menu, then opens its own view.
 */
export function RoomMenu({ onActivityLog, onReplay, replaying, onGuide, buttonRef }: {
  /** GM only; omitted for everyone else. */
  onActivityLog?: () => void;
  /** Omitted while previewing as a player. */
  onReplay?: () => void;
  replaying: boolean;
  onGuide: () => void;
  /** The menu button, so the guide can hand focus back to it. */
  buttonRef?: RefObject<HTMLButtonElement | null>;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const ownButtonRef = useRef<HTMLButtonElement>(null);
  const menuButtonRef = buttonRef ?? ownButtonRef;
  return (
    <>
    <PopoverButton
      label="More"
      title="More"
      align="right"
      tourId="guide"
      buttonRef={menuButtonRef}
      buttonContent={<><DotsThree size={16} aria-hidden="true" /> More</>}
    >
      {(close) => {
        const item = (action: () => void) => () => { close(); action(); };
        return (
          <div className="room-menu">
            <button type="button" className="tool-button" onClick={item(() => setSettingsOpen(true))}>
              <GearSix size={16} aria-hidden="true" /> Settings
            </button>
            {onActivityLog && (
              <button type="button" className="tool-button" onClick={item(onActivityLog)}>
                <ClockCounterClockwise size={16} aria-hidden="true" />
                Activity log
              </button>
            )}
            {onReplay && (
              <button type="button" className="tool-button" aria-pressed={replaying} onClick={item(onReplay)}>
                <Rewind size={16} aria-hidden="true" />
                {replaying ? "Exit replay" : "Replay"}
              </button>
            )}
            <button type="button" className="tool-button" onClick={item(onGuide)}>
              <GuideIcon />
              Guide
            </button>
          </div>
        );
      }}
    </PopoverButton>
    <SettingsMenu open={settingsOpen} onClose={() => setSettingsOpen(false)} onAfterClose={() => menuButtonRef.current?.focus()} />
    </>
  );
}
