/**
 * Traditional Chinese twins of the shared sentence builders (localization; ADR 0054): activity
 * sentences, undo phrases, portal changes, replay labels, and the attack and condition words in
 * them. Each mirrors its English switch case for case and ends in the same `never` check, so an
 * event type added in English fails the typecheck until it reads in Chinese too.
 *
 * Terms follow docs/GLOSSARY-zh-TW.md. Names people typed are passed through untouched; `cjk`
 * spaces them from the Chinese around them.
 */
import { cjk } from "./core";
import type { AttackContext, DiceRoll } from "../dice";
import type { DomainEvent } from "../events";
import type { ConditionId } from "../conditions";
import type { Portal, PortalState, RoomState } from "../state";
import { templateChangeKind } from "../templateChange";
import { DEFEAT_REMOVAL_IDS, DIAGONAL_RULE_IDS, DIFFICULT_TERRAIN_IDS } from "./ruleIds";
import { rejectionsZhTW } from "./messages/zh-TW/rejections";
import type { UndoEntry } from "../undo";

/** The parts of a roll an activity sentence reads; the lookup lives with the English builder. */
export type FindRoll = (id: string) => DiceRoll | undefined;
/** The English builder's undo phrase helper, so both languages read one `UndoEntry` the same way. */
export type PortalWords = { past: string; verb: string; gerund: string };

const list = (items: readonly string[]) => items.join("、");

export const CONDITION_LABELS_ZH_TW: Readonly<Record<ConditionId, { label: string; abbr: string }>> = {
  blinded: { label: "目盲", abbr: "盲" },
  charmed: { label: "魅惑", abbr: "魅" },
  frightened: { label: "恐慌", abbr: "慌" },
  grappled: { label: "擒抱", abbr: "擒" },
  invisible: { label: "隱形", abbr: "隱" },
  paralyzed: { label: "麻痺", abbr: "痺" },
  poisoned: { label: "中毒", abbr: "毒" },
  prone: { label: "倒地", abbr: "倒" },
  restrained: { label: "束縛", abbr: "縛" },
  stunned: { label: "震懾", abbr: "懾" },
  unconscious: { label: "昏迷", abbr: "昏" },
  concentrating: { label: "專注", abbr: "專" },
};

const AREA_COLOR: Readonly<Record<string, string>> = {
  red: "紅色", orange: "橙色", yellow: "黃色", green: "綠色", blue: "藍色", purple: "紫色", grey: "灰色",
};
const AREA_SHAPE: Readonly<Record<string, string>> = { circle: "圓形", cone: "錐形", box: "方形", line: "直線" };
const PORTAL_KIND: Readonly<Record<Portal["kind"], string>> = { door: "門", window: "窗" };
const PORTAL_STATE_ZH: Readonly<Record<PortalState, string>> = { open: "開啟", closed: "關閉", locked: "上鎖" };
const VERDICT: Readonly<Record<"hit" | "miss", string>> = { hit: "命中", miss: "未命中" };

/** "Aria → Goblin", with 未知 for a side the roll didn't record. */
export function attackPartiesZhTW(attack: AttackContext): string {
  return `${attack.actor?.name ?? "未知"} → ${attack.target?.name ?? "未知"}`;
}

/** "傷害" for an unlabelled damage roll, the attack's own label otherwise (ADR 0011). */
export function attackLabelZhTW(attack: AttackContext): string | null {
  return attack.label ?? (attack.kind === "damage" ? "傷害" : null);
}

/** 命中, 未命中, 已套用, or nothing yet. */
export function attackOutcomeZhTW(roll: Pick<DiceRoll, "verdict" | "damageApplied">): string | null {
  if (roll.verdict) return roll.verdict === "hit" ? "命中" : "未命中";
  return roll.damageApplied ? "已套用" : null;
}

/** Same-kind state changes: [verb, past]. */
const STATE_VERBS: Partial<Record<`${PortalState}>${PortalState}`, string>> = {
  "closed>open": "打開",
  "open>closed": "關上",
  "closed>locked": "鎖上",
  "locked>closed": "解鎖",
  "locked>open": "解鎖並打開",
  "open>locked": "關上並鎖上",
};

/** One portal change: `past` for the log ("將一扇門打開"), `verb` and `gerund` for undo ("打開一扇門"). */
export function portalChangeZhTW(from: Portal | null, to: Portal | null): PortalWords {
  if (from && to && from.kind === to.kind) {
    const verb = STATE_VERBS[`${from.state}>${to.state}`] ?? "變更";
    const object = `一扇${PORTAL_KIND[to.kind]}`;
    return { verb: verb + object, past: `將${object}${verb}`, gerund: verb + object };
  }
  if (from && !to) {
    const object = `一扇${PORTAL_KIND[from.kind]}`;
    return { verb: `把${object}改回牆`, past: `把${object}改回了牆`, gerund: `把${object}改回牆` };
  }
  const source = from ? `一扇${PORTAL_KIND[from.kind]}` : "一面牆";
  const target = to ? `一扇${PORTAL_STATE_ZH[to.state]}的${PORTAL_KIND[to.kind]}` : "牆";
  return { verb: `把${source}改成${target}`, past: `把${source}改成了${target}`, gerund: `把${source}改成${target}` };
}

/**
 * Undo phrases: `verb` follows 復原 on the Undo button ("復原移動 Goblin"), `noun` follows 復原了 in
 * the log ("Sam 復原了 Goblin 的移動"). Mirrors `describeUndo`'s English, case for case.
 */
export function describeUndoZhTW(entry: UndoEntry, tokens: RoomState["tokens"]): { verb: string; noun: string } {
  const nameOf = (id: string) => tokens[id]?.name ?? entry.tokenNames[id] ?? "一枚棋子";
  const rollOf = (id: string) => entry.rollLabels[id] ?? "一次擲骰";
  const applied = entry.events.find((e) => e.type === "RollDamageApplied");
  if (applied) {
    if (applied.amount < 0) return { verb: cjk`${rollOf(applied.rollId)}的治療`, noun: cjk`依${rollOf(applied.rollId)}治療的${-applied.amount}點` };
    return { verb: cjk`${rollOf(applied.rollId)}的傷害`, noun: cjk`${rollOf(applied.rollId)}的${applied.amount}點傷害` };
  }
  const nuked = entry.events.find((e) => e.type === "MapNuked");
  if (nuked) return { verb: cjk`核彈（${nuked.amount}）`, noun: cjk`${nuked.amount}點傷害的核彈` };
  const resolved = entry.events.find((e) => e.type === "AreaEffectResolved");
  if (resolved) {
    const what = cjk`${resolved.effect.label ? `「${resolved.effect.label}」` : "範圍效果"}（${resolved.effect.targets.length}個目標）`;
    return { verb: what, noun: `結算${what}` };
  }
  const first = entry.events[0];
  if (!first) return { verb: "上一個動作", noun: "一個動作" };
  const defeats = entry.events.filter((e) => e.type === "TokenDeleted");
  if (first.type === "TokenDeleted" || defeats.length > 0) {
    const names = defeats.map((e) => e.token.name);
    const who = names.length === 1 ? names[0]! : cjk`${names.length}枚棋子`;
    return { verb: cjk`${who}被擊敗並移除`, noun: cjk`${who}被擊敗並移除` };
  }
  if (first.type === "GridSet") return { verb: "網格變更", noun: "網格的變更" };
  if (first.type === "TerrainPainted" || first.type === "TerrainEffectCreated" || first.type === "TerrainEffectRemoved" || first.type === "TerrainEffectRenamed") {
    return { verb: "地形編輯", noun: "地形的編輯" };
  }
  if (first.type === "MapSet") {
    const count = first.tokenChanges.length;
    const positions = count ? cjk`與${count}枚棋子的位置` : "";
    const action = first.map ? first.previous ? "更換地圖" : "放置地圖" : "移除地圖";
    return { verb: action + positions, noun: action + positions };
  }
  if (first.type === "MapNuked") return { verb: "核彈", noun: "核彈" };
  if (first.type === "AreaEffectResolved") return { verb: "範圍效果", noun: "結算一個範圍效果" };
  if (first.type === "CheckpointRestored") return { verb: `還原「${first.name}」`, noun: `還原存檔點「${first.name}」` };
  if (first.type === "EncounterApplied") return { verb: `套用「${first.name}」`, noun: `套用遭遇範本「${first.name}」` };
  const wallsAdded = entry.events.find((e) => e.type === "WallsAdded");
  if (wallsAdded) {
    const what = cjk`${wallsAdded.walls.length}面牆`;
    return { verb: `套用${what}`, noun: `套用${what}` };
  }
  if (first.type === "WallsAdded" || first.type === "WallsRemoved") {
    const what = cjk`${first.walls.length}面牆`;
    return { verb: `移除${what}`, noun: `移除${what}` };
  }
  if (first.type === "LineOfSightSet") return first.to ? { verb: "開啟視線", noun: "開啟視線" } : { verb: "關閉視線", noun: "關閉視線" };
  if (first.type === "IsometricSet") return { verb: "地圖樣式變更", noun: "變更地圖樣式" };
  if (first.type === "SightRangeSet") return { verb: "視野範圍變更", noun: "變更視野範圍" };
  if (first.type === "WallUpdated") return { verb: "牆或門窗的編輯", noun: "編輯牆或門窗" };
  if (first.type === "PortalChanged") {
    const words = portalChangeZhTW(first.from, first.to);
    return { verb: words.verb, noun: words.gerund };
  }
  if (first.type === "FogAdded" || first.type === "FogRemoved") {
    const what = first.region.shape === "rect" ? "矩形迷霧" : "多邊形迷霧";
    return first.type === "FogAdded" ? { verb: `新增${what}`, noun: `新增一個${what}` } : { verb: `移除${what}`, noun: `移除一個${what}` };
  }
  if (first.type === "TokenCreated") {
    const name = nameOf(first.token.id);
    return entry.events.length > 1
      ? { verb: cjk`新增${entry.events.length}枚棋子`, noun: cjk`新增${name}和其他${entry.events.length - 1}枚棋子` }
      : { verb: cjk`新增${name}`, noun: cjk`新增${name}` };
  }
  if (first.type === "InitiativeStarted") return { verb: "開始先攻", noun: "開始先攻" };
  if (first.type === "GroupCreated") return { verb: `新群組「${first.group.name}」`, noun: `建立群組「${first.group.name}」` };
  if (first.type === "GroupRenamed") return { verb: `重新命名「${first.previous}」`, noun: `將群組「${first.previous}」重新命名為「${first.name}」` };
  if (first.type === "GroupDeleted") return { verb: `刪除「${first.group.name}」`, noun: `刪除群組「${first.group.name}」` };
  if (first.type === "TokensGrouped") {
    const names = first.changes.map((c) => nameOf(c.tokenId));
    const who = names.length === 1 ? names[0]! : cjk`${names.length}枚棋子`;
    return first.groupId === null ? { verb: cjk`將${who}移出群組`, noun: cjk`將${who}移出群組` } : { verb: cjk`為${who}分組`, noun: cjk`為${who}分組` };
  }
  if (first.type === "RollRuled" || first.type === "RollDamageApplied") {
    return { verb: cjk`對${rollOf(first.rollId)}的裁定`, noun: cjk`對${rollOf(first.rollId)}的裁定` };
  }
  if (first.type === "RollsDismissed") {
    const what = cjk`略過${first.rollIds.length}次攻擊檢定`;
    return { verb: what, noun: what };
  }
  const name = nameOf(first.tokenId);
  if (entry.events.length > 1) return { verb: cjk`編輯${name}`, noun: cjk`對${name}的編輯` };
  switch (first.type) {
    case "TokenMoved":
      return { verb: cjk`移動${name}`, noun: cjk`${name}的移動` };
    case "TokenHiddenSet":
      return first.hidden ? { verb: cjk`隱藏${name}`, noun: cjk`隱藏${name}` } : { verb: cjk`顯示${name}`, noun: cjk`顯示${name}` };
    case "TokenConditionsSet":
      return { verb: cjk`${name}的狀態`, noun: cjk`${name}的狀態變更` };
    case "TokenStatsSet":
      return { verb: cjk`${name}的數值`, noun: cjk`${name}的數值變更` };
    case "TokenAttacksSet":
      return { verb: cjk`${name}的攻擊`, noun: cjk`${name}的攻擊變更` };
  }
}

/** A board point: at most 2 decimals, like the English. */
const point = (p: { x: number; y: number }) => `(${Number(p.x.toFixed(2))}, ${Number(p.y.toFixed(2))})`;

/** Activity sentences in Traditional Chinese. Mirrors `formatActivity`'s English, case for case. */
/** What each kind of drawing is called in the log (ADR 0064). */
const DRAWING_NAMES_ZH = { line: "一條線", rect: "一個矩形", circle: "一個圓形", stroke: "一個手繪圖形" } as const;

export function formatActivityZhTW(event: DomainEvent, actorName: string, before: RoomState, findRoll: FindRoll): string {
  const a = actorName;
  const tokenName = (id: string) => before.tokens[id]?.name ?? "未知的棋子";
  const participantName = (id: string) => before.participants[id]?.displayName ?? "未知的參與者";
  const rollLabel = (roll: DiceRoll | undefined, fallback: string) =>
    roll?.attack ? `${attackPartiesZhTW(roll.attack)}（${roll.expression}：${roll.total}）` : fallback;
  const effectName = (label: string | null) => (label ? `範圍效果「${label}」` : "範圍效果");
  const gmOnly = (gm: boolean) => (gm ? "（僅 GM 可見）" : "");
  const unit = before.scene.grid.unitLabel;
  const templateLabel = (t: { shape: string; size: number; width?: number; color?: string }) => {
    const size = Number(t.size.toFixed(2));
    const width = t.shape === "line" && t.width !== undefined && t.width !== before.scene.grid.unitsPerCell
      ? cjk`，寬${Number(t.width.toFixed(2))} ${unit}` : "";
    return cjk`${t.color ? AREA_COLOR[t.color] ?? t.color : ""}${size} ${unit}${AREA_SHAPE[t.shape] ?? t.shape}範圍` + width;
  };
  switch (event.type) {
    case "SceneDraftCreated": return cjk`${a}準備了「${event.name}」場景`;
    case "ScenePrepared": return cjk`${a}編輯了私人場景`;
    case "SceneCreated": return cjk`${a}建立了場景「${event.name}」`;
    case "SceneSwitched": return cjk`${a}切換至「${event.name}」場景`;
    case "SceneRenamed": return cjk`${a}將場景「${event.previous}」重新命名為「${event.name}」`;
    case "SceneDeleted": return cjk`${a}刪除了場景「${event.name}」`;
    case "RoomCreated": return cjk`${a}建立了房間「${event.name}」`;
    case "ParticipantJoined": return event.participant.role === "gm" ? cjk`${a}以 GM 身分加入房間` : cjk`${a}以玩家身分加入房間`;
    case "ParticipantRevoked": return cjk`${a}將${event.participant.displayName}移出房間`;
    case "ParticipantLeft": return cjk`${event.participant.displayName}離開了遊戲桌`;
    case "ParticipantRenamed": return cjk`${a}將${event.previous}的名稱改為${event.displayName}`;
    case "ParticipantDiceLookSet":
      return a === participantName(event.participantId)
        ? event.look ? cjk`${a}變更了自己的骰子外觀` : cjk`${a}將自己的骰子恢復為經典外觀`
        : cjk`${a}將${participantName(event.participantId)}的骰子恢復為經典外觀`;
    case "MapSet": {
      const count = event.tokenChanges?.length;
      if (event.map) {
        const positions = count === undefined ? "" : cjk`，並調整了${count}枚棋子`;
        return cjk`${a}${event.previous ? "更換" : "設定"}了遊戲地圖${event.gridChange ? "與網格" : ""}` + positions;
      }
      const restored = [...(event.gridChange ? ["網格"] : []), ...(count === undefined ? [] : [cjk`${count}枚棋子的位置`])];
      return cjk`${a}移除了地圖` + (restored.length ? `，並還原了${restored.join("與")}` : "");
    }
    case "GridSet": return cjk`${a}更新了網格`;
    case "LineOfSightSet": return cjk`${a}${event.to ? "啟用" : "關閉"}了視線判定`;
    case "IsometricSet": return cjk`${a}將地圖切換為${event.to ? "2.5D 等角視角" : "平面視角"}`;
    case "SightRangeSet": {
      const n = event.to === null ? null : Math.round(event.to * 10) / 10;
      return n === null ? cjk`${a}將視野範圍調整為無限` : cjk`${a}將視野範圍調整為${n} ${unit}`;
    }
    case "TokenCreated": return cjk`${a}新增了棋子${event.token.name}` + (event.token.hidden ? "（隱藏）" : "");
    case "TerrainPainted": return cjk`${a}在地圖上繪製地形`;
    case "TerrainEffectCreated": return cjk`${a}建立了地形效果「${event.effect.name}」`;
    case "TerrainEffectRemoved": return cjk`${a}移除了地形效果「${event.effect.name}」`;
    case "TerrainEffectRenamed": return cjk`${a}重新命名了一項地形效果`;
    case "TokenMoved": return cjk`${a}將${tokenName(event.tokenId)}從 ${point(event.from)} 移至 ${point(event.to)}`;
    case "TokenAppearanceSet":
      return cjk`${a}將${event.previous.name}改為${event.name}（大小 ${event.size}、旋轉 ${event.rotation}°）`;
    case "TokenDeleted": return event.reason === "defeated" ? cjk`${event.token.name}被擊敗並移除` : cjk`${a}刪除了棋子${event.token.name}`;
    case "TokenOwnersSet":
      return event.ownerIds.length
        ? cjk`${a}將${tokenName(event.tokenId)}的控制權交給${list(event.ownerIds.map(participantName))}`
        : cjk`${a}將${tokenName(event.tokenId)}設為不屬於任何玩家`;
    case "TokenHiddenSet": return cjk`${a}將${tokenName(event.tokenId)}設為${event.hidden ? "隱藏" : "可見"}`;
    case "TokenStatsSet":
      return cjk`${a}更新了${tokenName(event.tokenId)}的能力數值：HP ${event.stats.hp ?? "未設定"}/${event.stats.maxHp ?? "未設定"}、AC ${event.stats.ac ?? "未設定"}`;
    case "TokenImageSet": return cjk`${a}${event.imageUrl ? "更換" : "移除"}了${tokenName(event.tokenId)}的棋子圖片`;
    case "TokenConditionsSet": {
      const names = event.conditions.map((id) => CONDITION_LABELS_ZH_TW[id]?.label ?? id);
      return cjk`${a}將${tokenName(event.tokenId)}的狀態設為${names.length ? list(names) : "無"}`;
    }
    case "TokenAttacksSet":
      return cjk`${a}將${tokenName(event.tokenId)}的攻擊設定為${event.attacks.length ? list(event.attacks.map((x) => x.name)) : "無"}`;
    case "InitiativeStarted": return cjk`${a}開始了先攻排序：${list(event.initiative.order.map(tokenName)) || "沒有棋子"}`;
    case "InitiativeAdvanced":
      return cjk`${a}將戰鬥推進至第${event.initiative.round}輪，輪到${tokenName(event.initiative.order[event.initiative.activeIndex] ?? "")}`;
    case "InitiativeRewound":
      return cjk`${a}將回合退回第${event.initiative.round}輪，輪到${tokenName(event.initiative.order[event.initiative.activeIndex] ?? "")}`;
    case "InitiativeEnded": return cjk`${a}結束了先攻順序`;
    case "InitiativeStartUndone": return cjk`${a}復原了開始先攻的操作`;
    case "GroupCreated": return cjk`${a}建立了群組「${event.group.name}」`;
    case "GroupRenamed": return cjk`${a}將群組「${event.previous}」重新命名為「${event.name}」`;
    case "GroupDeleted": return cjk`${a}刪除了群組「${event.group.name}」`;
    case "TokensGrouped": {
      const names = list(event.changes.map((c) => tokenName(c.tokenId)));
      return event.groupId === null
        ? cjk`${a}將${names}從原本的群組移出`
        : cjk`${a}將${names}放入群組「${before.groups[event.groupId]?.name ?? "未知的群組"}」`;
    }
    case "DiceRolled": {
      const { attack, expression, total, visibility } = event.roll;
      const what = attack
        ? cjk`一次攻擊：${attackPartiesZhTW(attack)}${attack.label ? `，使用${attack.label}` : ""}，${expression}`
        : expression;
      return cjk`${a}擲了${what}，結果為${total}` + gmOnly(visibility === "gm");
    }
    case "GroupRolled": {
      const { expression, label, entries, visibility } = event.roll;
      const results = list(entries.map((e) => `${e.name} ${e.total}`));
      return cjk`${a}為${entries.length}枚棋子進行${expression}` + (label ? `（${label}）` : "") + "檢定" + (results ? `：${results}` : "") + gmOnly(visibility === "gm");
    }
    case "AreaEffectStarted": {
      const names = list(event.effect.targets.map((t) => t.name));
      return cjk`${a}對${names || "沒有可見的棋子"}施放了${effectName(event.effect.label)}（${event.effect.expression}）`;
    }
    case "AreaEffectCalled": {
      const effect = before.areaEffect;
      const what = effectName(effect?.id === event.effectId ? effect.label : null);
      return event.previous === null
        ? cjk`${a}請${participantName(event.participantId)}為${what}擲傷害骰`
        : cjk`${a}將${what}的傷害擲骰從${participantName(event.previous)}改由${participantName(event.participantId)}負責`;
    }
    case "AreaEffectDamageRolled": {
      const effect = before.areaEffect;
      const what = effectName(effect?.id === event.effectId ? effect.label : null);
      const { damage } = event;
      return damage.mode === "single"
        ? cjk`${a}為${what}擲了${damage.expression}傷害骰，結果為${damage.total}`
        : cjk`${a}為${what}的每個目標擲了${damage.expression}傷害骰`;
    }
    case "AreaEffectResolved": return cjk`${a}已對${event.effect.targets.length}枚棋子結算${effectName(event.effect.label)}`;
    case "AreaEffectClosed": return cjk`${a}關閉了${effectName(event.effect.label)}，未套用效果`;
    case "RollRuled": {
      const roll = findRoll(event.rollId);
      const gm = gmOnly(roll?.visibility === "gm");
      if (!event.verdict) return cjk`${a}清除了對${rollLabel(roll, "先前的攻擊檢定")}的裁定` + gm;
      if (event.previous) return cjk`${a}將${rollLabel(roll, "先前的攻擊檢定")}的裁定從${VERDICT[event.previous]}改為${VERDICT[event.verdict]}` + gm;
      return cjk`${a}將${rollLabel(roll, "先前的攻擊檢定")}判定為${VERDICT[event.verdict]}` + gm;
    }
    case "RollDamageApplied": {
      const roll = findRoll(event.rollId);
      const gm = gmOnly(roll?.visibility === "gm");
      // The GM's chosen amount (ADR 0062): a heal, or a part of the rolled damage.
      if (event.amount < 0) return cjk`${a}依${rollLabel(roll, "先前擲骰")}治療了${-event.amount}點` + gm;
      const rolled = roll ? Math.max(0, roll.total) : event.amount;
      if (event.amount !== rolled) return cjk`${a}套用了${rollLabel(roll, "先前擲骰")}產生的${rolled}點傷害中的${event.amount}點` + gm;
      return cjk`${a}套用了${rollLabel(roll, "先前擲骰")}產生的${event.amount}點傷害` + gm;
    }
    case "RollsDismissed": return cjk`${a}略過了裁定清單中的${event.rollIds.length}次攻擊檢定`;
    case "RollsRestored": return cjk`${a}將${event.rollIds.length}次攻擊檢定放回裁定清單`;
    case "AutoRemoveDefeatedSet": return cjk`${a}${event.enabled ? "開啟" : "關閉"}了「自動移除被擊敗棋子」功能`;
    // Table rules (ADR 0057) and movement rules (ADR 0055), named as the Settings menu names them.
    case "DefeatRemovalSet": return cjk`${a}將「HP 歸零時移除棋子」設為「${rejectionsZhTW[DEFEAT_REMOVAL_IDS[event.mode]]}」`;
    case "HideMapWithoutTokenSet": return cjk`${a}${event.enabled ? "開啟" : "關閉"}了「對沒有棋子的玩家隱藏地圖」`;
    case "HideHpSet": return cjk`${a}${event.enabled ? "開啟" : "關閉"}了「對玩家隱藏 HP」`;
    case "HideAcSet": return cjk`${a}${event.enabled ? "開啟" : "關閉"}了「對玩家隱藏 AC」`;
    case "DiagonalRuleSet": return cjk`${a}將斜向移動設為「${rejectionsZhTW[DIAGONAL_RULE_IDS[event.rule]]}」`;
    case "DifficultTerrainSet": return cjk`${a}將困難地形的計算方式設為「${rejectionsZhTW[DIFFICULT_TERRAIN_IDS[event.mode]]}」`;
    case "JoinsLockSet": return event.locked ? cjk`${a}鎖定了房間，禁止新玩家加入` : cjk`${a}解鎖了房間`;
    case "ReducedEffectsSet": return cjk`${a}為整張遊戲桌${event.enabled ? "啟用" : "關閉"}了減少動畫效果`;
    case "MapNuked": return cjk`${a}引爆核彈，造成${event.amount}點傷害`;
    case "MapNukeUndone": return cjk`${a}復原了核彈爆炸（${event.amount}點傷害）`;
    case "RollDamageUnapplied": {
      const roll = findRoll(event.rollId);
      if (event.amount < 0) return cjk`${a}復原了依${rollLabel(roll, "先前擲骰")}治療的${-event.amount}點` + gmOnly(roll?.visibility === "gm");
      return cjk`${a}復原了${rollLabel(roll, "先前擲骰")}套用的${event.amount}點傷害` + gmOnly(roll?.visibility === "gm");
    }
    case "ChatMessageSent": {
      const { text } = event.message;
      return cjk`${a}傳送訊息：` + (text.length > 80 ? `${text.slice(0, 79)}…` : text);
    }
    case "TemplatePlaced": return cjk`${a}放置了${templateLabel(event.template)}` + gmOnly(!!event.template.gmOnly);
    case "TemplateChanged": {
      const template = before.templates[event.templateId];
      if (!template) return cjk`${a}修改了一個範圍`;
      // A destination without a width is back to the default one cell, not the template's old width.
      const was = templateLabel({ ...template, ...event.from }), now = templateLabel({ ...template, ...event.to, width: event.to.width });
      const kind = templateChangeKind(event.from, event.to);
      const sentence = kind === "moved" ? cjk`${a}移動了${was}` : kind === "turned" ? cjk`${a}轉動了${was}` : cjk`${a}將${was}改為${now}`;
      return sentence + gmOnly(!!template.gmOnly);
    }
    case "TemplateRemoved": return cjk`${a}移除了${templateLabel(event.template)}` + gmOnly(!!event.template.gmOnly);
    case "DrawingAdded": return cjk`${a}畫了${DRAWING_NAMES_ZH[event.drawing.kind]}`;
    case "DrawingRemoved": {
      const owner = participantName(event.drawing.ownerId);
      const what = DRAWING_NAMES_ZH[event.drawing.kind].replace(/^一(條|個)/, "");
      return owner === a ? cjk`${a}擦掉了自己的${what}` : cjk`${a}擦掉了${owner}的${what}`;
    }
    case "FogAdded": return cjk`${a}新增了${event.region.shape === "rect" ? "矩形" : "多邊形"}迷霧區域`;
    case "FogRemoved": return cjk`${a}移除了${event.region.shape === "rect" ? "矩形" : "多邊形"}迷霧區域`;
    case "WallUpdated": return cjk`${a}修改了${event.wall.portal ? "一個門窗" : "一面牆"}`;
    case "WallsAdded": return cjk`${a}新增了${event.walls.length}面牆`;
    case "WallsRemoved": return cjk`${a}移除了${event.walls.length}面牆`;
    case "PortalChanged": return cjk`${a}${portalChangeZhTW(event.from, event.to).past}`;
    case "CheckpointCreated": return cjk`${a}儲存了存檔點「${event.checkpoint.name}」`;
    case "CheckpointDeleted": return cjk`${a}刪除了存檔點「${event.checkpoint.name}」`;
    case "CheckpointRestored": return cjk`${a}將遊戲桌還原至存檔點「${event.name}」`;
    case "EncounterApplied": return cjk`${a}套用了遭遇範本「${event.name}」`;
    case "ActionUndone": {
      const entry = before.undo.find((e) => e.commandId === event.commandId);
      return entry ? cjk`${a}復原了${describeUndoZhTW(entry, before.tokens).noun}` : cjk`${a}復原了一項操作`;
    }
    default: {
      const exhaustive: never = event;
      return exhaustive;
    }
  }
}

/** A replay step the viewer gets as a snapshot: the actor and the kind of change only. */
export function neutralSentenceZhTW(event: DomainEvent, actorName: string): string {
  switch (event.type) {
    case "InitiativeStarted": return cjk`${actorName}開始了先攻`;
    case "InitiativeAdvanced": return cjk`${actorName}推進了回合`;
    case "InitiativeRewound": return cjk`${actorName}退回了回合`;
    case "FogAdded":
    case "FogRemoved": return cjk`${actorName}變更了迷霧`;
    case "DiceRolled":
    case "GroupRolled": return cjk`${actorName}擲了骰子`;
    case "SceneCreated":
    case "SceneSwitched": return cjk`${actorName}變更了場景`;
    case "CheckpointRestored": return cjk`${actorName}將棋盤還原到一個存檔點`;
    case "EncounterApplied": return cjk`${actorName}設定了一場遭遇`;
    case "TokenMoved":
    case "TokenOwnersSet":
    case "TokenHiddenSet":
    case "TokenCreated":
    case "TokenDeleted": return cjk`${actorName}變更了棋盤上的內容`;
    default: return "棋盤已變更";
  }
}
