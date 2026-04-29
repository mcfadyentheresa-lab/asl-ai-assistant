import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, ArrowRight, Home } from "lucide-react";
import { motion } from "framer-motion";

export default function Welcome() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const params = new URLSearchParams(window.location.search);
  const projectId = params.get("project");

  const [firstName, setFirstName] = useState(user?.firstName || "");
  const [lastName, setLastName] = useState(user?.lastName || "");
  const [email, setEmail] = useState(user?.email || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [smsNotifications, setSmsNotifications] = useState(true);
  const [emailNotifications, setEmailNotifications] = useState(true);

  const completeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/complete-onboarding", {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || null,
        smsNotifications,
        emailNotifications,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      if (projectId) {
        navigate(`/project/${projectId}`);
      } else {
        navigate("/");
      }
    },
  });

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-lg w-full"
      >
        <Card>
          <CardContent className="pt-8 pb-8 space-y-8">
            <div className="text-center space-y-3">
              <span className="font-serif text-2xl font-bold text-primary tracking-tight">
                Aster & Spruce
              </span>
              <h1
                className="font-serif text-3xl font-bold"
                data-testid="text-welcome-heading"
              >
                Welcome to Your Portal
              </h1>
              <p className="text-muted-foreground">
                Let's get your profile set up so your project team knows who you are.
              </p>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="First name"
                    data-testid="input-welcome-first-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Last name"
                    data-testid="input-welcome-last-name"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  data-testid="input-welcome-email"
                />
                <p className="text-xs text-muted-foreground">
                  Confirm your email for project communications.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number (optional)</Label>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(705) 555-0123"
                  data-testid="input-welcome-phone"
                />
                <p className="text-xs text-muted-foreground">
                  We'll use this to send you project updates via text.
                </p>
              </div>

              <div className="border rounded-lg p-4 space-y-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide">
                  Notification Preferences
                </h3>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="smsNotifications" className="text-sm">SMS Notifications</Label>
                    <p className="text-xs text-muted-foreground">
                      Receive text messages for project updates
                    </p>
                  </div>
                  <Switch
                    id="smsNotifications"
                    checked={smsNotifications}
                    onCheckedChange={setSmsNotifications}
                    data-testid="switch-sms-notifications"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="emailNotifications" className="text-sm">Email Notifications</Label>
                    <p className="text-xs text-muted-foreground">
                      Receive email updates about your project
                    </p>
                  </div>
                  <Switch
                    id="emailNotifications"
                    checked={emailNotifications}
                    onCheckedChange={setEmailNotifications}
                    data-testid="switch-email-notifications"
                  />
                </div>
              </div>
            </div>

            <Button
              className="w-full"
              size="lg"
              onClick={() => completeMutation.mutate()}
              disabled={completeMutation.isPending || !firstName.trim() || !lastName.trim()}
              data-testid="button-complete-onboarding"
            >
              {completeMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Setting up...
                </>
              ) : (
                <>
                  Go to My Project
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>

            {completeMutation.isError && (
              <p className="text-sm text-destructive text-center" data-testid="text-onboarding-error">
                Something went wrong. Please try again.
              </p>
            )}

            {/* Skip for now: only offered if the invite already pre-filled a real
                name. Otherwise we keep the user here so admins never see a
                phantom "Client User" in their dashboard. */}
            {user?.firstName && user?.lastName && (
              <div className="text-center">
                <button
                  onClick={() => {
                    apiRequest("POST", "/api/auth/complete-onboarding", {
                      firstName: user.firstName!,
                      lastName: user.lastName!,
                    }).then(() => {
                      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
                      navigate("/");
                    }).catch(() => navigate("/"));
                  }}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
                  data-testid="button-skip-onboarding"
                >
                  <Home className="h-3.5 w-3.5" />
                  Skip for now
                </button>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
