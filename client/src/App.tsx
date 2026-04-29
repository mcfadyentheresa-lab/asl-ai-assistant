import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { usePresenceHeartbeat } from "@/hooks/use-presence";
import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { ThemeProvider } from "next-themes";
import { AppShell } from "@/components/layout/AppShell";
import { useBodyPointerEventsCleanup } from "@/hooks/use-body-pointer-events-cleanup";

function RoleGuard({ component: Component, allowedRoles }: { component: React.ComponentType; allowedRoles: string[] }) {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  useEffect(() => {
    if (user && !allowedRoles.includes(user.role)) {
      navigate("/");
    }
  }, [user]);
  if (!user || !allowedRoles.includes(user.role)) return null;
  return <Component />;
}

// Legacy /project/:id/photos and /project/:id/furniture deep links predate the drawer
// rework — both now route to the Planning Board with the matching drawer auto-opened.
function BoardDrawerRedirect({ drawer, params }: { drawer: "photos" | "furniture"; params: { id: string } }) {
  const [, navigate] = useLocation();
  useEffect(() => {
    navigate(`/project/${params.id}?tab=board&drawer=${drawer}`, { replace: true });
  }, [params.id, drawer]);
  return null;
}

import Dashboard from "@/pages/Dashboard";
import ProjectDetails from "@/pages/ProjectDetails";
import Profile from "@/pages/Profile";
import ColorPortfolio from "@/pages/ColorPortfolio";
import Timesheets from "@/pages/Timesheets";
import Payroll from "@/pages/Payroll";
import CrewAndTrade from "@/pages/CrewAndTrade";
import SupplierPrices from "@/pages/SupplierPrices";
import MasterCalendar from "@/pages/MasterCalendar";
import SocialMediaGenerator from "@/pages/SocialMediaGenerator";
import TableRedesignPlanner from "@/pages/TableRedesignPlanner";
import CostEstimator from "@/pages/CostEstimator";
import ProjectSettings from "@/pages/ProjectSettings";
import InviteAccept from "@/pages/InviteAccept";
import Login from "@/pages/Login";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import AcceptInvite from "@/pages/AcceptInvite";
import Welcome from "@/pages/Welcome";
import LandingPage from "@/pages/LandingPage";
import PublicPresentation from "@/pages/PublicPresentation";
import NotFound from "@/pages/not-found";

function PresenceTracker() {
  usePresenceHeartbeat();
  return null;
}

function OnboardingGuard() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const reconciled = useRef(false);

  useEffect(() => {
    if (!user || reconciled.current) return;
    if (user.role === "client") {
      reconciled.current = true;
      fetch("/api/auth/reconcile-invites", {
        method: "POST",
        credentials: "include",
      })
        .then(r => r.json())
        .then(data => {
          if (data.reconciled > 0) {
            queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
          }
          if (data.needsOnboarding && data.projectId) {
            navigate(`/welcome?project=${data.projectId}`);
          }
        })
        .catch(() => {});
    }
  }, [user]);

  return null;
}

function Router() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <Switch>
        <Route path="/login" component={Login} />
        <Route path="/forgot-password" component={ForgotPassword} />
        <Route path="/reset-password/:token" component={ResetPassword} />
        <Route path="/accept-invite/:token" component={AcceptInvite} />
        <Route path="/invite/:token" component={InviteAccept} />
        <Route path="/p/:token" component={PublicPresentation} />
        <Route component={LandingPage} />
      </Switch>
    );
  }

  return (
    <>
      <OnboardingGuard />
      <Switch>
        <Route path="/welcome" component={Welcome} />
        <Route path="/login">
          {() => { window.location.href = "/"; return null; }}
        </Route>
        <Route path="/accept-invite/:token" component={AcceptInvite} />
        <Route path="/reset-password/:token" component={ResetPassword} />
        <Route path="/invite/:token" component={InviteAccept} />
        <Route path="/p/:token" component={PublicPresentation} />
        <Route>
          {() => (
            <AppShell>
              <Switch>
                <Route path="/" component={Dashboard} />
                <Route path="/profile" component={Profile} />
                <Route path="/project/:id" component={ProjectDetails} />
                <Route path="/project/:id/estimate" component={CostEstimator} />
                <Route path="/project/:id/settings" component={ProjectSettings} />
                <Route path="/project/:id/photos">
                  {(params) => <BoardDrawerRedirect drawer="photos" params={params} />}
                </Route>
                <Route path="/project/:id/furniture">
                  {(params) => <BoardDrawerRedirect drawer="furniture" params={params} />}
                </Route>
                <Route path="/colors">
                  {() => <RoleGuard component={ColorPortfolio} allowedRoles={["admin", "crew"]} />}
                </Route>
                <Route path="/timesheets">
                  {() => <RoleGuard component={Timesheets} allowedRoles={["admin", "crew"]} />}
                </Route>
                <Route path="/payroll">
                  {() => <RoleGuard component={Payroll} allowedRoles={["admin"]} />}
                </Route>
                <Route path="/crew-and-trade">
                  {() => <RoleGuard component={CrewAndTrade} allowedRoles={["admin", "crew"]} />}
                </Route>
                <Route path="/labor-rates">
                  {() => <RoleGuard component={CrewAndTrade} allowedRoles={["admin", "crew"]} />}
                </Route>
                <Route path="/trade-contacts">
                  {() => <RoleGuard component={CrewAndTrade} allowedRoles={["admin", "crew"]} />}
                </Route>
                <Route path="/market-rates">
                  {() => <RoleGuard component={CrewAndTrade} allowedRoles={["admin", "crew"]} />}
                </Route>
                <Route path="/supplier-prices">
                  {() => <RoleGuard component={SupplierPrices} allowedRoles={["admin"]} />}
                </Route>
                <Route path="/master-calendar">
                  {() => <RoleGuard component={MasterCalendar} allowedRoles={["admin", "crew"]} />}
                </Route>
                <Route path="/social-media">
                  {() => <RoleGuard component={SocialMediaGenerator} allowedRoles={["admin"]} />}
                </Route>
                <Route path="/table-redesign">
                  {() => <RoleGuard component={TableRedesignPlanner} allowedRoles={["admin"]} />}
                </Route>
                <Route component={NotFound} />
              </Switch>
            </AppShell>
          )}
        </Route>
      </Switch>
    </>
  );
}

function GlobalEffects() {
  useBodyPointerEventsCleanup();
  return null;
}

function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <GlobalEffects />
          <PresenceTracker />
          <Toaster />
          <Router />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
