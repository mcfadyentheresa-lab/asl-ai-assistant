import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";

interface ClientTab {
  label: string;
  path: string;
}

const TABS: ClientTab[] = [
  { label: "The Plan", path: "/" },
  { label: "Updates", path: "/updates" },
  { label: "Design Board", path: "/design-board" },
];

/**
 * Flat underlined file-tab navigation for the client view.
 * Active tab gets a 2px underline aligned with the navbar bottom border.
 */
export function ClientTabsNav() {
  const [location] = useLocation();

  const isActive = (path: string) => {
    if (path === "/") return location === "/" || location.startsWith("/project/");
    return location.startsWith(path);
  };

  return (
    <nav
      className="hidden md:flex items-center gap-7 lg:gap-8 h-14"
      data-testid="client-tabs-nav"
      aria-label="Primary"
    >
      {TABS.map((t) => {
        const active = isActive(t.path);
        return (
          <Link
            key={t.path}
            href={t.path}
            data-testid={`client-tab-${t.label.toLowerCase().replace(/\s+/g, "-")}`}
          >
            <span
              className={cn(
                "relative inline-flex items-center h-14 text-[15px] tracking-tight transition-colors",
                active
                  ? "text-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground font-medium"
              )}
            >
              {t.label}
              {active && (
                <span
                  className="absolute left-0 right-0 -bottom-px h-[2px] bg-foreground"
                  aria-hidden
                />
              )}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
