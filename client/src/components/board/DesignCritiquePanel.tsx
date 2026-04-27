/**
 * DesignCritiquePanel — slide-in panel that gives a senior-designer-voice take on
 * the current board state. Calls /api/ai/design-critique server-side.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { X, RefreshCw, Send, Loader2, Sparkles } from "lucide-react";
import type { CanvasElement } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

interface DesignCritiquePanelProps {
  open: boolean;
  onClose: () => void;
  projectId: number;
  boardId: number;
  elements: CanvasElement[];
  hasClient: boolean;
}

interface CritiqueResponse {
  critique: string;
  generatedAt: string;
}

export default function DesignCritiquePanel({
  open,
  onClose,
  projectId,
  boardId,
  elements,
  hasClient,
}: DesignCritiquePanelProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [critique, setCritique] = useState<string>("");
  const [generatedAt, setGeneratedAt] = useState<string>("");
  const [sending, setSending] = useState(false);

  // Collect element names — used to highlight name mentions in the critique.
  const elementNames = useMemo(() => {
    const names = new Set<string>();
    elements.forEach((el) => {
      const c: any = el.content || {};
      if (c.name && typeof c.name === "string" && c.name.trim().length >= 3) names.add(c.name.trim());
      if (c.title && typeof c.title === "string" && c.title.trim().length >= 3) names.add(c.title.trim());
    });
    return Array.from(names).sort((a, b) => b.length - a.length); // longest first
  }, [elements]);

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
      const data = (await res.json()) as CritiqueResponse;
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

  // Auto-generate on first open.
  useEffect(() => {
    if (open && !critique && !loading) {
      generate();
    }
  }, [open, critique, loading, generate]);

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

  if (!open) return null;

  return (
    <>
      {/* Backdrop (transparent, just for click-to-close on the rest of the screen) */}
      <div
        className="fixed inset-0 z-[110]"
        onClick={onClose}
        aria-hidden
        data-testid="critique-backdrop"
      />
      {/* Panel */}
      <aside
        className="fixed top-0 right-0 z-[115] h-full w-full sm:w-[480px] bg-card border-l border-border shadow-2xl flex flex-col critique-panel-enter"
        role="dialog"
        aria-label="Design critique"
        data-testid="critique-panel"
      >
        <style dangerouslySetInnerHTML={{ __html: PANEL_STYLES }} />

        <header className="px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2
                className="text-2xl text-foreground"
                style={{ fontFamily: "var(--font-serif)", fontWeight: 600, letterSpacing: "-0.025em" }}
              >
                Design critique
              </h2>
              <div
                className="text-[10px] uppercase text-muted-foreground mt-1 flex items-center gap-1.5"
                style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.2em" }}
              >
                <Sparkles className="h-3 w-3" />
                Powered by AI
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground p-1.5 rounded-full hover:bg-muted transition-colors"
              aria-label="Close critique"
              data-testid="critique-close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          {loading && !critique ? (
            <CritiqueTypingState />
          ) : critique ? (
            <CritiqueContent markdown={critique} elementNames={elementNames} />
          ) : (
            <div className="text-sm text-muted-foreground">No critique yet.</div>
          )}
          {generatedAt && !loading && (
            <div
              className="mt-8 text-[10px] uppercase text-muted-foreground/70"
              style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.2em" }}
            >
              Generated {new Date(generatedAt).toLocaleString()}
            </div>
          )}
        </div>

        <footer className="px-6 py-4 border-t border-border flex items-center gap-2 bg-card">
          <Button
            variant="outline"
            size="sm"
            onClick={generate}
            disabled={loading}
            className="gap-2"
            data-testid="critique-regenerate"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Regenerate
          </Button>
          <div className="flex-1" />
          {hasClient ? (
            <Button
              size="sm"
              onClick={handleSendToClient}
              disabled={!critique || sending}
              className="gap-2"
              data-testid="critique-send-to-client"
            >
              {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Send to client
            </Button>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button size="sm" disabled className="gap-2" data-testid="critique-send-to-client-disabled">
                    <Send className="h-3.5 w-3.5" />
                    Send to client
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                Invite a client first.
              </TooltipContent>
            </Tooltip>
          )}
        </footer>
      </aside>
    </>
  );
}

function CritiqueTypingState() {
  return (
    <div className="space-y-4 text-sm text-muted-foreground" style={{ fontFamily: "var(--font-serif)" }}>
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-primary/50 critique-dot critique-dot-1" />
        <span className="h-2 w-2 rounded-full bg-primary/50 critique-dot critique-dot-2" />
        <span className="h-2 w-2 rounded-full bg-primary/50 critique-dot critique-dot-3" />
        <span className="text-xs ml-2 uppercase tracking-[0.2em] text-muted-foreground/70" style={{ fontFamily: "var(--font-mono)" }}>
          Reading the board
        </span>
      </div>
      <div className="space-y-2 mt-6">
        <div className="h-3 rounded bg-muted animate-pulse" />
        <div className="h-3 rounded bg-muted animate-pulse w-11/12" />
        <div className="h-3 rounded bg-muted animate-pulse w-9/12" />
      </div>
      <div className="space-y-2 mt-4">
        <div className="h-3 rounded bg-muted animate-pulse w-10/12" />
        <div className="h-3 rounded bg-muted animate-pulse w-11/12" />
      </div>
    </div>
  );
}

/**
 * Lightweight markdown renderer — handles **bold** for section headings, paragraph splits,
 * and wraps element name mentions in a primary highlight. We avoid pulling in a markdown lib.
 */
function CritiqueContent({ markdown, elementNames }: { markdown: string; elementNames: string[] }) {
  const blocks = markdown.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return (
    <div className="space-y-5 text-foreground" style={{ fontFamily: "var(--font-serif)", lineHeight: 1.6 }}>
      {blocks.map((block, idx) => {
        // Heading: line that starts with ## or **...**
        if (/^#{2,}\s/.test(block)) {
          const text = block.replace(/^#{2,}\s+/, "");
          return (
            <h3
              key={idx}
              className="text-lg text-foreground mt-2"
              style={{ fontFamily: "var(--font-serif)", fontWeight: 600, letterSpacing: "-0.02em" }}
            >
              {renderInline(text, elementNames)}
            </h3>
          );
        }
        if (/^\*\*[^*]+\*\*\s*$/.test(block)) {
          const text = block.replace(/^\*\*([^*]+)\*\*\s*$/, "$1");
          return (
            <h3
              key={idx}
              className="text-lg text-foreground mt-2"
              style={{ fontFamily: "var(--font-serif)", fontWeight: 600, letterSpacing: "-0.02em" }}
            >
              {renderInline(text, elementNames)}
            </h3>
          );
        }
        return (
          <p key={idx} className="text-[15px]" style={{ fontWeight: 500 }}>
            {renderInline(block, elementNames)}
          </p>
        );
      })}
    </div>
  );
}

function renderInline(text: string, elementNames: string[]): React.ReactNode {
  // First handle inline **bold** segments and element name highlights.
  // Strategy: split on inline bold, then for each plain text segment also highlight names.
  const parts: React.ReactNode[] = [];
  const boldRegex = /\*\*([^*]+)\*\*/g;
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = boldRegex.exec(text)) !== null) {
    if (m.index > lastIdx) {
      parts.push(...highlightNames(text.slice(lastIdx, m.index), elementNames, `${key++}-pre`));
    }
    parts.push(
      <strong key={`b-${key++}`} style={{ fontWeight: 600 }} className="text-foreground">
        {highlightNames(m[1], elementNames, `b-${key++}`)}
      </strong>
    );
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < text.length) {
    parts.push(...highlightNames(text.slice(lastIdx), elementNames, `${key++}-tail`));
  }
  return parts;
}

function highlightNames(text: string, elementNames: string[], keyPrefix: string): React.ReactNode[] {
  if (!elementNames.length) return [text];
  // Build a regex that matches any element name as a whole-word-ish chunk.
  const escaped = elementNames
    .filter((n) => n.length >= 3)
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!escaped.length) return [text];
  const re = new RegExp(`(${escaped.join("|")})`, "gi");
  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(
      <span
        key={`${keyPrefix}-${i++}`}
        className="bg-primary/10 text-primary px-1 py-0.5 rounded"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        {m[0]}
      </span>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const PANEL_STYLES = `
@keyframes critique-panel-slide {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}
.critique-panel-enter {
  animation: critique-panel-slide 320ms cubic-bezier(0.22, 1, 0.36, 1);
}
@media (prefers-reduced-motion: reduce) {
  .critique-panel-enter { animation: none; }
}
@keyframes critique-bounce {
  0%, 80%, 100% { transform: scale(0.6); opacity: 0.6; }
  40% { transform: scale(1); opacity: 1; }
}
.critique-dot {
  animation: critique-bounce 1.2s infinite ease-in-out;
}
.critique-dot-1 { animation-delay: 0s; }
.critique-dot-2 { animation-delay: 0.15s; }
.critique-dot-3 { animation-delay: 0.3s; }
`;
