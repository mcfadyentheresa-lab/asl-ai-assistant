import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, UserCog, User, Sun, Moon, Menu } from "lucide-react";
import { Link } from "wouter";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useViewMode } from "@/hooks/use-view-mode";
import { useTheme } from "next-themes";
import { WalkthroughModal } from "@/components/WalkthroughModal";
import { useAppShell } from "@/contexts/app-shell-context";

interface NavbarShellProps {
  onMenuToggle?: () => void;
}

export function NavbarShell({ onMenuToggle }: NavbarShellProps) {
  const { user, logout } = useAuth();
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

  const initials =
    `${(user.firstName || "")[0] || ""}${(user.lastName || "")[0] || ""}`.toUpperCase() || "U";

  return (
    <>
      <nav
        className="sticky top-0 z-50 flex items-center justify-between gap-4 px-4 md:px-6 h-14 shrink-0 border-b border-border/60 bg-background/95 backdrop-blur-md"
        data-testid="navbar"
      >
        <div className="flex items-center gap-3">
          {onMenuToggle && (
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={onMenuToggle}
              data-testid="button-mobile-menu"
              aria-label="Open navigation menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
          )}
          <Link href="/" data-testid="link-home" className="lg:hidden">
            <div className="flex flex-col">
              <span className="font-serif text-lg font-bold tracking-tight text-foreground leading-none select-none">
                Aster &amp; Spruce
              </span>
              <span className="text-[9px] font-semibold tracking-[0.18em] uppercase text-muted-foreground mt-0.5 select-none">
                Living
              </span>
            </div>
          </Link>
        </div>

        <div className="flex items-center gap-2">
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
                  <span className="hidden sm:inline">
                    {viewMode === "admin" ? "Admin" : viewMode === "crew" ? "Crew" : "Client"}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <p className="px-2 py-1.5 text-xs text-muted-foreground font-medium">Switch View</p>
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
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => logout()} data-testid="button-logout">
                <LogOut className="mr-2 h-4 w-4" />
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

export function Navbar() {
  const inShell = useAppShell();
  if (inShell) return null;
  return <NavbarShell />;
}
