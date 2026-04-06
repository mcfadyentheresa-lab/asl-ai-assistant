import { Button } from "@/components/ui/button";
import { LogIn } from "lucide-react";

export default function SignIn() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6" data-testid="page-sign-in">
      <div className="w-full max-w-sm text-center space-y-8">
        <div className="space-y-2">
          <h1 className="font-serif text-3xl md:text-4xl font-bold tracking-tight text-foreground" data-testid="text-brand">
            Aster &amp; Spruce
          </h1>
          <p className="text-sm text-muted-foreground uppercase tracking-widest" data-testid="text-tagline">
            Connect
          </p>
        </div>

        <p className="text-muted-foreground text-sm leading-relaxed" data-testid="text-welcome">
          Welcome to your project portal. Sign in to view your projects, timelines, and collaboration tools.
        </p>

        <Button
          size="lg"
          className="w-full"
          onClick={() => { window.location.href = "/api/login"; }}
          data-testid="button-sign-in"
        >
          <LogIn className="mr-2 h-4 w-4" />
          Sign In
        </Button>
      </div>

      <p className="absolute bottom-6 text-xs text-muted-foreground/60" data-testid="text-footer">
        &copy; {new Date().getFullYear()} Aster &amp; Spruce Living
      </p>
    </div>
  );
}
