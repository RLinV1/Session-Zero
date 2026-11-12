import { DIE_NAMES, type DiceLookView } from "@vtt/shared";
import { api } from "../net/api";
import { skinLayoutFor, type DiceSkin, type DiceSkinImage } from "./diceSkin";

import { t } from "../i18n/locale";
/**
 * Where dice looks are kept (dice-looks, ADR 0017 O3): in this browser when signed out, on the
 * account when signed in. The store in `diceSkinStore.ts` talks to one of these and swaps them
 * when the person signs in or out, so the room panels and `Die3D` never know which it is.
 */
export interface DiceLookBackend {
  load(): Promise<{ looks: DiceSkin[]; activeId: string | null }>;
  create(name: string): Promise<DiceSkin>;
  /** Stores `next` over `prev` (null for a look never stored), returning what is stored now. */
  save(prev: DiceSkin | null, next: DiceSkin): Promise<DiceSkin>;
  remove(id: string): Promise<void>;
  setActive(id: string | null): Promise<void>;
}

// ---------- this browser: IndexedDB, as dice-image-skins built it ----------

const DB_NAME = "vtt-dice-looks";
const STORE = "looks";
const ACTIVE_KEY = "vtt.diceLook.active";
/** Where the one-skin prototype kept its d6 picture; moved into a look on first load. */
const LEGACY_KEY = "vtt.diceSkin.d6";

/**
 * A new look's id. `crypto.randomUUID` exists only on secure origins, and a phone on the LAN over
 * plain http isn't one; `getRandomValues` works everywhere.
 */
function newLookId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function readActiveId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

function writeActiveId(id: string | null) {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {
    // Storage blocked: the choice lasts this visit.
  }
}

let dbPromise: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE, { keyPath: "id" });
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
  return dbPromise;
}

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const tx = (await db()).transaction(STORE, mode);
  const request = work(tx.objectStore(STORE));
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error);
  });
}

/** Only pictures this app re-encoded are ever shown. */
function isLook(value: unknown): value is DiceSkin {
  const look = value as DiceSkin;
  return (
    !!look &&
    typeof look.id === "string" &&
    typeof look.name === "string" &&
    typeof look.images === "object" &&
    Object.values(look.images).every((i) => !!i && typeof i.href === "string" && i.href.startsWith("data:image/") && skinLayoutFor(i.width, i.height) === i.layout)
  );
}

let migration: Promise<void> | null = null;

/** Once per page; see `moveLegacy`. */
function migrateLegacy(): Promise<void> {
  migration ??= moveLegacy();
  return migration;
}

async function moveLegacy() {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(LEGACY_KEY);
    // Taken before anything waits, so another tab loading at the same moment can't move it too.
    if (raw) localStorage.removeItem(LEGACY_KEY);
  } catch {
    return;
  }
  if (!raw) return;
  try {
    const old = JSON.parse(raw) as DiceSkinImage & { name?: string };
    const look: DiceSkin = { id: newLookId(), name: t("diceLook.migrated"), updatedAt: Date.now(), images: { d6: { href: old.href, width: old.width, height: old.height, layout: old.layout } } };
    if (isLook(look)) {
      await run("readwrite", (s) => s.put(look));
      if (!readActiveId()) writeActiveId(look.id);
    }
  } catch {
    // Unreadable: drop it.
  }
}

export const localBackend: DiceLookBackend = {
  async load() {
    await migrateLegacy();
    const looks = (await run("readonly", (s) => s.getAll())).filter(isLook);
    looks.sort((a, b) => b.updatedAt - a.updatedAt);
    return { looks, activeId: readActiveId() };
  },
  async create(name) {
    const look: DiceSkin = { id: newLookId(), name, updatedAt: Date.now(), images: {} };
    await run("readwrite", (s) => s.put(look));
    return look;
  },
  async save(_prev, next) {
    await run("readwrite", (s) => s.put(next));
    return next;
  },
  async remove(id) {
    await run("readwrite", (s) => s.delete(id));
    if (readActiveId() === id) writeActiveId(null);
  },
  async setActive(id) {
    writeActiveId(id);
  },
};

// ---------- the account: /api/library/dice ----------

/** The server's look as the drawing code reads one: the picture's address in `href`, where a browser look has a data URL. */
export function fromView(view: DiceLookView): DiceSkin {
  const images: DiceSkin["images"] = {};
  for (const die of DIE_NAMES) {
    const face = view.faces[die];
    const layout = face && skinLayoutFor(face.width, face.height);
    if (face && layout) images[die] = { href: face.url, width: face.width, height: face.height, layout };
  }
  return { id: view.id, name: view.name, updatedAt: Date.parse(view.updatedAt), images };
}

/** A picture kept as a data URL, as the upload the server takes. */
async function blobOf(image: DiceSkinImage): Promise<Blob> {
  return (await fetch(image.href)).blob();
}

export const accountBackend: DiceLookBackend = {
  async load() {
    const { looks, activeId } = await api.library.dice.list();
    return { looks: looks.map(fromView), activeId };
  },
  async create(name) {
    return fromView(await api.library.dice.create(name));
  },
  /** Only what changed goes up: a rename, and each die whose picture changed or was reset. */
  async save(prev, next) {
    let view: DiceLookView | null = null;
    if (!prev || prev.name !== next.name) view = await api.library.dice.rename(next.id, next.name);
    for (const die of DIE_NAMES) {
      const before = prev?.images[die];
      const after = next.images[die];
      if (before?.href === after?.href) continue;
      view = after
        ? await api.library.dice.setFace(next.id, die, await blobOf(after), { width: after.width, height: after.height })
        : await api.library.dice.resetFace(next.id, die);
    }
    return view ? fromView(view) : next;
  },
  async remove(id) {
    await api.library.dice.remove(id);
  },
  async setActive(id) {
    await api.library.dice.setActive(id);
  },
};

/** What saving browser looks into the account did (dice-looks: Bring this browser's dice looks into the account). */
export interface CopyResult {
  saved: number;
  /** Names of the looks that could not be saved; they stay in the browser. */
  failed: string[];
}

/**
 * Copies every look from `from` into `to`, beside what `to` already has (nothing is replaced),
 * removing each from `from` only once all of its pictures are saved. The look in use comes along
 * when `to` has none.
 */
export async function copyLooks(from: DiceLookBackend, to: DiceLookBackend): Promise<CopyResult> {
  const source = await from.load();
  const target = await to.load();
  const result: CopyResult = { saved: 0, failed: [] };
  let carriedActive: string | null = null;
  for (const look of source.looks) {
    let created: DiceSkin | null = null;
    try {
      created = await to.create(look.name);
      await to.save({ ...created, images: {} }, { ...look, id: created.id });
      await from.remove(look.id);
      result.saved++;
      if (look.id === source.activeId) carriedActive = created.id;
    } catch {
      // Take back the half-saved copy, so the look is in exactly one place: the browser.
      if (created) await to.remove(created.id).catch(() => {});
      result.failed.push(look.name);
    }
  }
  if (carriedActive && !target.activeId) await to.setActive(carriedActive);
  return result;
}
