import { useState } from "react";
import { DEFAULT_PRESET_ID, GAME_PRESETS, type GamePresetId } from "@vtt/shared";
import { useAccount } from "../account/accountStore";
import { api } from "../net/api";
import { newGuestToken, saveCredentials } from "../net/identity";
import { t } from "../i18n/locale";

import { presetDescription, presetName } from "../i18n/labels";
/** What creating a room asks for (FR-GM-01, KAN-63). */
export interface RoomDetails {
  roomName: string;
  displayName: string;
  preset: GamePresetId;
}

export const emptyRoomDetails = (roomName = "", displayName = ""): RoomDetails => ({ roomName, displayName, preset: DEFAULT_PRESET_ID });

/**
 * The form's details, the GM's name starting as the account's, once; the GM may change it for this
 * room (create-room-form-defaults).
 */
export function useRoomDetails() {
  const account = useAccount();
  return useState<RoomDetails>(() => emptyRoomDetails("", account.status === "signedIn" ? account.account.displayName : ""));
}

/** True when the details can be sent: a room name and a display name that aren't blank. */
export const roomDetailsReady = (details: RoomDetails) => details.roomName.trim() !== "" && details.displayName.trim() !== "";

/**
 * The room name, the GM's name in the room and the game, as the dashboard's Create a room and
 * an encounter's Open in a room both ask them (ADR 0033).
 */
export function RoomDetailsFields({ value, onChange, disabled = false }: {
  value: RoomDetails;
  onChange: (next: RoomDetails) => void;
  disabled?: boolean;
}) {
  return (
    <>
      <label>
        {t("room.details.name")}
        <input
          value={value.roomName}
          onChange={(e) => onChange({ ...value, roomName: e.target.value })}
          required
          maxLength={80}
          disabled={disabled}
        />
      </label>
      <label>
        {t("room.details.yourName")}
        <input
          value={value.displayName}
          onChange={(e) => onChange({ ...value, displayName: e.target.value })}
          required
          maxLength={40}
          disabled={disabled}
        />
      </label>
      {/* Only a choice once there is more than one game (KAN-63). */}
      {GAME_PRESETS.length > 1 && <fieldset className="preset-choice" disabled={disabled}>
        <legend>{t("room.details.game")}</legend>
        {GAME_PRESETS.map((p) => (
          <label key={p.id} className="preset-option">
            <input type="radio" name="preset" value={p.id} checked={value.preset === p.id} onChange={() => onChange({ ...value, preset: p.id })} />
            <span>
              <strong>{presetName(p)}</strong>
              <span className="muted small-print">{presetDescription(p)}</span>
            </span>
          </label>
        ))}
      </fieldset>}
    </>
  );
}

/** Creates a room as the signed-in GM and keeps its credential on this browser; returns its id. */
export async function createRoomWith(details: RoomDetails, templateId?: string): Promise<string> {
  const guestToken = newGuestToken();
  const created = await api.createRoom({ ...details, guestToken, ...(templateId && { templateId }) });
  saveCredentials({ ...created, guestToken, viaAccount: true });
  return created.roomId;
}
