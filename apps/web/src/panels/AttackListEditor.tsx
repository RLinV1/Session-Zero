import { useState, type ReactNode } from "react";
import { MAX_TOKEN_ATTACKS, type AttackPreset } from "@vtt/shared";
import { Modal } from "../ui/Modal";
import { PresetEditor } from "./AttackPanel";
import { presetSummary } from "./attackRoll";
import { t } from "../i18n/locale";

/**
 * A token's named attacks as a collapsible section of a dialog (shared-token-attacks): closed when
 * the dialog opens, its count in the heading, and the list with Add attack and Edit inside. Edit
 * and Add open the attack editor in its own dialog, which `editor` must render outside the host
 * form, since the editor is a form of its own. The host decides when the list is sent.
 */
export function useAttackListEditor({ attacks, onChange }: { attacks: AttackPreset[]; onChange: (attacks: AttackPreset[]) => void }): {
  section: ReactNode;
  editor: ReactNode;
} {
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const section = (
    <details className="token-editor-section attack-list-section">
      <summary>{t("home.attack.title")}<span className="token-editor-summary">{attacks.length || t("card.noneLower")}</span></summary>
      <div className="stack" role="group" aria-label={t("home.attack.title")}>
        {attacks.map((attack, index) => (
          <div className="row" key={attack.name}>
            <span>{attack.name} · {presetSummary(attack)}</span>
            <button type="button" className="link" onClick={() => setEditing(index)}>{t("common.edit")}</button>
          </div>
        ))}
        <button type="button" className="secondary" disabled={attacks.length >= MAX_TOKEN_ATTACKS} onClick={() => setEditing("new")}>
          {t("creature.addAttack")}
        </button>
      </div>
    </details>
  );
  const editor = (
    <Modal open={editing !== null} title={editing === "new" ? t("creature.addAttack") : t("creature.editAttack")} onClose={() => setEditing(null)}>
      {editing !== null && (
        <PresetEditor
          key={editing}
          initial={typeof editing === "number" ? attacks[editing] ?? null : null}
          taken={attacks.filter((_, index) => index !== editing).map((a) => a.name)}
          onSave={(attack) => {
            onChange(editing === "new" ? [...attacks, attack] : attacks.map((a, index) => (index === editing ? attack : a)));
            setEditing(null);
          }}
          onRemove={typeof editing === "number" ? () => {
            onChange(attacks.filter((_, index) => index !== editing));
            setEditing(null);
          } : undefined}
          onCancel={() => setEditing(null)}
        />
      )}
    </Modal>
  );
  return { section, editor };
}
