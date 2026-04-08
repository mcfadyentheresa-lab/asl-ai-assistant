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
import { LogOut, UserCog, Eye, EyeOff, User, Palette, ZoomIn, Clock, DollarSign, Calculator, Users, BookUser, Store, CalendarDays, Sparkles, Armchair } from "lucide-react";
import { useTextZoom } from "@/hooks/use-text-zoom";
import { Link } from "wouter";
import { useOnlineUsers, useVisibilityToggle } from "@/hooks/use-presence";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useViewMode } from "@/hooks/use-view-mode";

export function Navbar() {
  const { user, logout } = useAuth();
  const { data: onlineUsers } = useOnlineUsers();
  const { visible, toggleVisibility } = useVisibilityToggle();
  const { zoom, cycleZoom } = useTextZoom();
  const { viewMode, setViewMode } = useViewMode();

  if (!user) return null;

  const initials =
    `${(user.firstName || "")[0] || ""}${(user.lastName || "")[0] || ""}`.toUpperCase() || "U";

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
        {onlineUsers && onlineUsers.length > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1.5" data-testid="indicator-online-users">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                </span>
                <span className="text-xs text-muted-foreground">{onlineUsers.length} online</span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs">
              <p className="text-xs font-medium mb-1">Currently online:</p>
              {onlineUsers.map((u) => (
                <p key={u.userId} className="text-xs">
                  {u.firstName || ""} {u.lastName || ""} <span className="text-muted-foreground">({u.role})</span>
                </p>
              ))}
            </TooltipContent>
          </Tooltip>
        )}
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
            {user.role === "admin" && (
              <Link href="/social-media">
                <DropdownMenuItem data-testid="link-social-media">
                  <Sparkles className="mr-2 h-4 w-4" />
                  Social Media
                </DropdownMenuItem>
              </Link>
            )}
            {user.role === "admin" && (
              <Link href="/table-redesign">
                <DropdownMenuItem data-testid="link-table-redesign">
                  <Armchair className="mr-2 h-4 w-4" />
                  Table Redesign
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
            <DropdownMenuItem onClick={toggleVisibility} data-testid="button-toggle-visibility">
              {visible ? <Eye className="mr-2 h-4 w-4" /> : <EyeOff className="mr-2 h-4 w-4" />}
              {visible ? "Appear Offline" : "Go Online"}
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
