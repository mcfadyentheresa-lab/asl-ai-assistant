import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
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
import { LogOut, UserCog, Eye, EyeOff, User, Palette, ZoomIn, Clock, DollarSign, Calculator, Users, BookUser, Store, CalendarDays } from "lucide-react";
import { useTextZoom } from "@/hooks/use-text-zoom";
import { Link } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useOnlineUsers, useVisibilityToggle } from "@/hooks/use-presence";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDistanceToNow } from "date-fns";

export function Navbar() {
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const { data: onlineUsers } = useOnlineUsers();
  const { visible, toggleVisibility } = useVisibilityToggle();
  const { zoom, cycleZoom } = useTextZoom();

  const switchRole = useMutation({
    mutationFn: async (role: string) => {
      const res = await fetch("/api/auth/role", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to switch role");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
    },
  });

  if (!user) return null;

  const initials =
    `${(user.firstName || "")[0] || ""}${(user.lastName || "")[0] || ""}`.toUpperCase() || "U";
  const roleLabel =
    user.role === "admin" ? "Admin" : user.role === "crew" ? "Crew" : "Client";
  const showLastLogin = user.role === "admin" && user.lastLoginAt;

  return (
    <nav
      className="sticky top-0 z-50 flex items-center justify-between gap-4 px-6 md:px-10 h-16 mobile-landscape:h-10 shrink-0 border-b border-border/60 bg-background/80 backdrop-blur-md"
      data-testid="navbar"
    >
      <Link href="/" data-testid="link-home">
        <span className="font-serif text-xl mobile-landscape:text-base font-bold tracking-tight text-foreground">
          Aster & Spruce
        </span>
      </Link>

      <div className="flex items-center gap-3">
        <div className="hidden md:flex items-center gap-2 rounded-full border border-border/60 bg-background/80 px-3 py-1.5">
          <span className="text-xs font-medium text-muted-foreground">Crew / Admin temp view</span>
          <Switch
            checked={visible}
            onCheckedChange={(checked) => toggleVisibility()}
            data-testid="switch-temp-view"
          />
        </div>
        {(user.role === "admin" || user.role === "crew") && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" data-testid="button-role-switch">
                <UserCog className="mr-2 h-4 w-4" />
                {roleLabel}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                Switch View
              </DropdownMenuLabel>
              {["client", "crew", "admin"].map((role) => (
                <DropdownMenuItem
                  key={role}
                  onClick={() => switchRole.mutate(role)}
                  data-testid={`button-role-${role}`}
                  className={user.role === role ? "font-semibold" : ""}
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
              {showLastLogin && (
                <p className="text-muted-foreground text-[11px] mt-1" data-testid="text-last-login">
                  Last logged in {formatDistanceToNow(new Date(user.lastLoginAt), { addSuffix: true })}
                </p>
              )}
            </div>
            <DropdownMenuSeparator />
            <Link href="/profile">
              <DropdownMenuItem data-testid="link-profile">
                <User className="mr-2 h-4 w-4" />
                Your Profile
              </DropdownMenuItem>
            </Link>
            <Link href="/colors">
              <DropdownMenuItem data-testid="link-colors">
                <Palette className="mr-2 h-4 w-4" />
                Colour Portfolio
              </DropdownMenuItem>
            </Link>
            {(user.role === "crew" || user.role === "admin") && (
              <Link href="/master-calendar">
                <DropdownMenuItem data-testid="link-master-calendar">
                  <CalendarDays className="mr-2 h-4 w-4" />
                  Master Calendar
                </DropdownMenuItem>
              </Link>
            )}
            {(user.role === "crew" || user.role === "admin") && (
              <Link href="/timesheets">
                <DropdownMenuItem data-testid="link-timesheets">
                  <Clock className="mr-2 h-4 w-4" />
                  Timesheets
                </DropdownMenuItem>
              </Link>
            )}
            {user.role === "admin" && (
              <Link href="/payroll">
                <DropdownMenuItem data-testid="link-payroll">
                  <DollarSign className="mr-2 h-4 w-4" />
                  Payroll
                </DropdownMenuItem>
              </Link>
            )}
            {user.role === "admin" && (
              <Link href="/market-rates">
                <DropdownMenuItem data-testid="link-market-rates">
                  <Calculator className="mr-2 h-4 w-4" />
                  Market Rates
                </DropdownMenuItem>
              </Link>
            )}
            {user.role === "admin" && (
              <Link href="/labor-rates">
                <DropdownMenuItem data-testid="link-labor-rates">
                  <Users className="mr-2 h-4 w-4" />
                  Labor & Contractors
                </DropdownMenuItem>
              </Link>
            )}
            {(user.role === "admin" || user.role === "crew") && (
              <Link href="/trade-contacts">
                <DropdownMenuItem data-testid="link-trade-contacts">
                  <BookUser className="mr-2 h-4 w-4" />
                  Trade Contacts
                </DropdownMenuItem>
              </Link>
            )}
            {user.role === "admin" && (
              <Link href="/supplier-prices">
                <DropdownMenuItem data-testid="link-supplier-prices">
                  <Store className="mr-2 h-4 w-4" />
                  Supplier Prices
                </DropdownMenuItem>
              </Link>
            )}
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
  );
}
