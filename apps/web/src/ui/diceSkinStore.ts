import { useSyncExternalStore } from "react";
import { accountStore, type AccountState } from "../account/accountStore";
import { ApiError } from "../net/api";
import type { BodyName } from "./diceGeometry";
import { keptSize, MAX_SKIN_FILE_BYTES, SHEET, SKIN_FILE_TYPES, skinLayoutFor, templateSvg, type DiceSkin, type DiceSkinImage } from "./diceSkin";
import { accountBackend, copyLooks, localBackend, readActiveId, type CopyResult, type DiceLookBackend } from "./diceLookBackends";

/**
 * This viewer's dice looks (dice-image-skins, dice-looks): made in the asset library's Dice tab,
 * picked in the room's Dice panel, and drawn only on this viewer's own screen.
 *
 * Signed in, they are the account's, the same on every device (ADR 0017 O3); signed out, they
 * are this browser's, in IndexedDB. The store swaps between the two when the person signs in or
 * out; nothing that draws dice knows which it is. Other tabs hear about every change, so a look
 * saved in the library shows up in an open room at once; a change on another device shows up
 * when this tab comes back to the front.
 */
interface State {
  looks: DiceSkin[];
  activeId: string | null;
  ready: boolean;
  /** Where the looks shown are kept. */
  kept: "browser" | "account";
}

let state: State = { looks: [], activeId: readActiveId(), ready: false, kept: "browser" };
let backend: DiceLookBackend = localBackend;
const listeners = new Set<() => void>();
const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("vtt-dice-looks");
channel?.addEventListener("message", () => void reload());

function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

let loading = 0;

async function reload() {
  const ticket = ++loading;
  const kept = state.kept;
  try {
    const loaded = await backend.load();
    // A newer load (or a backend swap) won: drop this one.
    if (ticket === loading) set({ ...loaded, ready: true, kept });
  } catch {
    // No IndexedDB, or the server is unreachable: keep whatever this visit has.
    if (ticket === loading) set({ ready: true, kept });
  }
}

/** Signed in, the account; signed out, the browser; still asking, nothing yet (no flash of the wrong looks). */
function follow(account: AccountState) {
  if (account.status === "loading") return;
  const kept = account.status === "signedIn" ? "account" : "browser";
  if (kept === state.kept && state.ready) return;
  backend = kept === "account" ? accountBackend : localBackend;
  set({ looks: [], activeId: null, ready: false, kept });
  void reload();
}

accountStore.subscribe(follow);
follow(accountStore.getState());

if (typeof document !== "undefined") {
  // Changes made on another device arrive when this tab is next in front.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && state.kept === "account") void reload();
  });
}

function announce() {
  channel?.postMessage("changed");
}

// ---------- the API ----------

export function useDiceLooks(): State {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

/** The look in use, for drawing your own dice; null for the classic dice. */
export function useActiveDiceLook(): DiceSkin | null {
  const { looks, activeId } = useDiceLooks();
  return looks.find((l) => l.id === activeId) ?? null;
}

/** Makes an empty look named "Dice look N" (the first free N) and returns its id. */
export async function createDiceLook(): Promise<string> {
  const names = new Set(state.looks.map((l) => l.name));
  let n = state.looks.length + 1;
  while (names.has(`Dice look ${n}`)) n++;
  const look = await backend.create(`Dice look ${n}`);
  set({ looks: [look, ...state.looks] });
  announce();
  return look.id;
}

/** A refusal for being over the upload allowance says what to do; retrying would not help (upload-limits). */
export function diceLookSaveFailure(err: unknown) {
  return err instanceof ApiError && err.status === 409 ? err.message : "Your dice look could not be saved. Try again.";
}

/** Shows the change at once, then stores it; the stored copy (with the server's picture addresses) replaces it. */
export async function saveDiceLook(look: DiceSkin) {
  const prev = state.looks.find((l) => l.id === look.id) ?? null;
  const next = { ...look, updatedAt: Date.now() };
  set({ looks: [next, ...state.looks.filter((l) => l.id !== next.id)] });
  try {
    const stored = await backend.save(prev, next);
    set({ looks: state.looks.map((l) => (l.id === stored.id ? stored : l)) });
  } catch (err) {
    // Not stored: put back what is, so the screen doesn't promise a save that didn't happen.
    void reload();
    throw new Error(diceLookSaveFailure(err));
  }
  announce();
}

export async function deleteDiceLook(id: string) {
  set({ looks: state.looks.filter((l) => l.id !== id), activeId: state.activeId === id ? null : state.activeId });
  try {
    await backend.remove(id);
  } catch {
    void reload();
  }
  announce();
}

export function setActiveDiceLook(id: string | null) {
  set({ activeId: id });
  void backend.setActive(id).then(announce, () => void reload());
}

/** How many looks this browser keeps of its own: what signing in can bring to the account. */
export async function browserLookCount(): Promise<number> {
  try {
    return (await localBackend.load()).looks.length;
  } catch {
    return 0;
  }
}

/** Saves this browser's looks to the signed-in account, then shows the account's (dice-looks). */
export async function saveBrowserLooksToAccount(): Promise<CopyResult> {
  const result = await copyLooks(localBackend, accountBackend);
  await reload();
  announce();
  return result;
}

/**
 * Turns an uploaded file into a die's picture, or says why it can't be one: a painted template
 * (3:2, like every template) or one square picture for every face. It is drawn onto a canvas and
 * re-encoded, so only plain pixels are kept, at no more than the size it needs.
 */
export async function readSkinFile(file: File): Promise<DiceSkinImage | string> {
  if (!(SKIN_FILE_TYPES as readonly string[]).includes(file.type)) return "Use a PNG, JPEG or WebP picture";
  if (file.size > MAX_SKIN_FILE_BYTES) return "That picture is over 5 MB";
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return "That picture couldn't be read";
  }
  const layout = skinLayoutFor(bitmap.width, bitmap.height);
  if (!layout) {
    bitmap.close();
    return `Use a painted template (${SHEET.width} × ${SHEET.height}, or the same 3:2 shape) or a square picture`;
  }
  const size = keptSize(bitmap.width, bitmap.height, layout);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, size.width, size.height);
  bitmap.close();
  // WebP where the browser can write it; toDataURL falls back to PNG where it can't.
  return { href: canvas.toDataURL("image/webp", 0.9), width: size.width, height: size.height, layout };
}

/** The die's template as a PNG. */
async function templatePng(name: BodyName): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([templateSvg(name)], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = SHEET.width;
    canvas.height = SHEET.height;
    canvas.getContext("2d")!.drawImage(img, 0, 0);
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!png) throw new Error("The template couldn't be drawn");
    return png;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function save(blob: Blob, filename: string) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

/**
 * Puts the die's template on the clipboard as an image, ready to paste into an image AI. Call it
 * straight from the click: browsers only allow clipboard writes during one. Where the clipboard
 * won't take an image, the template is saved as a file instead.
 */
export async function copyTemplate(name: BodyName): Promise<"copied" | "saved"> {
  const png = templatePng(name);
  try {
    if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) throw new Error("No image clipboard");
    // The item takes the promise, so the write starts inside the click.
    await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
    return "copied";
  } catch {
    save(await png, `${name}-skin-template.png`);
    return "saved";
  }
}

/** Puts text on the clipboard; false where the browser won't allow it. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
