import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, CheckCircle2 } from "lucide-react";

export default function ResetPassword() {
  const { token } = useParams<{ token: string }>();
  const [, navigate] = useLocation();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) return setError("Passwords don't match");
    if (password.length < 8) return setError("Password must be at least 8 characters");
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Reset failed");
      setDone(true);
      setTimeout(() => navigate("/login"), 1800);
    } catch (err: any) {
      setError(err.message || "Reset failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <Card className="max-w-md w-full">
        <CardContent className="pt-8 pb-8 space-y-6">
          <h1 className="font-serif text-2xl font-bold text-primary text-center">Set a new password</h1>
          {done ? (
            <div className="text-center space-y-3">
              <CheckCircle2 className="h-10 w-10 text-primary mx-auto" />
              <p className="text-sm">Password updated. Redirecting to sign in…</p>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <Input
                type="password"
                autoComplete="new-password"
                placeholder="New password (min 8 characters)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                data-testid="input-password"
              />
              <Input
                type="password"
                autoComplete="new-password"
                placeholder="Confirm password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                data-testid="input-confirm"
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={submitting} data-testid="button-submit">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update password"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
