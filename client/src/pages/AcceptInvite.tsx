import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";

interface InviteInfo {
  valid: boolean;
  reason?: "not_found" | "consumed" | "expired";
  email?: string;
  firstName?: string;
  lastName?: string;
  role?: string;
}

export default function AcceptInvite() {
  const { token } = useParams<{ token: string }>();
  const [, navigate] = useLocation();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // We have two parallel invite systems: crew invites live here under
  // /api/auth/invite and client invites live under /api/invites. If a token
  // arrives at this page but actually belongs to the client system, we
  // transparently bounce the user to the client invite page instead of
  // showing "Invite unavailable".
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/auth/invite/${token}`);
        const data: InviteInfo = await r.json();
        if (cancelled) return;
        if (!data?.valid && data?.reason === "not_found") {
          // Cross-check the client invite system before giving up.
          try {
            const cli = await fetch(`/api/invites/${token}/validate`);
            if (cli.ok) {
              const cd = await cli.json();
              if (cd?.valid) {
                navigate(`/invite/${token}`);
                return;
              }
            }
          } catch (_err) { /* fall through */ }
        }
        setInfo(data);
        if (data.firstName) setFirstName(data.firstName);
        if (data.lastName) setLastName(data.lastName);
      } catch {
        if (!cancelled) setInfo({ valid: false, reason: "not_found" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token, navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) return setError("Passwords don't match");
    if (password.length < 8) return setError("Password must be at least 8 characters");
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/accept-invite", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, firstName, lastName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Failed to accept invite");
      setDone(true);
      setTimeout(() => (window.location.href = "/"), 1500);
    } catch (err: any) {
      setError(err.message || "Failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!info?.valid) {
    const msg =
      info?.reason === "expired"
        ? "This invite has expired. Ask your admin to send a fresh one."
        : info?.reason === "consumed"
          ? "This invite has already been used. Try signing in instead."
          : "This invite link is invalid.";
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <AlertTriangle className="h-12 w-12 text-destructive mx-auto" />
            <h2 className="font-serif text-2xl font-bold">Invite unavailable</h2>
            <p className="text-muted-foreground">{msg}</p>
            <Button onClick={() => navigate("/login")}>Go to sign in</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <Card className="max-w-md w-full">
        <CardContent className="pt-8 pb-8 space-y-6">
          <div className="text-center space-y-2">
            <h1 className="font-serif text-2xl font-bold text-primary">Welcome to Aster &amp; Spruce</h1>
            <p className="text-muted-foreground text-sm">
              Set up your {info.role === "admin" ? "admin" : info.role === "client" ? "client" : "crew"} account.
            </p>
          </div>
          {done ? (
            <div className="text-center space-y-3">
              <CheckCircle2 className="h-10 w-10 text-primary mx-auto" />
              <p className="text-sm">Account created. Signing you in…</p>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">Email</label>
                <Input value={info.email || ""} disabled />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium">First name</label>
                  <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Last name</label>
                  <Input value={lastName} onChange={(e) => setLastName(e.target.value)} required />
                </div>
              </div>
              <div className="space-y-1">
                <label htmlFor="accept-invite-password" className="text-sm font-medium">Password</label>
                <Input
                  id="accept-invite-password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="accept-invite-confirm" className="text-sm font-medium">Confirm password</label>
                <Input
                  id="accept-invite-confirm"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Re-enter your password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={submitting} data-testid="button-submit">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create account"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
