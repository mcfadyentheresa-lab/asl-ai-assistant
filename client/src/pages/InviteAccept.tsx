import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, CheckCircle2, AlertTriangle, Clock } from "lucide-react";
import { motion } from "framer-motion";

interface InviteValidation {
  valid: boolean;
  expired: boolean;
  accepted: boolean;
  projectName: string;
  firstName: string;
  lastName: string;
  email: string;
}

export default function InviteAccept() {
  const { token } = useParams<{ token: string }>();
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const [acceptSuccess, setAcceptSuccess] = useState(false);

  const { data: invite, isLoading, error } = useQuery<InviteValidation>({
    queryKey: ["/api/invites", token, "validate"],
    queryFn: async () => {
      const res = await fetch(`/api/invites/${token}/validate`);
      if (!res.ok) throw new Error("Invite not found");
      return res.json();
    },
    enabled: !!token,
    retry: false,
  });

  const acceptMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/invites/${token}/accept`);
      return res.json();
    },
    onSuccess: (data) => {
      setAcceptSuccess(true);
      setTimeout(() => {
        navigate(`/welcome?project=${data.projectId}`);
      }, 1500);
    },
  });

  useEffect(() => {
    if (!authLoading && !user && invite?.valid) {
      const returnUrl = encodeURIComponent(`/invite/${token}`);
      window.location.href = `/api/login?returnTo=${returnUrl}`;
    }
  }, [authLoading, user, invite, token]);

  if (isLoading || authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !invite) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <AlertTriangle className="h-12 w-12 text-destructive mx-auto" />
            <h2 className="font-serif text-2xl font-bold" data-testid="text-invite-not-found">Invite Not Found</h2>
            <p className="text-muted-foreground">This invite link is invalid or has been removed. Please contact your project manager.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (invite.expired) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <Clock className="h-12 w-12 text-yellow-500 mx-auto" />
            <h2 className="font-serif text-2xl font-bold" data-testid="text-invite-expired">Invite Expired</h2>
            <p className="text-muted-foreground">This invite has expired. Please ask your project manager to send a new one.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (invite.accepted || acceptSuccess) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.4 }}>
          <Card className="max-w-md w-full">
            <CardContent className="pt-8 pb-8 text-center space-y-4">
              <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto" />
              <h2 className="font-serif text-2xl font-bold" data-testid="text-invite-accepted">Welcome Aboard!</h2>
              <p className="text-muted-foreground">
                {acceptSuccess ? "Setting up your portal..." : "This invite has already been accepted."}
              </p>
              {!acceptSuccess && (
                <Button onClick={() => navigate("/")} data-testid="button-go-dashboard">Go to Dashboard</Button>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <Card className="max-w-lg w-full">
          <CardContent className="pt-8 pb-8 space-y-6">
            <div className="text-center space-y-2">
              <span className="font-serif text-2xl font-bold text-primary tracking-tight">Aster & Spruce</span>
              <h1 className="font-serif text-3xl font-bold" data-testid="text-invite-welcome">
                Welcome, {invite.firstName}
              </h1>
              <p className="text-muted-foreground text-lg">
                You've been invited to your project portal for
              </p>
              <p className="font-semibold text-xl" data-testid="text-invite-project">{invite.projectName}</p>
            </div>

            <div className="border rounded-lg p-4 bg-muted/30 space-y-2">
              <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">What you'll get access to:</p>
              <ul className="text-sm space-y-1 text-muted-foreground">
                <li>• Real-time project progress and timeline</li>
                <li>• Photo updates from the job site</li>
                <li>• Direct messaging with your project team</li>
                <li>• Documents and budget tracking</li>
              </ul>
            </div>

            {user ? (
              <Button
                className="w-full"
                size="lg"
                onClick={() => acceptMutation.mutate()}
                disabled={acceptMutation.isPending}
                data-testid="button-accept-invite"
              >
                {acceptMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Setting up your portal...
                  </>
                ) : (
                  "Accept Invite & Get Started"
                )}
              </Button>
            ) : (
              <Button className="w-full" size="lg" onClick={() => window.location.href = `/api/login?returnTo=${encodeURIComponent(`/invite/${token}`)}`} data-testid="button-login-to-accept">
                Log In to Accept
              </Button>
            )}

            {acceptMutation.isError && (
              <p className="text-sm text-destructive text-center" data-testid="text-accept-error">
                Something went wrong. Please try again.
              </p>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
