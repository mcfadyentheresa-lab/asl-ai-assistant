import { cn } from "@/lib/utils";

interface PropertyPhotoBandProps {
  src?: string | null;
  projectName: string;
  city?: string | null;
  className?: string;
}

/**
 * Full-width photo band shown at the top of the client home page.
 * The image is slightly desaturated so any uploaded property photo
 * (exterior, interior, in-progress) reads as architectural reference
 * rather than glamour. ~240px tall on desktop, ~180px on mobile.
 */
export function PropertyPhotoBand({ src, projectName, city, className }: PropertyPhotoBandProps) {
  const credit = [projectName, city].filter(Boolean).join(" · ").toUpperCase();

  return (
    <div
      className={cn(
        "relative w-full h-[180px] md:h-[240px] lg:h-[280px] overflow-hidden bg-muted",
        className
      )}
      data-testid="client-property-photo-band"
    >
      {src ? (
        <img
          src={src}
          alt={projectName}
          className="h-full w-full object-cover"
          style={{ filter: "saturate(0.85) contrast(0.96)" }}
          loading="eager"
          data-testid="img-property-photo"
        />
      ) : (
        <div className="h-full w-full bg-gradient-to-br from-muted to-muted/40" />
      )}

      {credit && (
        <div className="absolute bottom-3 right-3 md:bottom-4 md:right-4">
          <span
            className="font-mono text-[10px] md:text-[11px] tracking-[0.12em] text-white/95 bg-black/35 backdrop-blur-sm px-2.5 py-1 rounded-sm"
            data-testid="text-property-credit"
          >
            {credit}
          </span>
        </div>
      )}
    </div>
  );
}
