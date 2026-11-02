import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent, type PointerEvent } from "react";
import { ChatCircleText, X } from "@phosphor-icons/react";
import { MAX_CHAT_LENGTH, mentionSegments, type ChatMessage, type Participant, type RoomState } from "@vtt/shared";
import { useRoomSnapshot, type RoomConnection } from "../net/roomConnection";
import { usePersistentState } from "../ui/usePersistentState";
import { applyMention, mentionQuery, mentionSuggestions } from "./chatMentionInput";

/** Where the chat button sits: its distance in pixels from the window's right and bottom edges. */
export interface ChatSpot {
  right: number;
  bottom: number;
}

const isChatSpot = (v: unknown): v is ChatSpot | null =>
  v === null || (typeof v === "object" && v !== null &&
    Number.isFinite((v as ChatSpot).right) && Number.isFinite((v as ChatSpot).bottom));

/** The chat button's size and the window margin it keeps, in pixels (3.25rem and --space-4). */
const FAB_PX = 52;
const EDGE_PX = 16;
/** A press that moves this far is a drag, not a click. */
const DRAG_PX = 5;
/** How far Shift+arrow moves the button. */
const NUDGE_PX = 24;

/** Keep the button fully inside a window of `width` by `height`. */
export function clampChatSpot(spot: ChatSpot, width: number, height: number): ChatSpot {
  const clamp = (n: number, max: number) => Math.min(Math.max(n, EDGE_PX), Math.max(EDGE_PX, max - FAB_PX - EDGE_PX));
  return { right: clamp(spot.right, width), bottom: clamp(spot.bottom, height) };
}

/**
 * Messages after the newest one seen, by identity. The log is capped, so a new message can push the
 * oldest out and leave the length unchanged; a seen message that has left the log means everything
 * now in it is newer.
 */
export function unreadCount(chat: readonly { id: string }[], seenId: string | null): number {
  return unread(chat, seenId).length;
}

/**
 * Unread messages, counted like `unreadCount`, that mention the viewer (chat-mentions). Your own
 * messages never count, even if they name you.
 */
export function unreadMentionCount(chat: readonly ChatMessage[], seenId: string | null, viewerId: string | undefined): number {
  if (viewerId === undefined) return 0;
  return unread(chat, seenId).filter((m) => m.senderId !== viewerId && mentionsOf(m, viewerId)).length;
}

function unread<T extends { id: string }>(chat: readonly T[], seenId: string | null): readonly T[] {
  const seenAt = seenId === null ? -1 : chat.findIndex((m) => m.id === seenId);
  return chat.slice(seenAt + 1);
}

const mentionsOf = (message: ChatMessage, participantId: string) =>
  message.mentions?.some((m) => m.participantId === participantId) ?? false;

/** The committed time in the viewer's locale, or empty when the message has none (KAN-75). */
function timeLabel(at: string | null): string {
  const date = at ? new Date(at) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
}

/**
 * Room chat (KAN-75, ADR 0015): a floating button at the bottom right of the screen that opens a
 * popup with the most recent messages, oldest first, and a box to add one.
 *
 * Message text is rendered as plain React children, never as markup. The input's `maxLength`
 * is only a hint; the server validates the text and sets the sender, so nothing here decides
 * who said what. Typing `@` offers the room's other participants (chat-mentions); the server
 * works out who a message mentions from the text, so a pick only writes their name.
 */
export function ChatPanel({
  connection,
  state,
  you: viewer,
  readOnly = false,
}: {
  connection: RoomConnection;
  state: RoomState;
  /** Who is looking, when that is not the connection's own seat: the GM previewing as a player. */
  you?: Participant;
  /** The GM is previewing as a player (gm-view-as-player): messages are shown but cannot be sent. */
  readOnly?: boolean;
}) {
  const { status, you: self } = useRoomSnapshot(connection);
  const you = viewer ?? self;
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  /** Where the caret is, so the mention being typed is the one at the caret. */
  const [caret, setCaret] = useState(0);
  const [highlight, setHighlight] = useState(0);
  /** The `@` whose list Escape closed; it stays closed until another `@` is typed. */
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  /** Where to put the caret once a picked name is in the input. */
  const pendingCaret = useRef<number | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  /** Moved by dragging the button, or Shift+arrows on it; null keeps the bottom-right corner. */
  const [spot, setSpot] = usePersistentState<ChatSpot | null>("vtt.ui.chatSpot", null, isChatSpot);
  const drag = useRef<{ x: number; y: number; from: ChatSpot; moved: boolean } | null>(null);
  /** Set by a drag's release, so the click that follows doesn't open the chat. */
  const dragged = useRef(false);
  const [, setWindowSize] = useState(0);
  useEffect(() => {
    const onResize = () => setWindowSize((n) => n + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  /**
   * The newest message seen so far. Unread is counted after it by identity, not by length: the log
   * is capped, so a new message can push the oldest out and leave the length unchanged.
   */
  const [seenId, setSeenId] = useState<string | null>(state.chat.at(-1)?.id ?? null);
  const log = useRef<HTMLUListElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const newest = state.chat.at(-1)?.id;
  const unread = open ? 0 : unreadCount(state.chat, seenId);
  const mentioned = open ? 0 : unreadMentionCount(state.chat, seenId, you?.id);

  // Keep the newest message in view when one arrives, and on first show.
  useEffect(() => {
    const el = log.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [newest, open]);

  useEffect(() => {
    if (open) setSeenId(newest ?? null);
  }, [open, newest]);

  const online = status === "open";
  const canSend = online && !readOnly && !busy && text.trim() !== "";
  // The list never opens while the input can't send: offline, or the GM previewing as a player.
  const query = online && !readOnly ? mentionQuery(text, caret) : null;
  const suggestions = query && query.start !== dismissedAt ? mentionSuggestions(state.participants, you?.id, query.fragment) : [];
  const listOpen = suggestions.length > 0;
  const active = Math.min(highlight, Math.max(suggestions.length - 1, 0));

  // A pick rewrites the controlled value, which puts the caret at the end; put it after the name.
  useLayoutEffect(() => {
    const el = input.current;
    if (el && pendingCaret.current !== null) {
      el.setSelectionRange(pendingCaret.current, pendingCaret.current);
      pendingCaret.current = null;
    }
  }, [text]);

  // Sending clears the input without going through `edit`; an Escape on the last message must not
  // keep the next one's list closed.
  useEffect(() => {
    if (text === "") setDismissedAt(null);
  }, [text]);

  const edit = (value: string, at: number) => {
    setText(value);
    setCaret(at);
    setHighlight(0);
    setError(null);
    if (mentionQuery(value, at)?.start !== dismissedAt) setDismissedAt(null);
  };

  const pick = (participant: Participant) => {
    if (!query) return;
    const next = applyMention(text, query, participant.displayName);
    pendingCaret.current = next.caret;
    edit(next.text, next.caret);
    input.current?.focus();
  };

  const onInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!listOpen || !query || e.nativeEvent.isComposing) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setHighlight((active + step + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter" || (e.key === "Tab" && !e.shiftKey)) {
      // Enter picks rather than sends while the list is open.
      e.preventDefault();
      pick(suggestions[active]!);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setDismissedAt(query.start);
    }
  };

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSend) return;
    setBusy(true);
    const result = await connection.command({ type: "chat.send", text });
    setBusy(false);
    if (result.ok) {
      // Only what was sent: anything typed while waiting for the server is the next message.
      setText((current) => (current === text ? "" : current));
      setError(null);
    } else {
      // Keep what was typed so it can be fixed and sent again.
      setError(result.message);
    }
  };

  // Until moved, the button rests at the bottom left.
  const here = clampChatSpot(spot ?? { right: window.innerWidth - EDGE_PX - FAB_PX, bottom: EDGE_PX }, window.innerWidth, window.innerHeight);
  // The popup opens toward the middle of the window, whichever corner the button is in. In the
  // left or top half the widget is pinned by its left or top edge, so the popup grows away from
  // the edge instead of past it.
  const left = here.right > window.innerWidth / 2;
  const top = here.bottom > window.innerHeight / 2;
  const widgetClass = ["chat-widget", left ? "chat-widget-left" : "", top ? "chat-widget-top" : ""].filter(Boolean).join(" ");
  const widgetStyle = {
    ...(left ? { left: window.innerWidth - here.right - FAB_PX, right: "auto" } : { right: here.right }),
    ...(top ? { top: window.innerHeight - here.bottom - FAB_PX, bottom: "auto" } : { bottom: here.bottom }),
    // The popup may use the height between the button and the far edge.
    "--chat-room": `${(top ? here.bottom : window.innerHeight - here.bottom - FAB_PX) - 2 * EDGE_PX}px`,
  };

  const current = (): ChatSpot => here;
  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, from: current(), moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_PX) return;
    d.moved = true;
    setSpot(clampChatSpot({ right: d.from.right - dx, bottom: d.from.bottom - dy }, window.innerWidth, window.innerHeight));
  };
  const onPointerUp = () => {
    dragged.current = drag.current?.moved ?? false;
    drag.current = null;
  };
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const step = { ArrowLeft: [NUDGE_PX, 0], ArrowRight: [-NUDGE_PX, 0], ArrowUp: [0, NUDGE_PX], ArrowDown: [0, -NUDGE_PX] }[e.key];
    if (!e.shiftKey || !step) return;
    e.preventDefault();
    const from = current();
    setSpot(clampChatSpot({ right: from.right + step[0]!, bottom: from.bottom + step[1]! }, window.innerWidth, window.innerHeight));
  };

  return (
    <div className={widgetClass} data-tour="chat" style={widgetStyle as CSSProperties}>
      {open && (
        <section className="chat-popup" aria-label="Chat">
          <header className="chat-popup-header">
            <h2>Chat</h2>
            <button type="button" className="icon-button" aria-label="Close chat"
              onClick={() => {
                setOpen(false);
                // The button unmounts with the popup, so hand focus to the launcher.
                launcher.current?.focus();
              }}
            >
              <X size={16} aria-hidden />
            </button>
          </header>
      {state.chat.length === 0 ? (
        <p className="muted">No messages yet.</p>
      ) : (
        <ul className="plain chat-log" ref={log} aria-label="Chat messages" aria-live="polite" tabIndex={0}>
          {state.chat.map((m) => (
            <ChatRow key={m.id} message={m} mine={m.senderId === you?.id} viewerId={you?.id} />
          ))}
        </ul>
      )}
      <form onSubmit={send} className="chat-form">
        <label htmlFor="chat-text" className="sr-only">Message</label>
        {listOpen && (
          <ul id={listId} role="listbox" aria-label="Mention someone" className="plain chat-mention-list">
            {suggestions.map((p, i) => (
              <li
                key={p.id}
                id={`${listId}-${p.id}`}
                role="option"
                aria-selected={i === active}
                className={i === active ? "chat-mention-option active" : "chat-mention-option"}
                // Keep focus in the input, so a click or tap picks without closing the keyboard.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(p)}
              >
                <span>{p.displayName}</span>
                {p.role === "gm" && <span className="muted">GM</span>}
              </li>
            ))}
          </ul>
        )}
        <div className="dice-row">
          <input
            ref={input}
            id="chat-text"
            value={text}
            onChange={(e) => edit(e.target.value, e.target.selectionStart ?? e.target.value.length)}
            onSelect={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
            onKeyDown={onInputKeyDown}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={listOpen}
            aria-controls={listOpen ? listId : undefined}
            aria-activedescendant={listOpen ? `${listId}-${suggestions[active]!.id}` : undefined}
            maxLength={MAX_CHAT_LENGTH}
            disabled={readOnly}
            placeholder={readOnly ? "Chat is read-only while previewing" : online ? "Say something…" : "Offline"}
            autoComplete="off"
            aria-invalid={error !== null}
            aria-describedby={error ? "chat-error" : undefined}
          />
          <button type="submit" className="primary" disabled={!canSend}>Send</button>
        </div>
        {error && <p id="chat-error" role="alert" className="error">{error}</p>}
      </form>
        </section>
      )}
      <button
        ref={launcher}
        type="button"
        className="chat-fab"
        aria-label={launcherLabel(unread, mentioned)}
        aria-expanded={open}
        title="Chat · drag, or Shift+arrow keys, to move"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        onClick={() => {
          if (dragged.current) {
            dragged.current = false;
            return;
          }
          setOpen((o) => !o);
        }}
      >
        <ChatCircleText size={24} aria-hidden />
        {unread > 0 && (
          <span className={mentioned > 0 ? "chat-badge mention" : "chat-badge"} aria-hidden>
            {mentioned > 0 && "@"}{unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
    </div>
  );
}

/** "Chat", plus how many messages are unread and how many of those mention you (chat-mentions). */
export function launcherLabel(unread: number, mentioned: number): string {
  if (unread === 0) return "Chat";
  if (mentioned === 0) return `Chat, ${unread} unread`;
  return `Chat, ${unread} unread, ${mentioned} ${mentioned === 1 ? "mentions" : "mention"} you`;
}

/**
 * One message. Recorded mentions are highlighted where the text names them, judged from the
 * viewer's side: a mention of the viewer stands out, and so does a line that mentions them, with
 * words as well as colour (chat-mentions). Everything stays React text, never markup.
 */
export function ChatRow({ message, mine, viewerId }: { message: ChatMessage; mine: boolean; viewerId: string | undefined }) {
  const time = timeLabel(message.at);
  const mentionsYou = !mine && viewerId !== undefined && mentionsOf(message, viewerId);
  const className = ["chat-message", mine && "mine", mentionsYou && "mentions-you"].filter(Boolean).join(" ");
  return (
    <li className={className}>
      <span className="chat-meta">
        <strong className="chat-sender">{message.senderName}</strong>
        {time && <time dateTime={message.at ?? undefined} className="muted">{time}</time>}
        {mentionsYou && <span className="chat-mentions-you">Mentions you</span>}
      </span>
      <span className="chat-text">
        {mentionSegments(message.text, message.mentions, { participantId: message.senderId, displayName: message.senderName }).map((segment, i) =>
          segment.kind === "text" ? (
            segment.text
          ) : (
            <span key={i} className={segment.participantId === viewerId ? "chat-mention you" : "chat-mention"}>{segment.text}</span>
          ),
        )}
      </span>
    </li>
  );
}
