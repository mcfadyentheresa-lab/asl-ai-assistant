import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import {
  LayoutDashboard,
  Clock,
  CalendarDays,
  User,
} from "lucide-react";

interface BottomNavItem {
  label: string;
  path: string;
  icon: React.ElementType;
}

const CREW_ITEMS: BottomNavItem[] = [
  { label: "Dashboard", path: "/", icon: LayoutDashboard },
  { label: "Log Hours", path: "/timesheets", icon: Clock },
  { label: "Calendar", path: "/master-calendar", icon: CalendarDays },
];

const CLIENT_ITEMS: BottomNavItem[] = [
  { label: "Dashboard", path: "/", icon: LayoutDashboard },
  { label: "Profile", path: "/profile", icon: User },
];

export function MobileBottomNav() {
  const [location] = useLocation();
  const { user } = useAuth();

  if (!user) return null;
  if (user.role === "admin") return null;

  const items = user.role === "client" ? CLIENT_ITEMS : CREW_ITEMS;

  const isActive = (path: string) => {
    if (path === "/") return location === "/";
    return location.startsWith(path);
  };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 flex md:hidden bg-background border-t border-border/60"
      data-testid="mobile-bottom-nav"
    >
      {items.map((item) => {
        const active = isActive(item.path);
        const Icon = item.icon;
        return (
          <Link
            key={item.path}
            href={item.path}
            className="flex-1"
            data-testid={`mobile-nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
          >
            <div
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 py-2 transition-colors",
                active
                  ? "text-primary"
                  : "text-muted-foreground"
              )}
            >
              <Icon
                className={cn(
                  "h-5 w-5 shrink-0",
                  active && "stroke-[2.2px]"
                )}
              />
              <span
                className={cn(
                  "text-[10px] font-medium leading-none",
                  active && "font-semibold"
                )}
              >
                {item.label}
              </span>
            </div>
          </Link>
        );
      })}
    </nav>
  );
}
