/**
 * PresentationMode — full-bleed editorial layout that reflows the board's elements
 * into a magazine-style spread. Working board is the workshop; this is the publication.
 *
 * Sections (in order, skipped if empty):
 *   1. Title slide (full-viewport, hero image background)
 *   2. Palette band (color_swatch elements)
 *   3. Inspiration grid (image elements)
 *   4. Selections (hardware + material + product, grouped by category)
 *   5. Notes (note + plain_text as pull quotes)
 *   6. Footer
 *
 * Read-only — does not touch canvas state.
 */
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { X, Download, Link2, Check } from "lucide-react";
import type { CanvasElement } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

interface PresentationModeProps {
  open: boolean;
  onClose: () => void;
  projectId: number;
  boardId: number;
  boardName?: string;
  elements: CanvasElement[];
  watermarkOnly?: boolean;
}

interface ProjectInfo {
  id: number;
  name: string;
  address?: string | null;
  thumbnailUrl?: string | null;
  heroFocalX?: number | null;
  heroFocalY?: number | null;
  heroZoom?: number | null;
}

const EDITORIAL_FILTER = "saturate(0.85) contrast(0.96)";

function formatToday(): string {
  const d = new Date();
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function useProject(projectId: number): ProjectInfo | null {
  const [project, setProject] = useState<ProjectInfo | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/projects/${projectId}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (!cancelled && data) setProject(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [projectId]);
  return project;
}

function useFadeUpOnView() {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) { setShown(true); return; }
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) { setShown(true); obs.disconnect(); }
        });
      },
      { threshold: 0.1 }
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return { ref, shown };
}

function FadeUpSection({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const { ref, shown } = useFadeUpOnView();
  return (
    <section
      ref={ref as any}
      className={`${className} transition-all duration-700 ease-out ${shown ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
    >
      {children}
    </section>
  );
}

export default function PresentationMode({
  open,
  onClose,
  projectId,
  boardId,
  boardName,
  elements,
  watermarkOnly = false,
}: PresentationModeProps) {
  const { toast } = useToast();
  const project = useProject(projectId);
  const [titleEntered, setTitleEntered] = useState(false);
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);

  const grouped = useMemo(() => {
    const colorSwatches = elements.filter((e) =>
      e.type === "color_swatch" || (e.type === "surface" && (e.content as any)?.kind === "paint")
    );
    const allImages = elements.filter((e) => e.type === "image");
    // Curated inspiration grid: only images explicitly flagged inspiration=true.
    // If no images are flagged on a board (existing decks pre-facet), fall back to the
    // full set so the deck never renders empty unintentionally.
    const flaggedImages = allImages.filter((e) => (e.content as any)?.inspiration === true);
    const images = flaggedImages.length > 0 ? flaggedImages : allImages;
    const isImageDeckCurated = flaggedImages.length > 0;
    const totalBoardImages = allImages.length;
    const deckImageCount = images.length;

    const hardware = elements.filter((e) => e.type === "hardware");
    const material = elements.filter((e) =>
      e.type === "material" || (e.type === "surface" && (e.content as any)?.kind === "material")
    );
    const product = elements.filter((e) => e.type === "product");
    const notes = elements.filter((e) =>
      e.type === "note" || e.type === "plain_text" ||
      // Treat any "text" element as a note unless it has been explicitly
      // marked as a callout/heading variant. Older elements were saved
      // without a variant field at all, so we must include them by default
      // — otherwise long-form notes silently disappear from Present mode.
      (e.type === "text" && (e.content as any)?.variant !== "callout" && (e.content as any)?.variant !== "heading")
    );
    const sectionHeaders = elements.filter((e) =>
      e.type === "section_header" || (e.type === "text" && (e.content as any)?.variant === "heading")
    );

    return {
      colorSwatches,
      images,
      hardware,
      material,
      product,
      notes,
      sectionHeaders,
      isImageDeckCurated,
      totalBoardImages,
      deckImageCount,
    };
  }, [elements]);

  // Lock body scroll while presentation is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Esc to close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Title slide ken-burns trigger.
  useEffect(() => {
    if (!open) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) { setTitleEntered(true); return; }
    const t = setTimeout(() => setTitleEntered(true), 30);
    return () => clearTimeout(t);
  }, [open]);

  const handleDownload = useCallback(() => {
    window.print();
  }, []);

  const handleCopyShareLink = useCallback(async () => {
    if (copying) return;
    setCopying(true);
    try {
      const res = await fetch(`/api/board/presentation-link`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boardId }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json() as { url: string; token: string };
      const fullUrl = window.location.origin + data.url;
      try { await navigator.clipboard.writeText(fullUrl); } catch {}
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
      toast({ title: "Share link copied", description: fullUrl });
    } catch (err: any) {
      toast({ title: "Could not create share link", description: err?.message || "Try again", variant: "destructive" });
    } finally {
      setCopying(false);
    }
  }, [boardId, copying, toast]);

  if (!open) return null;

  const projectName = project?.name || boardName || "Untitled project";
  const projectAddress = project?.address || "";
  const heroImage = project?.thumbnailUrl
    || (grouped.images[0]?.content as any)?.url
    || (grouped.images[0]?.content as any)?.imageUrl
    || null;

  // Group hardware/material/product by category for the selections section.
  const selections = [...grouped.hardware, ...grouped.material, ...grouped.product];
  const selectionsByCategory = selections.reduce<Record<string, CanvasElement[]>>((acc, el) => {
    const c: any = el.content || {};
    const cat = String(c.category || c.kind || el.type || "other").toLowerCase();
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(el);
    return acc;
  }, {});

  return (
    <div
      className="fixed inset-0 z-[120] bg-background presentation-root overflow-y-auto"
      data-testid="presentation-mode"
    >
      <style dangerouslySetInnerHTML={{ __html: PRESENTATION_STYLES }} />

      {/* Top-right action cluster (hidden in print) */}
      <div className="fixed top-4 right-4 z-[130] flex items-center gap-2 presentation-chrome">
        {!watermarkOnly && (
          <>
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-2 bg-background/80 backdrop-blur"
              onClick={handleCopyShareLink}
              disabled={copying}
              data-testid="presentation-share-link"
            >
              {copied ? <Check className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
              <span className="text-xs">{copied ? "Copied" : "Copy share link"}</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-2 bg-background/80 backdrop-blur"
              onClick={handleDownload}
              data-testid="presentation-download-pdf"
            >
              <Download className="h-4 w-4" />
              <span className="text-xs">Download PDF</span>
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 bg-background/80 backdrop-blur"
              onClick={onClose}
              data-testid="presentation-close"
              aria-label="Close presentation"
            >
              <X className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>

      {/* TITLE SLIDE */}
      <section
        className="presentation-page presentation-title relative w-full min-h-screen flex items-end overflow-hidden"
        data-testid="presentation-title-slide"
      >
        {heroImage ? (
          <div
            className={`absolute inset-0 transition-all duration-[800ms] ease-out ${titleEntered ? "opacity-100" : "opacity-0"}`}
            style={{
              backgroundImage: `url(${heroImage})`,
              backgroundSize: "cover",
              backgroundPosition: `${(((project?.heroFocalX ?? 0.5) as number) * 100).toFixed(2)}% ${(((project?.heroFocalY ?? 0.5) as number) * 100).toFixed(2)}%`,
              backgroundRepeat: "no-repeat",
              transform: `scale(${(((project?.heroZoom ?? 1) as number) * (titleEntered ? 1 : 1.05)).toFixed(3)})`,
              transformOrigin: `${(((project?.heroFocalX ?? 0.5) as number) * 100).toFixed(2)}% ${(((project?.heroFocalY ?? 0.5) as number) * 100).toFixed(2)}%`,
              filter: EDITORIAL_FILTER,
            }}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-muted" />
        )}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: "linear-gradient(to top, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.18) 45%, rgba(0,0,0,0) 75%)",
          }}
        />
        <div className="relative z-10 w-full px-8 md:px-16 lg:px-24 pb-20 md:pb-28">
          <div className="text-white/85 text-[11px] uppercase mb-4" style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.25em" }}>
            Presentation · {boardName || "Working board"}
          </div>
          <h1
            className="text-5xl md:text-6xl lg:text-7xl font-bold text-white leading-[1.02] mb-6 max-w-5xl"
            style={{ fontFamily: "var(--font-serif)", letterSpacing: "-0.035em" }}
            data-testid="presentation-project-name"
          >
            {projectName}
          </h1>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-white/85" style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.1em" }}>
            {projectAddress && (
              <span className="text-xs uppercase">{projectAddress}</span>
            )}
            <span className="text-xs uppercase">{formatToday()}</span>
          </div>
        </div>
      </section>

      {/* PALETTE */}
      {grouped.colorSwatches.length > 0 && (
        <FadeUpSection className="presentation-page presentation-section presentation-palette w-full px-8 md:px-16 lg:px-24 py-24 md:py-32 border-t border-border">
          <SectionHeader eyebrow="Palette" title="The colors" />
          <div className="flex flex-wrap gap-4 md:gap-6 mt-12">
            {grouped.colorSwatches.map((sw) => {
              const c: any = sw.content || {};
              const hex = (c.hex || c.color || "#1E3A2F").toUpperCase();
              return (
                <div
                  key={sw.id}
                  className="flex flex-col"
                  style={{ width: 180, minHeight: 280 }}
                  data-testid={`presentation-swatch-${sw.id}`}
                >
                  <div
                    className="w-full h-[200px] relative"
                    style={{ backgroundColor: hex }}
                  >
                    {typeof c.lrv === "number" && (
                      <span
                        className="absolute top-2 right-2 text-[10px] px-1.5 py-0.5 rounded-sm bg-black/35 text-white"
                        style={{ fontFamily: "var(--font-mono)" }}
                      >
                        LRV {c.lrv}
                      </span>
                    )}
                    <span
                      className="absolute bottom-2 left-3 text-[10px] text-white/85"
                      style={{ fontFamily: "var(--font-mono)" }}
                    >
                      {hex}
                    </span>
                  </div>
                  <div className="mt-3">
                    <div className="text-base font-semibold text-foreground" style={{ fontFamily: "var(--font-serif)", letterSpacing: "-0.015em" }}>
                      {c.name || "Untitled"}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5" style={{ fontFamily: "var(--font-mono)" }}>
                      {[c.brand, c.code].filter(Boolean).join(" · ") || ""}
                    </div>
                    {c.sheen && (
                      <div className="text-[10px] uppercase text-muted-foreground/80 mt-1" style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.15em" }}>
                        {c.sheen}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </FadeUpSection>
      )}

      {/* INSPIRATION GRID */}
      {grouped.images.length > 0 && (
        <FadeUpSection className="presentation-page presentation-section w-full px-8 md:px-16 lg:px-24 py-24 md:py-32 border-t border-border">
          <SectionHeader eyebrow="Inspiration" title="Reference & mood" />
          {/* Deck builder hint — only for admin/crew view, never on client shares.
              Suppressed in print so the printed deck stays clean. */}
          {!watermarkOnly && grouped.totalBoardImages > 0 && (
            <div
              className="mt-4 text-[10px] uppercase tracking-[0.18em] text-muted-foreground/80 print:hidden"
              style={{ fontFamily: "var(--font-mono)" }}
              data-testid="presentation-deck-hint"
            >
              {grouped.isImageDeckCurated
                ? `Showing ${grouped.deckImageCount} of ${grouped.totalBoardImages} board images — flag more on the board to add them to the deck.`
                : `No images flagged yet — showing all ${grouped.totalBoardImages}. Flag favorites on the board to curate the deck.`}
            </div>
          )}
          <div className="presentation-image-grid mt-12">
            {grouped.images.map((img, idx) => {
              const c: any = img.content || {};
              const url = c.url || c.imageUrl || "";
              const caption = c.caption || "";
              const isHero = idx % 5 === 0;
              return (
                <figure
                  key={img.id}
                  className={`presentation-image-cell ${isHero ? "presentation-image-cell--hero" : ""}`}
                  data-testid={`presentation-image-${img.id}`}
                >
                  {url ? (
                    <img
                      src={url}
                      alt={caption || "Reference"}
                      className="w-full h-full object-cover"
                      style={{ filter: EDITORIAL_FILTER }}
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full bg-muted" />
                  )}
                  {caption && (
                    <figcaption
                      className="mt-2 text-[10px] uppercase text-muted-foreground"
                      style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.15em" }}
                    >
                      {caption}
                    </figcaption>
                  )}
                </figure>
              );
            })}
          </div>
        </FadeUpSection>
      )}

      {/* SELECTIONS */}
      {selections.length > 0 && (
        <FadeUpSection className="presentation-page presentation-section w-full px-8 md:px-16 lg:px-24 py-24 md:py-32 border-t border-border">
          <SectionHeader eyebrow="Selections" title="Hardware, materials & products" />
          <div className="mt-12 space-y-12">
            {Object.entries(selectionsByCategory).map(([category, items]) => (
              <div key={category}>
                <div className="text-[10px] uppercase text-muted-foreground mb-4 pb-2 border-b border-border" style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.2em" }}>
                  {category}
                </div>
                <div className="space-y-5">
                  {items.map((el) => {
                    const c: any = el.content || {};
                    const thumb = c.imageUrl || c.thumbnailUrl || c.url || "";
                    const name = c.name || "Untitled";
                    const meta = [c.brand, c.finish, c.supplier, c.sku || c.code].filter(Boolean).join(" · ");
                    const price = typeof c.price === "number" ? c.price.toLocaleString("en-US", { style: "currency", currency: c.currency || "USD" }) : c.priceLabel || "";
                    return (
                      <div
                        key={el.id}
                        className="flex items-start gap-5 py-4 border-b border-border/40"
                        data-testid={`presentation-selection-${el.id}`}
                      >
                        <div className="w-[100px] h-[100px] shrink-0 bg-muted overflow-hidden">
                          {thumb ? (
                            <img src={thumb} alt={name} className="w-full h-full object-cover" loading="lazy" />
                          ) : (
                            <div className="w-full h-full bg-muted" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] uppercase text-muted-foreground mb-1" style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.15em" }}>
                            {String(el.type).replace(/_/g, " ")}
                          </div>
                          <div className="text-lg font-semibold text-foreground leading-tight" style={{ fontFamily: "var(--font-serif)", letterSpacing: "-0.015em" }}>
                            {name}
                          </div>
                          {meta && (
                            <div className="text-[11px] text-muted-foreground mt-1" style={{ fontFamily: "var(--font-mono)" }}>
                              {meta}
                            </div>
                          )}
                        </div>
                        {price && (
                          <div className="shrink-0 text-right text-sm text-foreground tabular-nums" style={{ fontFamily: "var(--font-mono)" }}>
                            {price}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </FadeUpSection>
      )}

      {/* NOTES */}
      {grouped.notes.length > 0 && (
        <FadeUpSection className="presentation-page presentation-section w-full px-8 md:px-16 lg:px-24 py-24 md:py-32 border-t border-border">
          <SectionHeader eyebrow="Notes" title="From the studio" />
          <div className="mt-12 space-y-12 max-w-4xl">
            {grouped.notes.map((n) => {
              const c: any = n.content || {};
              const text = (c.text || c.content || "").toString().trim();
              if (!text) return null;
              return (
                <blockquote
                  key={n.id}
                  className="text-2xl md:text-3xl text-foreground leading-[1.5]"
                  style={{ fontFamily: "var(--font-serif)", fontWeight: 500, letterSpacing: "-0.015em" }}
                  data-testid={`presentation-note-${n.id}`}
                >
                  <span aria-hidden className="text-primary/40 mr-2">&ldquo;</span>
                  {text}
                  <span aria-hidden className="text-primary/40 ml-1">&rdquo;</span>
                  <footer className="mt-4 text-[10px] uppercase text-muted-foreground" style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.2em", fontWeight: 400 }}>
                    — {projectName}
                  </footer>
                </blockquote>
              );
            })}
          </div>
        </FadeUpSection>
      )}

      {/* FOOTER */}
      <footer className="presentation-page w-full px-8 md:px-16 lg:px-24 py-16 border-t border-border bg-card/40">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <div>
            <div className="text-2xl font-bold text-foreground" style={{ fontFamily: "var(--font-serif)", letterSpacing: "-0.025em" }}>
              Aster &amp; Spruce
            </div>
            <div className="text-[11px] text-muted-foreground mt-1" style={{ fontFamily: "var(--font-mono)" }}>
              info@asterandspruceliving.ca
            </div>
          </div>
          <div className="text-[10px] uppercase text-muted-foreground" style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.2em" }}>
            Generated {formatToday()}
          </div>
        </div>
      </footer>

      {/* Watermark for shared/public view */}
      {watermarkOnly && (
        <div
          className="fixed bottom-4 right-4 z-[125] text-[10px] uppercase text-foreground/55 px-3 py-1.5 rounded-full bg-background/70 backdrop-blur border border-border/60"
          style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.2em" }}
        >
          Aster &amp; Spruce
        </div>
      )}
    </div>
  );
}

function SectionHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <div
        className="text-[10px] uppercase text-muted-foreground mb-3"
        style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.25em" }}
      >
        {eyebrow}
      </div>
      <h2
        className="text-5xl md:text-6xl text-foreground"
        style={{ fontFamily: "var(--font-serif)", fontWeight: 700, letterSpacing: "-0.035em", lineHeight: 1.05 }}
      >
        {title}
      </h2>
    </div>
  );
}

const PRESENTATION_STYLES = `
.presentation-image-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
}
@media (min-width: 768px) {
  .presentation-image-grid {
    grid-template-columns: repeat(2, 1fr);
    grid-auto-rows: 240px;
    gap: 20px;
  }
}
@media (min-width: 1024px) {
  .presentation-image-grid {
    grid-template-columns: repeat(3, 1fr);
    grid-auto-rows: 260px;
    gap: 24px;
  }
}
.presentation-image-cell {
  margin: 0;
  overflow: hidden;
  background: hsl(var(--muted));
  display: flex;
  flex-direction: column;
}
.presentation-image-cell img {
  display: block;
  flex: 1;
  min-height: 0;
}
@media (min-width: 768px) {
  .presentation-image-cell--hero {
    grid-row: span 2;
  }
}

@media print {
  @page { size: letter; margin: 0.5in; }
  html, body { background: white !important; }
  .presentation-chrome { display: none !important; }
  .presentation-root { position: static !important; overflow: visible !important; }
  .presentation-page {
    page-break-before: always;
    break-before: page;
    min-height: 0 !important;
  }
  .presentation-page:first-of-type {
    page-break-before: auto;
    break-before: auto;
  }
  .presentation-title {
    min-height: 9.5in !important;
  }
  .presentation-image-grid {
    grid-template-columns: repeat(2, 1fr) !important;
    grid-auto-rows: 2.6in !important;
  }
  * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
}
`;
