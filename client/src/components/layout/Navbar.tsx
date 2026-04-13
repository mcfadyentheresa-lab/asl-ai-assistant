import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { LogOut, UserCog, User, Palette, ZoomIn, Clock, DollarSign, Users, Store, CalendarDays, Sparkles, Sun, Moon, BookOpen } from "lucide-react";
import { useTextZoom } from "@/hooks/use-text-zoom";
import { Link } from "wouter";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useViewMode } from "@/hooks/use-view-mode";
import { useTheme } from "next-themes";
import { WalkthroughModal } from "@/components/WalkthroughModal";

export function Navbar() {
  const { user, logout } = useAuth();
  const { zoom, cycleZoom } = useTextZoom();
  const { viewMode, setViewMode } = useViewMode();
  const { theme, setTheme } = useTheme();
  const [tourOpen, setTourOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    const key = `asl_tour_seen_${user.id}`;
    if (!localStorage.getItem(key)) {
      setTourOpen(true);
    }
  }, [user?.id]);

  const handleTourClose = () => {
    if (user) {
      localStorage.setItem(`asl_tour_seen_${user.id}`, "1");
    }
    setTourOpen(false);
  };

  if (!user) return null;

  const isAdmin = user.role === "admin";
  const effectiveRole = isAdmin ? viewMode : user.role;

  const initials =
    `${(user.firstName || "")[0] || ""}${(user.lastName || "")[0] || ""}`.toUpperCase() || "U";

  return (
    <>
      <nav
        className="sticky top-0 z-50 flex items-center justify-between gap-4 px-6 md:px-10 h-16 mobile-landscape:h-10 shrink-0 border-b border-border/60 bg-background/80 backdrop-blur-md"
        data-testid="navbar"
      >
        <Link href="/" data-testid="link-home">
          <span className="font-serif text-xl mobile-landscape:text-base font-bold tracking-tight text-foreground">
            ASL
          </span>
        </Link>

        <div className="flex items-center gap-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                data-testid="button-theme-toggle"
              >
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            </TooltipContent>
          </Tooltip>
          {isAdmin && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" data-testid="button-role-switch">
                  <UserCog className="mr-2 h-4 w-4" />
                  {viewMode === "admin" ? "Admin" : viewMode === "crew" ? "Crew" : "Client"}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  Switch View
                </DropdownMenuLabel>
                {(["admin", "crew", "client"] as const).map((role) => (
                  <DropdownMenuItem
                    key={role}
                    onClick={() => setViewMode(role)}
                    data-testid={`button-role-${role}`}
                    className={viewMode === role ? "font-semibold" : ""}
                  >
                    {role === "admin" ? "Admin" : role === "crew" ? "Crew" : "Client"}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" data-testid="button-user-menu">
                <Avatar className="h-8 w-8">
                  <AvatarImage
                    src={user.profileImageUrl || undefined}
                    alt={user.firstName || "User"}
                  />
                  <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <div className="px-2 py-2 text-sm">
                <p className="font-medium text-foreground" data-testid="text-user-name">
                  {user.firstName} {user.lastName}
                </p>
                <p className="text-muted-foreground text-xs" data-testid="text-user-email">
                  {user.email}
                </p>
              </div>
              <DropdownMenuSeparator />
              <Link href="/profile">
                <DropdownMenuItem data-testid="link-profile">
                  <User className="mr-2 h-4 w-4" />
                  Your Profile
                </DropdownMenuItem>
              </Link>
              {effectiveRole === "admin" && (
                <Link href="/colors">
                  <DropdownMenuItem data-testid="link-colors">
                    <Palette className="mr-2 h-4 w-4" />
                    Colour Portfolio
                  </DropdownMenuItem>
                </Link>
              )}
              {(effectiveRole === "crew" || effectiveRole === "admin") && (
                <Link href="/master-calendar">
                  <DropdownMenuItem data-testid="link-master-calendar">
                    <CalendarDays className="mr-2 h-4 w-4" />
                    Master Calendar
                  </DropdownMenuItem>
                </Link>
              )}
              {(effectiveRole === "crew" || effectiveRole === "admin") && (
                <Link href="/timesheets">
                  <DropdownMenuItem data-testid="link-timesheets">
                    <Clock className="mr-2 h-4 w-4" />
                    Timesheets
                  </DropdownMenuItem>
                </Link>
              )}
              {effectiveRole === "admin" && (
                <Link href="/payroll">
                  <DropdownMenuItem data-testid="link-payroll">
                    <DollarSign className="mr-2 h-4 w-4" />
                    Payroll
                  </DropdownMenuItem>
                </Link>
              )}
              {effectiveRole === "admin" && (
                <Link href="/crew-and-trade">
                  <DropdownMenuItem data-testid="link-crew-and-trade">
                    <Users className="mr-2 h-4 w-4" />
                    Crew & Trade
                  </DropdownMenuItem>
                </Link>
              )}
              {effectiveRole === "admin" && (
                <Link href="/supplier-prices">
                  <DropdownMenuItem data-testid="link-supplier-prices">
                    <Store className="mr-2 h-4 w-4" />
                    Supplier Prices
                  </DropdownMenuItem>
                </Link>
              )}
              {effectiveRole === "admin" && (
                <Link href="/social-media">
                  <DropdownMenuItem data-testid="link-social-media">
                    <Sparkles className="mr-2 h-4 w-4" />
                    Social Media
                  </DropdownMenuItem>
                </Link>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setTourOpen(true)}
                data-testid="button-take-tour"
              >
                <BookOpen className="mr-2 h-4 w-4" />
                Take the Tour
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.preventDefault();
                  cycleZoom();
                }}
                data-testid="button-text-zoom"
              >
                <ZoomIn className="mr-2 h-4 w-4" />
                Text Size: {zoom}%
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => logout()} data-testid="button-logout">
                <LogOut className="mr-2" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </nav>

      <WalkthroughModal
        open={tourOpen}
        onClose={handleTourClose}
        role={user.role}
        firstName={user.firstName}
      />
    </>
  );
}
