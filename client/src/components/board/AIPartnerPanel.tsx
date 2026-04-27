/**
 * AIPartnerPanel — docked right-side panel that watches the board and surfaces
 * proactive prompts as design-relevant changes happen. Replaces the old
 * one-shot Critique modal: critique now lives behind a tab here.
 *
 * Admin/crew only. Open/collapsed state persists per user in localStorage.
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
  Circle,
  Link2,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import type { CanvasElement } from "@shared/schema";
import { buildBoardDigest, isMeaningfulChange, type BoardDigest } from "@/lib/board-digest";

const PANEL_WIDTH = 480;
const RAIL_WIDTH = 56;
const DEBOUNCE_MS = 8000;
const MAX_STORED = 30;

type SuggestionType = "gap" | "conflict" | "pairing" | "opportunity";
type Severity = "info" | "nudge" | "flag";

interface Suggestion {
  type: SuggestionType;
  room?: string;
  severity: Severity;
  text: string;
  referencedElementIds?: number[];
}

interface StoredSuggestion extends Suggestion {
  id: string;
  signature: string;
  createdAt: number;
  source: "pulse" | "prompt";
  prompt?: string;
  dismissed?: boolean;
  expanded?: string;
  expanding?: boolean;
}

interface PartnerPanelProps {
  open: boolean;
  onClose: () => void;
  projectId: number;
  boardId: number;
  elements: CanvasElement[];
  hasClient: boolean;
}

const QUICK_PROMPTS = [
  "Pair with what I have",
  "Find what's missing",
  "Refine the palette",
  "Read the room",
];

function panelStorageKey(userId: string | number): string {
  return `ai-partner-panel:${userId}`;
}
function suggestionStorageKey(boardId: number): string {
  return `ai-partner-suggestions:${boardId}`;
}
function dismissedStorageKey(boardId: number): string {
  return `ai-partner-dismissed:${boardId}`;
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
  return `sug_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export default function AIPartnerPanel({
  open,
  onClose,
  projectId,
  boardId,
  elements,
  hasClient,
}: PartnerPanelProps) {
  const { toast } = useToast();
  const [collapsed, setCollapsed] = useState<boolean>(() =>
    loadJSON<boolean>(panelStorageKey("collapsed"), false),
  );
  const [tab, setTab] = useState<"suggestions" | "critique">("suggestions");

  // Suggestions state, persisted per board.
  const [suggestions, setSuggestions] = useState<StoredSuggestion[]>(() =>
    loadJSON<StoredSuggestion[]>(suggestionStorageKey(boardId), []),
  );
  const [dismissedSignatures, setDismissedSignatures] = useState<string[]>(() =>
    loadJSON<string[]>(dismissedStorageKey(boardId), []),
  );

  useEffect(() => {
    saveJSON(panelStorageKey("collapsed"), collapsed);
  }, [collapsed]);
  useEffect(() => {
    saveJSON(suggestionStorageKey(boardId), suggestions);
  }, [boardId, suggestions]);
  useEffect(() => {
    saveJSON(dismissedStorageKey(boardId), dismissedSignatures);
  }, [boardId, dismissedSignatures]);

  // Reload when board changes.
  useEffect(() => {
    setSuggestions(loadJSON<StoredSuggestion[]>(suggestionStorageKey(boardId), []));
    setDismissedSignatures(loadJSON<string[]>(dismissedStorageKey(boardId), []));
  }, [boardId]);

  // Build digest from elements (memoized on stable signature).
  const digest = useMemo<BoardDigest>(() => buildBoardDigest(boardId, elements), [boardId, elements]);
  const lastDigestRef = useRef<BoardDigest | null>(null);
  const lastSentSignatureRef = useRef<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [pulseLoading, setPulseLoading] = useState(false);
  const [rateLimited, setRateLimited] = useState<{ until: number; minutes: number } | null>(null);

  const callPulse = useCallback(async () => {
    if (rateLimited && rateLimited.until > Date.now()) return;
    if (pulseLoading) return;
    if (lastSentSignatureRef.current === digest.signature) return;
    setPulseLoading(true);
    try {
      const res = await fetch("/api/ai/board-pulse", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(digest),
      });
      if (res.status === 429) {
        const data = await res.json().catch(() => ({}));
        const minutes = typeof data?.retryMinutes === "number" ? data.retryMinutes : 10;
        setRateLimited({ until: Date.now() + minutes * 60 * 1000, minutes });
        return;
      }
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Pulse failed");
      }
      const data = await res.json() as { suggestions: Suggestion[]; signature: string | null };
      lastSentSignatureRef.current = digest.signature;
      const stamped: StoredSuggestion[] = (data.suggestions || []).map((s) => ({
        ...s,
        id: generateId(),
        signature: digest.signature,
        createdAt: Date.now(),
        source: "pulse",
      }));
      if (stamped.length === 0) return;
      setSuggestions((prev) => {
        const next = [...stamped, ...prev];
        return next.slice(0, MAX_STORED);
      });
    } catch (err: any) {
      // Silent — proactive engine should not nag. Only surface if we're loading on demand.
      console.warn("[AIPartner] pulse error:", err?.message || err);
    } finally {
      setPulseLoading(false);
    }
  }, [digest, pulseLoading, rateLimited]);

  // Proactive engine: debounce + meaningful diff.
  useEffect(() => {
    if (!open || collapsed) return;
    const prev = lastDigestRef.current;
    lastDigestRef.current = digest;
    if (!isMeaningfulChange(prev, digest)) return;
    // Skip if user dismissed this exact signature.
    if (dismissedSignatures.includes(digest.signature)) return;
    // Skip if we already sent this signature this session.
    if (lastSentSignatureRef.current === digest.signature) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      callPulse();
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [open, collapsed, digest, dismissedSignatures, callPulse]);

  // Tick rateLimited countdown.
  useEffect(() => {
    if (!rateLimited) return;
    const t = setInterval(() => {
      if (Date.now() >= rateLimited.until) setRateLimited(null);
    }, 30000);
    return () => clearInterval(t);
  }, [rateLimited]);

  const handleDismiss = useCallback((id: string) => {
    setSuggestions((prev) => {
      const target = prev.find((s) => s.id === id);
      const remaining = prev.filter((s) => s.id !== id);
      if (target) {
        setDismissedSignatures((d) => Array.from(new Set([...d, target.signature])).slice(-50));
      }
      return remaining;
    });
  }, []);

  const handleHighlight = useCallback((ids: number[] | undefined) => {
    if (!ids || ids.length === 0) return;
    highlightElements(ids);
  }, []);

  const handleTellMore = useCallback(async (sug: StoredSuggestion) => {
    if (sug.expanding) return;
    setSuggestions((prev) => prev.map((s) => s.id === sug.id ? { ...s, expanding: true } : s));
    try {
      const res = await fetch("/api/ai/design-critique", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boardId, focus: sug.text }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Could not elaborate");
      }
      const data = await res.json() as { critique: string };
      setSuggestions((prev) => prev.map((s) => s.id === sug.id ? { ...s, expanding: false, expanded: data.critique } : s));
    } catch (err: any) {
      setSuggestions((prev) => prev.map((s) => s.id === sug.id ? { ...s, expanding: false } : s));
      toast({
        title: "Couldn't elaborate",
        description: err?.message || "Try again",
        variant: "destructive",
      });
    }
  }, [boardId, toast]);

  const visibleSuggestions = useMemo(
    () => suggestions.filter((s) => !s.dismissed).slice(0, MAX_STORED),
    [suggestions],
  );

  if (!open) return null;

  const width = collapsed ? RAIL_WIDTH : PANEL_WIDTH;

  return (
    <aside
      className="fixed top-0 right-0 z-[115] h-full bg-card border-l border-border shadow-2xl flex flex-col ai-partner-enter"
      style={{ width: `min(100vw, ${width}px)`, transition: "width 220ms ease" }}
      role="complementary"
      aria-label="AI partner"
      data-testid="ai-partner-panel"
    >
      <style dangerouslySetInnerHTML={{ __html: PANEL_STYLES }} />

      {collapsed ? (
        <CollapsedRail onExpand={() => setCollapsed(false)} hasNew={visibleSuggestions.length > 0} />
      ) : (
        <ExpandedPanel
          tab={tab}
          setTab={setTab}
          onCollapse={() => setCollapsed(true)}
          onClose={onClose}
          pulseLoading={pulseLoading}
          rateLimited={rateLimited}
          suggestions={visibleSuggestions}
          onDismiss={handleDismiss}
          onHighlight={handleHighlight}
          onTellMore={handleTellMore}
          digest={digest}
          boardId={boardId}
          projectId={projectId}
          hasClient={hasClient}
          appendSuggestion={(sug) => setSuggestions((prev) => [sug, ...prev].slice(0, MAX_STORED))}
          setRateLimited={setRateLimited}
          callPulse={callPulse}
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
      aria-label="Expand AI partner"
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
  tab: "suggestions" | "critique";
  setTab: (t: "suggestions" | "critique") => void;
  onCollapse: () => void;
  onClose: () => void;
  pulseLoading: boolean;
  rateLimited: { until: number; minutes: number } | null;
  suggestions: StoredSuggestion[];
  onDismiss: (id: string) => void;
  onHighlight: (ids: number[] | undefined) => void;
  onTellMore: (sug: StoredSuggestion) => void;
  digest: BoardDigest;
  boardId: number;
  projectId: number;
  hasClient: boolean;
  appendSuggestion: (sug: StoredSuggestion) => void;
  setRateLimited: (r: { until: number; minutes: number } | null) => void;
  callPulse: () => void;
}

function ExpandedPanel(props: ExpandedPanelProps) {
  const {
    tab, setTab, onCollapse, onClose, pulseLoading, rateLimited,
    suggestions, onDismiss, onHighlight, onTellMore,
    digest, boardId, projectId, hasClient, appendSuggestion, setRateLimited, callPulse,
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
              Partner mode
            </h2>
            <div
              className="text-[10px] uppercase text-muted-foreground mt-0.5 flex items-center gap-1.5"
              style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.2em" }}
            >
              <Sparkles className="h-3 w-3" />
              {pulseLoading ? "Thinking…" : "Watching the board"}
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
              aria-label="Close partner"
              data-testid="ai-partner-close"
              style={{ minWidth: 44, minHeight: 44 }}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "suggestions" | "critique")} className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="mx-5 mt-3 grid grid-cols-2" data-testid="ai-partner-tabs">
          <TabsTrigger value="suggestions" data-testid="ai-partner-tab-suggestions">Suggestions</TabsTrigger>
          <TabsTrigger value="critique" data-testid="ai-partner-tab-critique">Critique</TabsTrigger>
        </TabsList>
        <TabsContent value="suggestions" className="flex-1 overflow-hidden flex flex-col mt-3">
          <SuggestionsTab
            digest={digest}
            boardId={boardId}
            suggestions={suggestions}
            onDismiss={onDismiss}
            onHighlight={onHighlight}
            onTellMore={onTellMore}
            rateLimited={rateLimited}
            pulseLoading={pulseLoading}
            appendSuggestion={appendSuggestion}
            setRateLimited={setRateLimited}
            callPulse={callPulse}
          />
        </TabsContent>
        <TabsContent value="critique" className="flex-1 overflow-hidden flex flex-col mt-3">
          <CritiqueTab boardId={boardId} projectId={projectId} hasClient={hasClient} />
        </TabsContent>
      </Tabs>
    </>
  );
}

interface SuggestionsTabProps {
  digest: BoardDigest;
  boardId: number;
  suggestions: StoredSuggestion[];
  onDismiss: (id: string) => void;
  onHighlight: (ids: number[] | undefined) => void;
  onTellMore: (sug: StoredSuggestion) => void;
  rateLimited: { until: number; minutes: number } | null;
  pulseLoading: boolean;
  appendSuggestion: (sug: StoredSuggestion) => void;
  setRateLimited: (r: { until: number; minutes: number } | null) => void;
  callPulse: () => void;
}

function SuggestionsTab(props: SuggestionsTabProps) {
  const {
    digest, boardId, suggestions, onDismiss, onHighlight, onTellMore,
    rateLimited, pulseLoading, appendSuggestion, setRateLimited, callPulse,
  } = props;
  const { toast } = useToast();
  const [prompt, setPrompt] = useState("");
  const [sending, setSending] = useState(false);

  const send = useCallback(async (text: string) => {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetch("/api/ai/board-prompt", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...digest, prompt: text.trim() }),
      });
      if (res.status === 429) {
        const data = await res.json().catch(() => ({}));
        const minutes = typeof data?.retryMinutes === "number" ? data.retryMinutes : 10;
        setRateLimited({ until: Date.now() + minutes * 60 * 1000, minutes });
        return;
      }
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || "Failed");
      }
      const data = await res.json() as { text: string };
      const sug: StoredSuggestion = {
        id: generateId(),
        type: "opportunity",
        severity: "info",
        text: data.text,
        source: "prompt",
        prompt: text.trim(),
        createdAt: Date.now(),
        signature: digest.signature,
      };
      appendSuggestion(sug);
      setPrompt("");
    } catch (err: any) {
      toast({
        title: "Couldn't ask the partner",
        description: err?.message || "Try again",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  }, [appendSuggestion, digest, sending, setRateLimited, toast]);

  const isPaused = !!rateLimited && rateLimited.until > Date.now();

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-5 pb-3 space-y-2">
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Ask the partner…"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") send(prompt); }}
            className="flex-1 bg-muted/40 border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            style={{ fontFamily: "var(--font-sans)", minHeight: 44 }}
            disabled={sending || isPaused}
            data-testid="ai-partner-prompt-input"
          />
          <button
            onClick={() => send(prompt)}
            disabled={!prompt.trim() || sending || isPaused}
            className="rounded-lg bg-primary text-primary-foreground p-2.5 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
            aria-label="Send prompt"
            data-testid="ai-partner-prompt-send"
            style={{ minWidth: 44, minHeight: 44 }}
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_PROMPTS.map((qp) => (
            <button
              key={qp}
              onClick={() => send(qp)}
              disabled={sending || isPaused}
              className="text-[11px] uppercase tracking-[0.15em] rounded-full border border-border px-2.5 py-1 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors disabled:opacity-40"
              style={{ fontFamily: "var(--font-mono)" }}
              data-testid={`ai-partner-quick-${qp.toLowerCase().replace(/\s+/g, "-")}`}
            >
              {qp}
            </button>
          ))}
        </div>
      </div>

      {isPaused && (
        <div
          className="mx-5 mb-3 rounded-md bg-amber-50 border border-amber-200 text-amber-900 px-3 py-2 text-xs"
          data-testid="ai-partner-rate-limit"
        >
          Pausing for a bit — I'll check back in {rateLimited!.minutes} minutes.
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-2.5">
        {pulseLoading && suggestions.length === 0 && <PartnerThinkingState />}
        {!pulseLoading && suggestions.length === 0 && <EmptyState />}
        {suggestions.map((s) => (
          <SuggestionCard
            key={s.id}
            sug={s}
            onDismiss={() => onDismiss(s.id)}
            onHighlight={() => onHighlight(s.referencedElementIds)}
            onTellMore={() => onTellMore(s)}
          />
        ))}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div
      className="text-center py-12 px-4 text-sm text-muted-foreground space-y-3"
      style={{ fontFamily: "var(--font-serif)" }}
      data-testid="ai-partner-empty"
    >
      <div className="flex justify-center">
        <span className="relative flex h-3 w-3">
          <span className="absolute inset-0 rounded-full bg-primary/30 animate-ping" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-primary/60" />
        </span>
      </div>
      <p>I'm watching. Add a few selections and I'll start sharing thoughts.</p>
    </div>
  );
}

function PartnerThinkingState() {
  return (
    <div className="space-y-2 text-sm text-muted-foreground" style={{ fontFamily: "var(--font-mono)" }}>
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-primary/50 ai-partner-dot ai-partner-dot-1" />
        <span className="h-2 w-2 rounded-full bg-primary/50 ai-partner-dot ai-partner-dot-2" />
        <span className="h-2 w-2 rounded-full bg-primary/50 ai-partner-dot ai-partner-dot-3" />
        <span className="text-[10px] ml-1 uppercase tracking-[0.2em]">Reading the board</span>
      </div>
    </div>
  );
}

function severityClasses(severity: Severity): string {
  switch (severity) {
    case "flag": return "border-amber-300 bg-amber-50/60";
    case "nudge": return "border-blue-200 bg-blue-50/40";
    case "info":
    default: return "border-border bg-background";
  }
}

function TypeIcon({ type, severity }: { type: SuggestionType; severity: Severity }) {
  const colorClass =
    severity === "flag" ? "text-amber-600" :
    severity === "nudge" ? "text-blue-600" : "text-muted-foreground";
  switch (type) {
    case "gap": return <Circle className={`h-4 w-4 ${colorClass}`} />;
    case "conflict": return <AlertTriangle className={`h-4 w-4 ${colorClass}`} />;
    case "pairing": return <Link2 className={`h-4 w-4 ${colorClass}`} />;
    case "opportunity":
    default: return <Sparkles className={`h-4 w-4 ${colorClass}`} />;
  }
}

interface SuggestionCardProps {
  sug: StoredSuggestion;
  onDismiss: () => void;
  onHighlight: () => void;
  onTellMore: () => void;
}

function SuggestionCard({ sug, onDismiss, onHighlight, onTellMore }: SuggestionCardProps) {
  const hasRefs = !!(sug.referencedElementIds && sug.referencedElementIds.length);
  return (
    <div
      className={`rounded-lg border ${severityClasses(sug.severity)} p-3 transition-colors`}
      data-testid={`ai-partner-suggestion-${sug.id}`}
    >
      {sug.source === "prompt" && sug.prompt && (
        <div
          className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-1.5"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          You asked · {sug.prompt}
        </div>
      )}
      <button
        onClick={hasRefs ? onHighlight : undefined}
        className={`flex items-start gap-2.5 text-left w-full ${hasRefs ? "cursor-pointer" : ""}`}
        data-testid={`ai-partner-card-body-${sug.id}`}
      >
        <span className="mt-0.5 shrink-0"><TypeIcon type={sug.type} severity={sug.severity} /></span>
        <div className="flex-1 min-w-0">
          {sug.room && (
            <div
              className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-1"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {sug.room}
            </div>
          )}
          <p className="text-[14px] leading-snug text-foreground" style={{ fontFamily: "var(--font-serif)" }}>
            {sug.text}
          </p>
        </div>
      </button>

      {sug.expanded && (
        <div
          className="mt-2.5 text-[13px] leading-relaxed text-foreground/90 border-t border-border/60 pt-2.5"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          {sug.expanded}
        </div>
      )}

      <div className="flex items-center justify-end gap-1 mt-2">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-[11px] uppercase tracking-[0.15em]"
          style={{ fontFamily: "var(--font-mono)" }}
          onClick={onTellMore}
          disabled={sug.expanding}
          data-testid={`ai-partner-tell-more-${sug.id}`}
        >
          {sug.expanding ? <Loader2 className="h-3 w-3 animate-spin" /> : "Tell me more"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-[11px] uppercase tracking-[0.15em] text-muted-foreground"
          style={{ fontFamily: "var(--font-mono)" }}
          onClick={onDismiss}
          data-testid={`ai-partner-dismiss-${sug.id}`}
        >
          Got it
        </Button>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Critique tab — preserves the one-shot critique flow as a sub-tab.
// ────────────────────────────────────────────────────────────────────────

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
        const text = await res.text();
        throw new Error(text || "Critique failed");
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
          {generatedAt ? `Generated ${new Date(generatedAt).toLocaleTimeString()}` : "On-demand critique"}
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
          <TooltipContent side="bottom" className="text-xs">Re-run critique</TooltipContent>
        </Tooltip>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-3">
        {!critique && !loading && (
          <div className="py-8 text-center">
            <Button onClick={generate} className="gap-2" data-testid="ai-partner-critique-run">
              <Sparkles className="h-4 w-4" /> Run critique
            </Button>
            <p
              className="mt-3 text-xs text-muted-foreground"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              A senior-designer take on the whole board.
            </p>
          </div>
        )}
        {loading && <PartnerThinkingState />}
        {critique && !loading && (
          <CritiqueContent markdown={critique} />
        )}
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

// ────────────────────────────────────────────────────────────────────────
// Element highlight: 1.5s ring pulse on the canvas via data-board-element-id.
// ────────────────────────────────────────────────────────────────────────

function highlightElements(ids: number[]) {
  const nodes = ids
    .map((id) => document.querySelector<HTMLElement>(`[data-board-element-id="${id}"]`))
    .filter((n): n is HTMLElement => !!n);
  if (nodes.length === 0) return;

  // Scroll the first into view if needed.
  nodes[0].scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });

  for (const node of nodes) {
    node.classList.remove("ai-partner-highlight");
    void node.offsetWidth; // force restart
    node.classList.add("ai-partner-highlight");
    setTimeout(() => node.classList.remove("ai-partner-highlight"), 1600);
  }
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

@keyframes ai-partner-ring-pulse {
  0% { box-shadow: 0 0 0 0 rgba(47, 74, 58, 0.55); }
  70% { box-shadow: 0 0 0 12px rgba(47, 74, 58, 0); }
  100% { box-shadow: 0 0 0 0 rgba(47, 74, 58, 0); }
}
.ai-partner-highlight {
  animation: ai-partner-ring-pulse 1.5s ease-out;
  outline: 2px solid rgba(47, 74, 58, 0.7);
  outline-offset: 2px;
  border-radius: 6px;
}
`;
