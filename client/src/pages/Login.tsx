import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

export default function Login() {
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const params = new URLSearchParams(window.location.search);
  const returnTo = params.get("returnTo") || "/";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Login failed");
      }
      // Hard nav so server-rendered cookies / state are picked up.
      window.location.href = returnTo;
    } catch (err: any) {
      setError(err.message || "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <Card className="max-w-md w-full">
        <CardContent className="pt-8 pb-8 space-y-6">
          <div className="text-center space-y-2">
            <h1 className="font-serif text-3xl font-semibold text-primary">Aster &amp; Spruce</h1>
            <p className="text-muted-foreground text-sm">Sign in to your workspace</p>
          </div>
          <form onSubmit={onSubmit} className="space-y-4" data-testid="form-login">
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="login-email">Email</label>
              <Input
                id="login-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                data-testid="input-email"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="login-password">Password</label>
              <Input
                id="login-password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                data-testid="input-password"
              />
            </div>
            {error && <p className="text-sm text-destructive" data-testid="text-error">{error}</p>}
            <Button type="submit" className="w-full" disabled={submitting} data-testid="button-submit">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
            </Button>
          </form>
          <div className="text-center text-sm">
            <button
              type="button"
              className="text-primary hover:underline"
              onClick={() => navigate("/forgot-password")}
              data-testid="link-forgot"
            >
              Forgot your password?
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
