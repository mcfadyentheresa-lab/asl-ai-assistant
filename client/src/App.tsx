import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { usePresenceHeartbeat } from "@/hooks/use-presence";
import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";

import LandingPage from "@/pages/LandingPage";
import Dashboard from "@/pages/Dashboard";
import ProjectDetails from "@/pages/ProjectDetails";
import Profile from "@/pages/Profile";
import ColorPortfolio from "@/pages/ColorPortfolio";
import Timesheets from "@/pages/Timesheets";
import Payroll from "@/pages/Payroll";
import CostEstimator from "@/pages/CostEstimator";
import MarketRates from "@/pages/MarketRates";
import LaborRates from "@/pages/LaborRates";
import TradeContacts from "@/pages/TradeContacts";
import SupplierPrices from "@/pages/SupplierPrices";
import InviteAccept from "@/pages/InviteAccept";
import Welcome from "@/pages/Welcome";
import NotFound from "@/pages/not-found";

function PresenceTracker() {
  usePresenceHeartbeat();
  return null;
}

function OnboardingGuard() {
  const { user } = useAuth();
  const [location, navigate] = useLocation();
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
            if (data.projectId && !user.onboardingCompleted) {
              navigate(`/welcome?project=${data.projectId}`);
            }
          }
        })
        .catch(() => {});
    }
  }, [user]);

  useEffect(() => {
    if (
      user &&
      user.role === "client" &&
      !user.onboardingCompleted &&
      location !== "/welcome" &&
      !location.startsWith("/invite/")
    ) {
      navigate("/welcome");
    }
  }, [user, location, navigate]);

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
        <Route path="/" component={LandingPage} />
        <Route path="/invite/:token" component={InviteAccept} />
        <Route component={LandingPage} />
      </Switch>
    );
  }

  return (
    <>
      <OnboardingGuard />
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/welcome" component={Welcome} />
        <Route path="/invite/:token" component={InviteAccept} />
        <Route path="/profile" component={Profile} />
        <Route path="/project/:id/estimate" component={CostEstimator} />
        <Route path="/project/:id" component={ProjectDetails} />
        <Route path="/colors" component={ColorPortfolio} />
        <Route path="/timesheets" component={Timesheets} />
        <Route path="/payroll" component={Payroll} />
        <Route path="/market-rates" component={MarketRates} />
        <Route path="/labor-rates" component={LaborRates} />
        <Route path="/trade-contacts" component={TradeContacts} />
        <Route path="/supplier-prices" component={SupplierPrices} />
        <Route component={NotFound} />
      </Switch>
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <PresenceTracker />
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
