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
import { LogOut, UserCog } from "lucide-react";
import { Link } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export function Navbar() {
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();

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
