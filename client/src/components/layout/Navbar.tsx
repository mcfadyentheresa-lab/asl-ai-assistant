import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { LogOut } from "lucide-react";
import { Link } from "wouter";

export function Navbar() {
  const { user, logout } = useAuth();

  if (!user) return null;

  const initials = `${(user.firstName || "")[0] || ""}${(user.lastName || "")[0] || ""}`.toUpperCase() || "U";
  const roleName = user.role === "crew" ? "Crew" : "Client";

  return (
    <nav
      className="sticky top-0 z-50 flex items-center justify-between gap-4 px-6 md:px-10 h-16 border-b border-border/60 bg-background/80 backdrop-blur-md"
      data-testid="navbar"
    >
      <Link href="/" data-testid="link-home">
        <span className="font-serif text-xl font-bold tracking-tight text-foreground">
          Aster & Spruce
        </span>
      </Link>

      <div className="flex items-center gap-3">
        <Badge variant="secondary" data-testid="badge-role">
          {roleName}
        </Badge>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" data-testid="button-user-menu">
              <Avatar className="h-8 w-8">
                <AvatarImage src={user.profileImageUrl || undefined} alt={user.firstName || "User"} />
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
            <DropdownMenuItem
              onClick={() => logout()}
              data-testid="button-logout"
            >
              <LogOut className="mr-2" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </nav>
  );
}
