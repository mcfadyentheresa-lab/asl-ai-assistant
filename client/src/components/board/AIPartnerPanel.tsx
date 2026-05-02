/**
 * AIPartnerPanel — the AI co-designer.
 *
 * Two tabs:
 *   • Conversation: a single rolling thread between the designer and the
 *     co-designer. Teammate tone, not assistant tone — we're working through
 *     the board together. The model can propose actions (e.g. "Add a note to
 *     the board: …"); the user accepts with one tap to actually drop the
 *     element on the canvas. Conversation history is sent on every turn so
 *     the model has context across messages.
 *   • Critique: the senior-designer one-shot read of the whole board, kept
 *     from the previous version.
 *
 * Admin/crew only. Open/collapsed state persists per user. Conversation
 * persists per board so reopening the panel keeps the thread.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Sparkles,
  RefreshCw,
  Loader2,
  Send,
  X,
  ChevronRight,
  ChevronLeft,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import type { CanvasElement } from "@shared/schema";
import { buildBoardDigest, type BoardDigest } from "@/lib/board-digest";

const PANEL_WIDTH = 480;
const RAIL_WIDTH = 56;
const MAX_HISTORY = 30; // keep the last N turns in storage / on the wire

// Conversation message — one entry in the rolling thread.
type Role = "user" | "partner";
interface ProposedAction {
  // Single supported action right now: drop a note onto the board.
  // Easy to extend later (image, swatch, supplier) without breaking storage.
  kind: "add_note";
  text: string;
}
interface ChatTurn {
  id: string;
  role: Role;
  content: string;
  // Only on partner turns. Becomes "applied" once the user taps Add.
  actions?: ProposedAction[];
  appliedAt?: number;
  createdAt: number;
}

interface PartnerPanelProps {
  open: boolean;
  onClose: () => void;
  projectId: number;
  boardId: number;
  elements: CanvasElement[];
  hasClient: boolean;
  // Bridge into SpatialCanvas — when the user accepts an "add a note" action,
  // we ask the parent to drop a note element on the canvas. Returns the new
  // element id (or null on failure) so we can mark the action applied.
  onAddNote?: (text: string) => Promise<number | null>;
}

// Quick-prompt chips — phrased as "let's…" so they feel like teammate moves,
// not commands to an assistant.
const QUICK_PROMPTS = [
  "Let's pair what's here",
  "What's missing in this room?",
  "Refine the palette together",
  "Read the room with me",
];

function panelStorageKey(userId: string | number): string {
  return `ai-partner-panel:${userId}`;
}
function chatStorageKey(boardId: number): string {
  return `ai-partner-chat:${boardId}`;
}

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
function saveJSON(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota */ }
}

function generateId(): string {
  return `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export default function AIPartnerPanel({
  open,
  onClose,
  projectId,
  boardId,
  elements,
  hasClient,
  onAddNote,
}: PartnerPanelProps) {
  const [collapsed, setCollapsed] = useState<boolean>(() =>
    loadJSON<boolean>(panelStorageKey("collapsed"), false),
  );
  const [tab, setTab] = useState<"chat" | "critique">("chat");

  // Per-board chat history.
  const [turns, setTurns] = useState<ChatTurn[]>(() =>
    loadJSON<ChatTurn[]>(chatStorageKey(boardId), []),
  );

  useEffect(() => {
    saveJSON(panelStorageKey("collapsed"), collapsed);
  }, [collapsed]);
  useEffect(() => {
    saveJSON(chatStorageKey(boardId), turns.slice(-MAX_HISTORY));
  }, [boardId, turns]);

  // Reload history when board changes.
  useEffect(() => {
    setTurns(loadJSON<ChatTurn[]>(chatStorageKey(boardId), []));
  }, [boardId]);

  // Build digest from elements — sent with every turn so the model can talk
  // about real items by name. Memoized on the board signature.
  const digest = useMemo<BoardDigest>(() => buildBoardDigest(boardId, elements), [boardId, elements]);

  if (!open) return null;

  const width = collapsed ? RAIL_WIDTH : PANEL_WIDTH;

  return (
    <aside
      className="fixed top-0 right-0 z-[115] h-full bg-card border-l border-border shadow-2xl flex flex-col ai-partner-enter"
      style={{ width: `min(100vw, ${width}px)`, transition: "width 220ms ease" }}
      role="complementary"
      aria-label="AI co-designer"
      data-testid="ai-partner-panel"
    >
      <style dangerouslySetInnerHTML={{ __html: PANEL_STYLES }} />

      {collapsed ? (
        <CollapsedRail onExpand={() => setCollapsed(false)} hasNew={turns.length > 0} />
      ) : (
        <ExpandedPanel
          tab={tab}
          setTab={setTab}
          onCollapse={() => setCollapsed(true)}
          onClose={onClose}
          turns={turns}
          setTurns={setTurns}
          digest={digest}
          boardId={boardId}
          projectId={projectId}
          hasClient={hasClient}
          onAddNote={onAddNote}
        />
      )}
    </aside>
  );
}

function CollapsedRail({ onExpand, hasNew }: { onExpand: () => void; hasNew: boolean }) {
  return (
    <button
      onClick={onExpand}
      className="flex flex-col items-center justify-start pt-4 gap-3 w-full h-full hover:bg-muted/40 transition-colors"
      style={{ minWidth: RAIL_WIDTH, minHeight: 44 }}
      aria-label="Expand co-designer"
      data-testid="ai-partner-expand"
    >
      <div className="relative">
        <Sparkles className="h-5 w-5 text-primary" />
        {hasNew && <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-primary animate-pulse" />}
      </div>
      <ChevronLeft className="h-4 w-4 text-muted-foreground" />
    </button>
  );
}

interface ExpandedPanelProps {
  tab: "chat" | "critique";
  setTab: (t: "chat" | "critique") => void;
  onCollapse: () => void;
  onClose: () => void;
  turns: ChatTurn[];
  setTurns: React.Dispatch<React.SetStateAction<ChatTurn[]>>;
  digest: BoardDigest;
  boardId: number;
  projectId: number;
  hasClient: boolean;
  onAddNote?: (text: string) => Promise<number | null>;
}

function ExpandedPanel(props: ExpandedPanelProps) {
  const {
    tab, setTab, onCollapse, onClose,
    turns, setTurns, digest, boardId, projectId, hasClient, onAddNote,
  } = props;

  return (
    <>
      <header className="px-5 pt-5 pb-3 border-b border-border">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2
              className="text-xl text-foreground"
              style={{ fontFamily: "var(--font-serif)", fontWeight: 600, letterSpacing: "-0.02em" }}
            >
              Co-designer
            </h2>
            <div
              className="text-[10px] uppercase text-muted-foreground mt-0.5 flex items-center gap-1.5"
              style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.2em" }}
            >
              <Sparkles className="h-3 w-3" />
              On the board with you
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={onCollapse}
                  className="text-muted-foreground hover:text-foreground p-2 rounded-full hover:bg-muted transition-colors"
                  aria-label="Collapse panel"
                  data-testid="ai-partner-collapse"
                  style={{ minWidth: 44, minHeight: 44 }}
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">Collapse</TooltipContent>
            </Tooltip>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground p-2 rounded-full hover:bg-muted transition-colors"
              aria-label="Close co-designer"
              data-testid="ai-partner-close"
              style={{ minWidth: 44, minHeight: 44 }}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "chat" | "critique")} className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="mx-5 mt-3 grid grid-cols-2" data-testid="ai-partner-tabs">
          <TabsTrigger value="chat" data-testid="ai-partner-tab-chat">Conversation</TabsTrigger>
          <TabsTrigger value="critique" data-testid="ai-partner-tab-critique">Full read</TabsTrigger>
        </TabsList>
        <TabsContent value="chat" className="flex-1 overflow-hidden flex flex-col mt-3">
          <ConversationTab
            digest={digest}
            boardId={boardId}
            turns={turns}
            setTurns={setTurns}
            onAddNote={onAddNote}
          />
        </TabsContent>
        <TabsContent value="critique" className="flex-1 overflow-hidden flex flex-col mt-3">
          <CritiqueTab boardId={boardId} projectId={projectId} hasClient={hasClient} />
        </TabsContent>
      </Tabs>
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Conversation tab — the core change. One thread, history sent on each turn.
// ──────────────────────────────────────────────────────────────────────────

interface ConversationTabProps {
  digest: BoardDigest;
  boardId: number;
  turns: ChatTurn[];
  setTurns: React.Dispatch<React.SetStateAction<ChatTurn[]>>;
  onAddNote?: (text: string) => Promise<number | null>;
}

function ConversationTab(props: ConversationTabProps) {
  const { digest, turns, setTurns, onAddNote } = props;
  const { toast } = useToast();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [rateLimited, setRateLimited] = useState<{ until: number; minutes: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll the thread to the latest turn whenever it grows.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [turns.length, sending]);

  // Tick rate-limit countdown.
  useEffect(() => {
    if (!rateLimited) return;
    const t = setInterval(() => {
      if (Date.now() >= rateLimited.until) setRateLimited(null);
    }, 30000);
    return () => clearInterval(t);
  }, [rateLimited]);

  const isPaused = !!rateLimited && rateLimited.until > Date.now();

  const send = useCallback(async (text: string) => {
    if (!text.trim() || sending) return;

    // 1) Append the user's turn locally so the UI updates immediately.
    const userTurn: ChatTurn = {
      id: generateId(),
      role: "user",
      content: text.trim(),
      createdAt: Date.now(),
    };
    setTurns((prev) => [...prev, userTurn].slice(-MAX_HISTORY));
    setDraft("");
    setSending(true);

    // 2) Build the messages array we send. The server expects {role, content}
    //    pairs; we keep `partner` mapped to `assistant` on the wire.
    const wireHistory = [...turns, userTurn].slice(-MAX_HISTORY).map((t) => ({
      role: t.role === "partner" ? "assistant" : "user",
      content: t.content,
    }));

    try {
      const res = await fetch("/api/ai/board-prompt", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...digest, prompt: text.trim(), messages: wireHistory }),
      });
      if (res.status === 429) {
        const data = await res.json().catch(() => ({}));
        const minutes = typeof data?.retryMinutes === "number" ? data.retryMinutes : 10;
        setRateLimited({ until: Date.now() + minutes * 60 * 1000, minutes });
        return;
      }
      if (!res.ok) {
        let detail = "Failed";
        try {
          const body = await res.json();
          detail = body?.detail || body?.error || detail;
        } catch {
          try { detail = await res.text(); } catch { /* keep default */ }
        }
        throw new Error(detail);
      }
      const data = await res.json() as { text: string; actions?: ProposedAction[] };

      const partnerTurn: ChatTurn = {
        id: generateId(),
        role: "partner",
        content: data.text || "Thinking…",
        actions: Array.isArray(data.actions) && data.actions.length ? data.actions : undefined,
        createdAt: Date.now(),
      };
      setTurns((prev) => [...prev, partnerTurn].slice(-MAX_HISTORY));
    } catch (err: any) {
      toast({
        title: "Couldn't reach the co-designer",
        description: err?.message || "Try again",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  }, [digest, sending, setTurns, toast, turns]);

  const handleApplyAction = useCallback(async (turnId: string, action: ProposedAction) => {
    if (action.kind !== "add_note") return;
    if (!onAddNote) {
      toast({
        title: "Can't add notes from here yet",
        description: "Open the board to drop notes on the canvas.",
      });
      return;
    }
    const id = await onAddNote(action.text);
    if (id) {
      setTurns((prev) =>
        prev.map((t) => (t.id === turnId ? { ...t, appliedAt: Date.now() } : t)),
      );
      toast({ title: "Added to the board" });
    }
  }, [onAddNote, setTurns, toast]);

  const handleClear = useCallback(() => {
    setTurns([]);
  }, [setTurns]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Thread */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-5 pt-1 pb-3 space-y-3"
        data-testid="ai-partner-thread"
      >
        {turns.length === 0 && <EmptyState />}
        {turns.map((t) => (
          <ChatBubble
            key={t.id}
            turn={t}
            onApplyAction={(a) => handleApplyAction(t.id, a)}
          />
        ))}
        {sending && <ThinkingBubble />}
      </div>

      {isPaused && (
        <div
          className="mx-5 mb-2 rounded-md bg-amber-50 border border-amber-200 text-amber-900 px-3 py-2 text-xs"
          data-testid="ai-partner-rate-limit"
        >
          Pausing for a bit — we'll pick this back up in {rateLimited!.minutes} minutes.
        </div>
      )}

      {/* Composer */}
      <div className="px-5 pt-2 pb-4 border-t border-border space-y-2 bg-card">
        <div className="flex items-end gap-2">
          <textarea
            placeholder="What are we working on?"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends; Shift+Enter adds a newline. Matches Slack/iMessage muscle memory.
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(draft);
              }
            }}
            rows={1}
            className="flex-1 bg-muted/40 border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            style={{ fontFamily: "var(--font-sans)", minHeight: 44, maxHeight: 140 }}
            disabled={sending || isPaused}
            data-testid="ai-partner-prompt-input"
          />
          <button
            onClick={() => send(draft)}
            disabled={!draft.trim() || sending || isPaused}
            className="rounded-lg bg-primary text-primary-foreground p-2.5 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
            aria-label="Send"
            data-testid="ai-partner-prompt-send"
            style={{ minWidth: 44, minHeight: 44 }}
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5 items-center">
          {QUICK_PROMPTS.map((qp) => (
            <button
              key={qp}
              onClick={() => send(qp)}
              disabled={sending || isPaused}
              className="text-[11px] uppercase tracking-[0.15em] rounded-full border border-border px-2.5 py-1 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors disabled:opacity-40"
              style={{ fontFamily: "var(--font-mono)" }}
              data-testid={`ai-partner-quick-${qp.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`}
            >
              {qp}
            </button>
          ))}
          {turns.length > 0 && (
            <button
              onClick={handleClear}
              className="ml-auto text-[11px] uppercase tracking-[0.15em] rounded-full px-2.5 py-1 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors inline-flex items-center gap-1"
              style={{ fontFamily: "var(--font-mono)" }}
              aria-label="Clear conversation"
              data-testid="ai-partner-clear"
            >
              <Trash2 className="h-3 w-3" />
              Clear
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div
      className="text-center py-10 px-4 text-sm text-muted-foreground space-y-3"
      style={{ fontFamily: "var(--font-serif)" }}
      data-testid="ai-partner-empty"
    >
      <div className="flex justify-center">
        <span className="relative flex h-3 w-3">
          <span className="absolute inset-0 rounded-full bg-primary/30 animate-ping" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-primary/60" />
        </span>
      </div>
      <p>Hey — what are we working on? Tell me what you're thinking, or pick a starter below.</p>
    </div>
  );
}

function ThinkingBubble() {
  return (
    <div className="flex justify-start" data-testid="ai-partner-thinking">
      <div className="rounded-2xl rounded-tl-sm bg-muted/60 border border-border/40 px-3 py-2 max-w-[85%]">
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-primary/50 ai-partner-dot ai-partner-dot-1" />
          <span className="h-1.5 w-1.5 rounded-full bg-primary/50 ai-partner-dot ai-partner-dot-2" />
          <span className="h-1.5 w-1.5 rounded-full bg-primary/50 ai-partner-dot ai-partner-dot-3" />
        </div>
      </div>
    </div>
  );
}

interface ChatBubbleProps {
  turn: ChatTurn;
  onApplyAction: (action: ProposedAction) => void;
}

function ChatBubble({ turn, onApplyAction }: ChatBubbleProps) {
  const isUser = turn.role === "user";
  return (
    <div
      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
      data-testid={`ai-partner-bubble-${turn.id}`}
    >
      <div
        className={
          isUser
            ? "rounded-2xl rounded-tr-sm bg-primary text-primary-foreground px-3 py-2 max-w-[85%] text-[14px] leading-snug whitespace-pre-wrap"
            : "rounded-2xl rounded-tl-sm bg-muted/60 border border-border/40 text-foreground px-3 py-2 max-w-[85%] text-[14px] leading-snug whitespace-pre-wrap"
        }
        style={{ fontFamily: isUser ? "var(--font-sans)" : "var(--font-serif)" }}
      >
        {turn.content}

        {/* Proposed actions — partner turns only. One tap to drop on the board. */}
        {turn.role === "partner" && turn.actions && turn.actions.length > 0 && (
          <div className="mt-2 pt-2 border-t border-border/40 space-y-1.5">
            {turn.actions.map((a, i) => {
              if (a.kind !== "add_note") return null;
              const applied = !!turn.appliedAt;
              return (
                <div key={i} className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div
                      className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-0.5"
                      style={{ fontFamily: "var(--font-mono)" }}
                    >
                      Note for the board
                    </div>
                    <p className="text-[13px] text-foreground/80 leading-snug" style={{ fontFamily: "var(--font-serif)" }}>
                      {a.text}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant={applied ? "outline" : "default"}
                    className="h-7 text-[11px] uppercase tracking-[0.15em] shrink-0"
                    style={{ fontFamily: "var(--font-mono)" }}
                    onClick={() => !applied && onApplyAction(a)}
                    disabled={applied}
                    data-testid={`ai-partner-apply-action-${turn.id}-${i}`}
                  >
                    {applied ? "Added" : (
                      <>
                        <Plus className="h-3 w-3 mr-1" />
                        Add
                      </>
                    )}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Critique tab — preserved from the prior version (one-shot read of board).
// ──────────────────────────────────────────────────────────────────────────

interface CritiqueTabProps {
  boardId: number;
  projectId: number;
  hasClient: boolean;
}

function CritiqueTab({ boardId, projectId, hasClient }: CritiqueTabProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [critique, setCritique] = useState("");
  const [generatedAt, setGeneratedAt] = useState("");
  const [sending, setSending] = useState(false);

  const generate = useCallback(async () => {
    setLoading(true);
    setCritique("");
    try {
      const res = await fetch("/api/ai/design-critique", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boardId, focus: "all" }),
      });
      if (!res.ok) {
        let detail = "Critique failed";
        try {
          const body = await res.json();
          detail = body?.detail || body?.error || detail;
        } catch {
          try { detail = await res.text(); } catch { /* keep default */ }
        }
        throw new Error(detail);
      }
      const data = await res.json() as { critique: string; generatedAt: string };
      setCritique(data.critique);
      setGeneratedAt(data.generatedAt);
    } catch (err: any) {
      toast({
        title: "Could not generate critique",
        description: err?.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [boardId, toast]);

  const handleSendToClient = useCallback(async () => {
    if (!hasClient || !critique.trim() || sending) return;
    setSending(true);
    try {
      const date = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      const body = `Design critique — ${date}\n\n${critique}`;
      const res = await fetch(`/api/projects/${projectId}/messages`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: body }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast({ title: "Sent to client", description: "The critique was posted to project messages." });
    } catch (err: any) {
      toast({
        title: "Could not send",
        description: err?.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  }, [critique, hasClient, projectId, sending, toast]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-5 pb-2 flex items-center justify-between">
        <div
          className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {generatedAt ? `Generated ${new Date(generatedAt).toLocaleTimeString()}` : "Full read of the board"}
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={generate}
              disabled={loading}
              className="text-muted-foreground hover:text-foreground p-2 rounded-full hover:bg-muted transition-colors disabled:opacity-50"
              aria-label="Re-run critique"
              data-testid="ai-partner-critique-rerun"
              style={{ minWidth: 44, minHeight: 44 }}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Re-run</TooltipContent>
        </Tooltip>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-3">
        {!critique && !loading && (
          <div className="py-8 text-center">
            <Button onClick={generate} className="gap-2" data-testid="ai-partner-critique-run">
              <Sparkles className="h-4 w-4" /> Take a full read
            </Button>
            <p
              className="mt-3 text-xs text-muted-foreground"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              A senior-designer pass on the whole board.
            </p>
          </div>
        )}
        {loading && (
          <div className="space-y-2 text-sm text-muted-foreground" style={{ fontFamily: "var(--font-mono)" }}>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-primary/50 ai-partner-dot ai-partner-dot-1" />
              <span className="h-2 w-2 rounded-full bg-primary/50 ai-partner-dot ai-partner-dot-2" />
              <span className="h-2 w-2 rounded-full bg-primary/50 ai-partner-dot ai-partner-dot-3" />
              <span className="text-[10px] ml-1 uppercase tracking-[0.2em]">Reading the board</span>
            </div>
          </div>
        )}
        {critique && !loading && <CritiqueContent markdown={critique} />}
      </div>

      {critique && (
        <footer className="px-5 py-3 border-t border-border flex items-center gap-2">
          <div className="flex-1" />
          {hasClient ? (
            <Button
              size="sm"
              onClick={handleSendToClient}
              disabled={sending}
              className="gap-2"
              data-testid="ai-partner-critique-send"
            >
              {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Send to client
            </Button>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button size="sm" disabled className="gap-2" data-testid="ai-partner-critique-send-disabled">
                    <Send className="h-3.5 w-3.5" />
                    Send to client
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">Invite a client first.</TooltipContent>
            </Tooltip>
          )}
        </footer>
      )}
    </div>
  );
}

function CritiqueContent({ markdown }: { markdown: string }) {
  const blocks = markdown.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return (
    <div className="space-y-4 text-foreground" style={{ fontFamily: "var(--font-serif)", lineHeight: 1.55 }}>
      {blocks.map((block, idx) => {
        if (/^#{2,}\s/.test(block)) {
          const text = block.replace(/^#{2,}\s+/, "");
          return (
            <h3 key={idx} className="text-base mt-2" style={{ fontWeight: 600, letterSpacing: "-0.01em" }}>
              {renderInline(text)}
            </h3>
          );
        }
        if (/^\*\*[^*]+\*\*\s*$/.test(block)) {
          const text = block.replace(/^\*\*([^*]+)\*\*\s*$/, "$1");
          return (
            <h3 key={idx} className="text-base mt-2" style={{ fontWeight: 600, letterSpacing: "-0.01em" }}>
              {renderInline(text)}
            </h3>
          );
        }
        return (
          <p key={idx} className="text-[14px]" style={{ fontWeight: 500 }}>
            {renderInline(block)}
          </p>
        );
      })}
    </div>
  );
}

function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(<strong key={`b-${key++}`} style={{ fontWeight: 600 }}>{m[1]}</strong>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

const PANEL_STYLES = `
@keyframes ai-partner-slide {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}
.ai-partner-enter {
  animation: ai-partner-slide 280ms cubic-bezier(0.22, 1, 0.36, 1);
}
@media (prefers-reduced-motion: reduce) {
  .ai-partner-enter { animation: none; }
}
@keyframes ai-partner-bounce {
  0%, 80%, 100% { transform: scale(0.6); opacity: 0.6; }
  40% { transform: scale(1); opacity: 1; }
}
.ai-partner-dot { animation: ai-partner-bounce 1.2s infinite ease-in-out; }
.ai-partner-dot-1 { animation-delay: 0s; }
.ai-partner-dot-2 { animation-delay: 0.15s; }
.ai-partner-dot-3 { animation-delay: 0.3s; }
`;
