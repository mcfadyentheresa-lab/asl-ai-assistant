import { Link } from "wouter";
import { ArrowUpRight } from "lucide-react";

interface ReferenceCard {
  label: string;
  caption: string;
  href: string;
  testId?: string;
}

interface ReferenceCardGridProps {
  cards: ReferenceCard[];
}

/**
 * The "Reference" section at the bottom of the client home page.
 * Three quiet cards linking to Design Board, Documents, Messages.
 */
export function ReferenceCardGrid({ cards }: ReferenceCardGridProps) {
  if (cards.length === 0) return null;

  return (
    <section
      className="px-4 md:px-8 lg:px-12 py-6 md:py-8"
      data-testid="client-references"
    >
      <h2 className="font-serif text-xl md:text-2xl font-semibold tracking-tight text-foreground mb-4 md:mb-5 max-w-4xl">
        Reference
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 max-w-4xl">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            data-testid={c.testId || `ref-card-${c.label.toLowerCase().replace(/\s+/g, "-")}`}
          >
            <div className="group rounded-sm border border-border/60 bg-card p-4 md:p-5 hover:border-foreground/40 transition-colors cursor-pointer h-full">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase mb-1">
                    {c.label}
                  </p>
                  <p className="text-sm md:text-[15px] text-foreground leading-snug">
                    {c.caption}
                  </p>
                </div>
                <ArrowUpRight
                  className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-foreground transition-colors mt-0.5"
                  aria-hidden
                />
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
