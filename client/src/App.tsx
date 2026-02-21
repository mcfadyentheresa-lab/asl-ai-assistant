import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { usePresenceHeartbeat } from "@/hooks/use-presence";
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
import NotFound from "@/pages/not-found";

function PresenceTracker() {
  usePresenceHeartbeat();
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
        <Route component={LandingPage} /> {/* Catch-all for non-logged in users redirects to Landing */}
      </Switch>
    );
  }

  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/profile" component={Profile} />
      <Route path="/project/:id/estimate" component={CostEstimator} />
      <Route path="/project/:id" component={ProjectDetails} />
      <Route path="/colors" component={ColorPortfolio} />
      <Route path="/timesheets" component={Timesheets} />
      <Route path="/payroll" component={Payroll} />
      <Route path="/market-rates" component={MarketRates} />
      <Route path="/labor-rates" component={LaborRates} />
      <Route path="/trade-contacts" component={TradeContacts} />
      <Route component={NotFound} />
    </Switch>
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
