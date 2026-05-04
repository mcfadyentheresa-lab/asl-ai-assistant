import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Navbar } from "@/components/layout/Navbar";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  Users, Building2, TrendingUp, Plus, Pencil, Trash2, DollarSign,
  Loader2, Phone, Mail, MapPin, Star, Search, Calendar, ArrowLeft, User,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import type { CostCategory, MarketRate } from "@shared/schema";

interface CrewRate {
  id: number;
  userId: string | null;
  name: string;
  role: string | null;
  payRate: string;
  billableRate: string;
  isActive: boolean | null;
  notes: string | null;
  createdAt: string | null;
}

interface Subcontractor {
  id: number;
  businessName: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  categoryId: number | null;
  trade: string | null;
  hourlyRate: string | null;
  dailyRate: string | null;
  unitRate: string | null;
  unitType: string | null;
  isPreferred: boolean | null;
  isActive: boolean | null;
  address: string | null;
  notes: string | null;
  createdAt: string | null;
}

export default function CrewAndTrade() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isAdmin = (user as any)?.role === "admin";
  const isCrew = (user as any)?.role === "crew";

  // Sub-paths registered in App.tsx (/labor-rates, /trade-contacts,
  // /market-rates) used to all land on the role default — the four routes
  // existed but didn't actually pick a tab. Now we derive the initial tab
  // from the URL so deep links work, and we fall back to the role default
  // (`/crew-and-trade`) when there's no specific sub-path.
  //
  // Crew don't have access to the `crew` (pay rates) or `benchmarks` tabs,
  // so a crew user landing on /labor-rates or /market-rates is silently
  // remapped to `trade` rather than getting an empty tab body.
  const [location] = useLocation();
  function tabFromLocation(path: string): string {
    if (path.startsWith("/labor-rates")) return isAdmin ? "crew" : "trade";
    if (path.startsWith("/trade-contacts")) return "trade";
    if (path.startsWith("/market-rates")) return isAdmin ? "benchmarks" : "trade";
    return isAdmin ? "crew" : "trade";
  }
  const defaultTab = tabFromLocation(location);
  const [activeTab, setActiveTab] = useState(defaultTab);

  // Keep activeTab in sync if the user navigates between sub-paths without
  // unmounting the component (e.g. via the sidebar / a future tab-aware nav).
  useEffect(() => {
    const next = tabFromLocation(location);
    setActiveTab(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location, isAdmin]);

  // ── Crew state ──────────────────────────────────────────────
  const [showAddCrew, setShowAddCrew] = useState(false);
  const [editingCrew, setEditingCrew] = useState<CrewRate | null>(null);
  const [newCrew, setNewCrew] = useState({ name: "", role: "", payRate: "", billableRate: "", notes: "" });

  // ── Trade Contacts state ─────────────────────────────────────
  const [search, setSearch] = useState("");
  const [filterTrade, setFilterTrade] = useState<string | null>(null);
  const [editContact, setEditContact] = useState<Subcontractor | null>(null);
  const [deleteContact, setDeleteContact] = useState<Subcontractor | null>(null);
  const [showAddContact, setShowAddContact] = useState(false);

  // ── Market Benchmarks state ──────────────────────────────────
  const [showAddRate, setShowAddRate] = useState(false);
  const [editingRate, setEditingRate] = useState<MarketRate | null>(null);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [filterCategory, setFilterCategory] = useState("all");
  const [newRate, setNewRate] = useState({
    categoryId: "", unitType: "sq_ft", lowRate: "", typicalRate: "", highRate: "",
    effectiveDate: new Date().toISOString().split("T")[0], notes: "",
  });
  const [newCategory, setNewCategory] = useState({ name: "", description: "", defaultUnitType: "sq_ft" });

  // ── Queries ──────────────────────────────────────────────────
  const { data: crewRates = [], isLoading: loadingCrew } = useQuery<CrewRate[]>({ queryKey: ["/api/crew-rates"] });
  const { data: subcontractors = [], isLoading: loadingSubs } = useQuery<Subcontractor[]>({ queryKey: ["/api/subcontractors"] });
  const { data: categories = [] } = useQuery<CostCategory[]>({ queryKey: ["/api/cost-categories"] });
  const { data: marketRates = [], isLoading: loadingRates } = useQuery<MarketRate[]>({ queryKey: ["/api/market-rates"] });

  // ── Crew mutations ───────────────────────────────────────────
  const addCrewMutation = useMutation({
    mutationFn: async (data: any) => { const r = await apiRequest("POST", "/api/crew-rates", data); return r.json(); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crew-rates"] });
      setShowAddCrew(false);
      setNewCrew({ name: "", role: "", payRate: "", billableRate: "", notes: "" });
      toast({ title: "Crew rate added" });
    },
  });

  const updateCrewMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => { const r = await apiRequest("PATCH", `/api/crew-rates/${id}`, data); return r.json(); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crew-rates"] });
      setEditingCrew(null);
      toast({ title: "Crew rate updated" });
    },
  });

  const deleteCrewMutation = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/crew-rates/${id}`); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/crew-rates"] }); toast({ title: "Crew rate removed" }); },
  });

  // ── Subcontractor mutations ──────────────────────────────────
  const deleteSubMutation = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/subcontractors/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/subcontractors"] });
      toast({ title: "Contact removed" });
      setDeleteContact(null);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to remove contact", description: error.message, variant: "destructive" });
    },
  });

  // ── Market rate mutations ────────────────────────────────────
  const addRateMutation = useMutation({
    mutationFn: async (data: any) => { const r = await apiRequest("POST", "/api/market-rates", data); return r.json(); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/market-rates"] });
      setShowAddRate(false);
      setNewRate({ categoryId: "", unitType: "sq_ft", lowRate: "", typicalRate: "", highRate: "", effectiveDate: new Date().toISOString().split("T")[0], notes: "" });
      toast({ title: "Market rate added" });
    },
  });

  const updateRateMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => { const r = await apiRequest("PATCH", `/api/market-rates/${id}`, data); return r.json(); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/market-rates"] });
      setEditingRate(null);
      toast({ title: "Market rate updated" });
    },
  });

  const addCategoryMutation = useMutation({
    mutationFn: async (data: any) => { const r = await apiRequest("POST", "/api/cost-categories", data); return r.json(); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cost-categories"] });
      setShowAddCategory(false);
      setNewCategory({ name: "", description: "", defaultUnitType: "sq_ft" });
      toast({ title: "Category added" });
    },
  });

  if (!user || (!isAdmin && !isCrew)) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="max-w-4xl mx-auto px-4 py-16 text-center">
          <p className="text-muted-foreground">This page is available to crew and admin only.</p>
        </div>
      </div>
    );
  }

  // ── Derived data ─────────────────────────────────────────────
  const activeCrew = crewRates.filter(c => c.isActive !== false);
  const preferredSubs = subcontractors.filter(s => s.isPreferred && s.isActive !== false);

  const trades = Array.from(new Set(subcontractors.map(s => s.trade).filter(Boolean) as string[])).sort();

  const filteredSubs = subcontractors.filter(s => {
    if (s.isActive === false) return false;
    const q = search.toLowerCase();
    const matchesSearch = !q ||
      s.businessName.toLowerCase().includes(q) ||
      (s.contactName?.toLowerCase().includes(q)) ||
      (s.trade?.toLowerCase().includes(q)) ||
      (s.phone?.includes(q)) ||
      (s.email?.toLowerCase().includes(q));
    const matchesTrade = !filterTrade || s.trade === filterTrade;
    return matchesSearch && matchesTrade;
  });

  const preferred = filteredSubs.filter(s => s.isPreferred);
  const others = filteredSubs.filter(s => !s.isPreferred);
  const groupedByTrade: Record<string, Subcontractor[]> = {};
  for (const s of others) {
    const trade = s.trade || "Other";
    if (!groupedByTrade[trade]) groupedByTrade[trade] = [];
    groupedByTrade[trade].push(s);
  }
  const sortedTrades = Object.keys(groupedByTrade).sort();

  const activeRates = marketRates.filter(r => r.isActive);
  const groupedByCategory = categories.map(cat => ({
    category: cat,
    rates: activeRates.filter(r => r.categoryId === cat.id),
    latestRate: activeRates.find(r => r.categoryId === cat.id),
  }));
  const filteredRates = filterCategory === "all"
    ? groupedByCategory
    : groupedByCategory.filter(g => String(g.category.id) === filterCategory);

  function handleAddRate() {
    if (!newRate.categoryId || !newRate.lowRate || !newRate.typicalRate || !newRate.highRate) {
      toast({ title: "Please fill in all rate fields", variant: "destructive" });
      return;
    }
    addRateMutation.mutate({
      categoryId: parseInt(newRate.categoryId),
      unitType: newRate.unitType,
      lowRate: newRate.lowRate,
      typicalRate: newRate.typicalRate,
      highRate: newRate.highRate,
      effectiveDate: newRate.effectiveDate,
      isActive: true,
      notes: newRate.notes || null,
    });
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 py-6 max-w-6xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="icon" className="h-8 w-8" data-testid="button-back">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold normal-case" data-testid="text-page-title">Crew & Trade</h1>
              <p className="text-sm text-muted-foreground">Crew rates, trade contacts, and market benchmarks</p>
            </div>
          </div>
        </div>

        {/* Stats — admin only */}
        {isAdmin && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="text-xs text-muted-foreground uppercase tracking-wide">Crew</div>
                <div className="text-2xl font-semibold mt-1" data-testid="text-crew-count">{activeCrew.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="text-xs text-muted-foreground uppercase tracking-wide">Avg Pay Rate</div>
                <div className="text-2xl font-semibold mt-1" data-testid="text-avg-pay">
                  ${activeCrew.length > 0
                    ? (activeCrew.reduce((s, c) => s + parseFloat(c.payRate), 0) / activeCrew.length).toFixed(2)
                    : "0.00"}
                </div>
                <div className="text-xs text-muted-foreground">per hour (CAD)</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="text-xs text-muted-foreground uppercase tracking-wide">Trade Contacts</div>
                <div className="text-2xl font-semibold mt-1" data-testid="text-sub-count">
                  {subcontractors.filter(s => s.isActive !== false).length}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="text-xs text-muted-foreground uppercase tracking-wide">Preferred</div>
                <div className="text-2xl font-semibold mt-1" data-testid="text-preferred-count">{preferredSubs.length}</div>
                <div className="text-xs text-muted-foreground">go-to vendors</div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 mb-4">
            <TabsList className="w-max md:w-auto">
              {isAdmin && (
                <TabsTrigger value="crew" data-testid="tab-crew">
                  <Users className="h-4 w-4 mr-2" /> Crew
                </TabsTrigger>
              )}
              <TabsTrigger value="trade" data-testid="tab-trade">
                <Building2 className="h-4 w-4 mr-2" /> Trade Contacts
              </TabsTrigger>
              {isAdmin && (
                <TabsTrigger value="benchmarks" data-testid="tab-benchmarks">
                  <TrendingUp className="h-4 w-4 mr-2" /> Market Benchmarks
                </TabsTrigger>
              )}
            </TabsList>
          </div>

          {/*
            Crew see only the Trade Contacts tab — the single-tab state can
            otherwise look like the page is broken. This subheader explains
            why other tabs are absent.
          */}
          {isCrew && (
            <p
              className="text-xs text-muted-foreground mb-4 -mt-1"
              data-testid="text-crew-tabs-explainer"
            >
              You have access to Trade Contacts. Crew pay rates and market benchmarks are managed by admin.
            </p>
          )}

          {/* ── CREW TAB ─────────────────────────────────────── */}
          {isAdmin && (
            <TabsContent value="crew">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold normal-case">Crew Pay & Billable Rates</h2>
                <Button onClick={() => setShowAddCrew(true)} data-testid="button-add-crew">
                  <Plus className="h-4 w-4 mr-2" /> Add Crew Rate
                </Button>
              </div>

              {loadingCrew ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
              ) : (
                <div className="space-y-3">
                  {activeCrew.map(crew => (
                    <Card key={crew.id} data-testid={`card-crew-${crew.id}`}>
                      <CardContent className="py-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-semibold" data-testid={`text-crew-name-${crew.id}`}>{crew.name}</span>
                              {crew.role && <Badge variant="secondary" className="text-xs">{crew.role}</Badge>}
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2">
                              <div>
                                <div className="text-xs text-muted-foreground">Pay Rate</div>
                                <div className="font-medium" data-testid={`text-crew-pay-${crew.id}`}>
                                  ${parseFloat(crew.payRate).toFixed(2)}/hr
                                </div>
                              </div>
                              <div>
                                <div className="text-xs text-muted-foreground">Bill Rate</div>
                                <div className="font-medium text-green-600" data-testid={`text-crew-bill-${crew.id}`}>
                                  ${parseFloat(crew.billableRate).toFixed(2)}/hr
                                </div>
                              </div>
                              <div>
                                <div className="text-xs text-muted-foreground">Margin</div>
                                <div className="font-medium" data-testid={`text-crew-margin-${crew.id}`}>
                                  ${(parseFloat(crew.billableRate) - parseFloat(crew.payRate)).toFixed(2)}/hr
                                  <span className="text-xs text-muted-foreground ml-1">
                                    ({((1 - parseFloat(crew.payRate) / parseFloat(crew.billableRate)) * 100).toFixed(0)}%)
                                  </span>
                                </div>
                              </div>
                              <div>
                                <div className="text-xs text-muted-foreground">Daily (8hr)</div>
                                <div className="font-medium">${(parseFloat(crew.billableRate) * 8).toFixed(2)}</div>
                              </div>
                            </div>
                            {crew.notes && <p className="text-xs text-muted-foreground mt-2">{crew.notes}</p>}
                          </div>
                          <div className="flex gap-1 ml-4">
                            <Button variant="ghost" size="icon" onClick={() => setEditingCrew(crew)} data-testid={`button-edit-crew-${crew.id}`}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => deleteCrewMutation.mutate(crew.id)} data-testid={`button-delete-crew-${crew.id}`}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {activeCrew.length === 0 && (
                    <p className="text-center text-muted-foreground py-8">No crew rates added yet.</p>
                  )}
                </div>
              )}
            </TabsContent>
          )}

          {/* ── TRADE CONTACTS TAB ───────────────────────────── */}
          <TabsContent value="trade">
            <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
              <h2 className="text-lg font-semibold normal-case">Trade Contacts</h2>
              {isAdmin && (
                <Button onClick={() => setShowAddContact(true)} data-testid="button-add-contact">
                  <Plus className="h-4 w-4 mr-2" /> Add Contact
                </Button>
              )}
            </div>

            {/* Search + trade filter */}
            <div className="flex flex-col sm:flex-row gap-3 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Search by name, trade, phone..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-9"
                  data-testid="input-search-contacts"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge
                  variant={filterTrade === null ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => setFilterTrade(null)}
                  data-testid="filter-all"
                >
                  All
                </Badge>
                {trades.map(t => (
                  <Badge
                    key={t}
                    variant={filterTrade === t ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => setFilterTrade(filterTrade === t ? null : t)}
                    data-testid={`filter-trade-${t.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    {t}
                  </Badge>
                ))}
              </div>
            </div>

            {loadingSubs ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredSubs.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Building2 className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p>No contacts found</p>
              </div>
            ) : (
              <div className="space-y-8">
                {preferred.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
                      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground" data-testid="text-preferred-heading">
                        Go-To Contacts
                      </h3>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {preferred.map(s => (
                        <ContactCard
                          key={s.id}
                          contact={s}
                          categories={categories}
                          isAdmin={isAdmin}
                          onEdit={() => setEditContact(s)}
                          onDelete={() => setDeleteContact(s)}
                        />
                      ))}
                    </div>
                  </div>
                )}
                {sortedTrades.map(trade => (
                  <div key={trade}>
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3"
                      data-testid={`text-trade-heading-${trade.toLowerCase().replace(/\s+/g, "-")}`}>
                      {trade}
                    </h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {groupedByTrade[trade].map(s => (
                        <ContactCard
                          key={s.id}
                          contact={s}
                          categories={categories}
                          isAdmin={isAdmin}
                          onEdit={() => setEditContact(s)}
                          onDelete={() => setDeleteContact(s)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── MARKET BENCHMARKS TAB ────────────────────────── */}
          {isAdmin && (
            <TabsContent value="benchmarks">
              <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
                <div>
                  <h2 className="text-lg font-semibold normal-case">Market Benchmarks</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Baseline pricing for high-end Muskoka renovations (CAD)</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setShowAddCategory(true)} data-testid="button-add-category">
                    <Plus className="h-4 w-4 mr-1" /> Category
                  </Button>
                  <Button size="sm" onClick={() => setShowAddRate(true)} data-testid="button-add-rate">
                    <Plus className="h-4 w-4 mr-1" /> New Rate
                  </Button>
                </div>
              </div>

              <div className="flex items-center gap-2 mb-4">
                <Label className="text-sm">Filter:</Label>
                <Select value={filterCategory} onValueChange={setFilterCategory}>
                  <SelectTrigger className="w-[200px]" data-testid="select-filter-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {categories.map(c => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {loadingRates ? (
                <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {filteredRates.map(({ category, latestRate }) => (
                    <Card key={category.id} data-testid={`category-card-${category.id}`}>
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base normal-case">{category.name}</CardTitle>
                          <Badge variant="outline" className="text-[10px]">
                            {category.defaultUnitType === "sq_ft" ? "$/sq ft" : "$/unit"}
                          </Badge>
                        </div>
                        {category.description && (
                          <p className="text-xs text-muted-foreground">{category.description}</p>
                        )}
                      </CardHeader>
                      <CardContent>
                        {latestRate ? (
                          <div className="space-y-3">
                            <div className="grid grid-cols-3 gap-3 text-center">
                              <div>
                                <div className="text-[10px] text-muted-foreground uppercase">Low</div>
                                <div className="text-sm font-semibold text-green-600" data-testid={`rate-low-${category.id}`}>
                                  ${parseFloat(latestRate.lowRate).toFixed(2)}
                                </div>
                              </div>
                              <div>
                                <div className="text-[10px] text-muted-foreground uppercase">Typical</div>
                                <div className="text-sm font-bold" data-testid={`rate-typical-${category.id}`}>
                                  ${parseFloat(latestRate.typicalRate).toFixed(2)}
                                </div>
                              </div>
                              <div>
                                <div className="text-[10px] text-muted-foreground uppercase">High</div>
                                <div className="text-sm font-semibold text-amber-600" data-testid={`rate-high-${category.id}`}>
                                  ${parseFloat(latestRate.highRate).toFixed(2)}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Calendar className="h-3 w-3" />
                                Effective: {latestRate.effectiveDate}
                              </div>
                              <Button variant="ghost" size="sm" onClick={() => setEditingRate(latestRate)} data-testid={`button-edit-rate-${category.id}`}>
                                <Pencil className="h-3 w-3 mr-1" /> Edit
                              </Button>
                            </div>
                            {latestRate.notes && (
                              <p className="text-xs text-muted-foreground">{latestRate.notes}</p>
                            )}
                          </div>
                        ) : (
                          <div className="text-center py-4">
                            <DollarSign className="h-6 w-6 mx-auto text-muted-foreground mb-1" />
                            <p className="text-xs text-muted-foreground">No rates set</p>
                            <Button variant="outline" size="sm" className="mt-2" onClick={() => {
                              setNewRate(prev => ({ ...prev, categoryId: String(category.id), unitType: category.defaultUnitType }));
                              setShowAddRate(true);
                            }} data-testid={`button-set-rate-${category.id}`}>
                              Set Rate
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          )}
        </Tabs>
      </div>

      {/* ═══════════════ CREW DIALOGS ══════════════════════════ */}
      <Dialog open={showAddCrew} onOpenChange={setShowAddCrew}>
        <DialogContent className="w-[95vw] max-w-lg">
          <DialogHeader><DialogTitle>Add Crew Rate</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Name</Label>
                <Input value={newCrew.name} onChange={e => setNewCrew(p => ({ ...p, name: e.target.value }))} placeholder="e.g., Lead Carpenter" data-testid="input-crew-name" />
              </div>
              <div>
                <Label>Role</Label>
                <Input value={newCrew.role} onChange={e => setNewCrew(p => ({ ...p, role: e.target.value }))} placeholder="e.g., Foreman" data-testid="input-crew-role" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Pay Rate ($/hr CAD)</Label>
                <Input type="number" step="0.01" value={newCrew.payRate} onChange={e => setNewCrew(p => ({ ...p, payRate: e.target.value }))} placeholder="45.00" data-testid="input-crew-pay" />
              </div>
              <div>
                <Label>Bill Rate ($/hr CAD)</Label>
                <Input type="number" step="0.01" value={newCrew.billableRate} onChange={e => setNewCrew(p => ({ ...p, billableRate: e.target.value }))} placeholder="85.00" data-testid="input-crew-bill" />
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={newCrew.notes} onChange={e => setNewCrew(p => ({ ...p, notes: e.target.value }))} placeholder="Experience level, certifications..." data-testid="input-crew-notes" />
            </div>
            <Button
              onClick={() => addCrewMutation.mutate(newCrew)}
              disabled={!newCrew.name || !newCrew.payRate || !newCrew.billableRate || addCrewMutation.isPending}
              className="w-full"
              data-testid="button-save-crew"
            >
              {addCrewMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
              Add Crew Rate
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingCrew} onOpenChange={() => setEditingCrew(null)}>
        <DialogContent className="w-[95vw] max-w-lg">
          <DialogHeader><DialogTitle>Edit Crew Rate</DialogTitle></DialogHeader>
          {editingCrew && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Name</Label>
                  <Input value={editingCrew.name} onChange={e => setEditingCrew({ ...editingCrew, name: e.target.value })} data-testid="input-edit-crew-name" />
                </div>
                <div>
                  <Label>Role</Label>
                  <Input value={editingCrew.role || ""} onChange={e => setEditingCrew({ ...editingCrew, role: e.target.value })} data-testid="input-edit-crew-role" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Pay Rate ($/hr CAD)</Label>
                  <Input type="number" step="0.01" value={editingCrew.payRate} onChange={e => setEditingCrew({ ...editingCrew, payRate: e.target.value })} data-testid="input-edit-crew-pay" />
                </div>
                <div>
                  <Label>Bill Rate ($/hr CAD)</Label>
                  <Input type="number" step="0.01" value={editingCrew.billableRate} onChange={e => setEditingCrew({ ...editingCrew, billableRate: e.target.value })} data-testid="input-edit-crew-bill" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={editingCrew.isActive !== false} onCheckedChange={checked => setEditingCrew({ ...editingCrew, isActive: checked })} />
                <Label>Active</Label>
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea value={editingCrew.notes || ""} onChange={e => setEditingCrew({ ...editingCrew, notes: e.target.value })} data-testid="input-edit-crew-notes" />
              </div>
              <Button onClick={() => updateCrewMutation.mutate(editingCrew)} disabled={updateCrewMutation.isPending} className="w-full" data-testid="button-update-crew">
                {updateCrewMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Pencil className="h-4 w-4 mr-2" />}
                Update Crew Rate
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ═══════════════ TRADE CONTACT DIALOGS ════════════════ */}
      <EditContactDialog
        contact={editContact}
        open={!!editContact}
        categories={categories}
        onClose={() => setEditContact(null)}
      />
      <EditContactDialog
        contact={null}
        open={showAddContact}
        categories={categories}
        onClose={() => setShowAddContact(false)}
      />

      <AlertDialog open={!!deleteContact} onOpenChange={open => !open && setDeleteContact(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Contact</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove {deleteContact?.businessName}? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteContact && deleteSubMutation.mutate(deleteContact.id)}
              disabled={deleteSubMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteSubMutation.isPending ? "Removing..." : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ═══════════════ MARKET BENCHMARK DIALOGS ════════════ */}
      <Dialog open={showAddRate} onOpenChange={setShowAddRate}>
        <DialogContent className="w-[95vw] max-w-md">
          <DialogHeader><DialogTitle>Add Market Rate</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Category</Label>
              <Select value={newRate.categoryId} onValueChange={v => {
                const cat = categories.find(c => c.id === parseInt(v));
                setNewRate(prev => ({ ...prev, categoryId: v, unitType: cat?.defaultUnitType || "sq_ft" }));
              }}>
                <SelectTrigger data-testid="select-rate-category"><SelectValue placeholder="Select category..." /></SelectTrigger>
                <SelectContent>
                  {categories.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Unit Type</Label>
              <Select value={newRate.unitType} onValueChange={v => setNewRate(prev => ({ ...prev, unitType: v }))}>
                <SelectTrigger data-testid="select-rate-unit"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sq_ft">Per Square Foot</SelectItem>
                  <SelectItem value="board">Per Board / Unit</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Low ($)</Label>
                <Input type="number" step="0.01" value={newRate.lowRate} onChange={e => setNewRate(prev => ({ ...prev, lowRate: e.target.value }))} data-testid="input-rate-low" />
              </div>
              <div>
                <Label>Typical ($)</Label>
                <Input type="number" step="0.01" value={newRate.typicalRate} onChange={e => setNewRate(prev => ({ ...prev, typicalRate: e.target.value }))} data-testid="input-rate-typical" />
              </div>
              <div>
                <Label>High ($)</Label>
                <Input type="number" step="0.01" value={newRate.highRate} onChange={e => setNewRate(prev => ({ ...prev, highRate: e.target.value }))} data-testid="input-rate-high" />
              </div>
            </div>
            <div>
              <Label>Effective Date</Label>
              <Input type="date" value={newRate.effectiveDate} onChange={e => setNewRate(prev => ({ ...prev, effectiveDate: e.target.value }))} data-testid="input-rate-date" />
            </div>
            <div>
              <Label>Notes</Label>
              <Input value={newRate.notes} onChange={e => setNewRate(prev => ({ ...prev, notes: e.target.value }))} placeholder="e.g., Updated for 2026 season" data-testid="input-rate-notes" />
            </div>
            <Button className="w-full" onClick={handleAddRate} disabled={addRateMutation.isPending} data-testid="button-submit-rate">
              {addRateMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <TrendingUp className="h-4 w-4 mr-2" />}
              Add Rate
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {editingRate && (
        <Dialog open={!!editingRate} onOpenChange={() => setEditingRate(null)}>
          <DialogContent className="w-[95vw] max-w-md">
            <DialogHeader><DialogTitle>Edit Market Rate</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="text-sm font-medium">{categories.find(c => c.id === editingRate.categoryId)?.name}</div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Low ($)</Label>
                  <Input type="number" step="0.01" defaultValue={editingRate.lowRate}
                    onChange={e => setEditingRate(prev => prev ? { ...prev, lowRate: e.target.value } : null)}
                    data-testid="input-edit-low" />
                </div>
                <div>
                  <Label>Typical ($)</Label>
                  <Input type="number" step="0.01" defaultValue={editingRate.typicalRate}
                    onChange={e => setEditingRate(prev => prev ? { ...prev, typicalRate: e.target.value } : null)}
                    data-testid="input-edit-typical" />
                </div>
                <div>
                  <Label>High ($)</Label>
                  <Input type="number" step="0.01" defaultValue={editingRate.highRate}
                    onChange={e => setEditingRate(prev => prev ? { ...prev, highRate: e.target.value } : null)}
                    data-testid="input-edit-high" />
                </div>
              </div>
              <div>
                <Label>Notes</Label>
                <Input defaultValue={editingRate.notes || ""} onChange={e => setEditingRate(prev => prev ? { ...prev, notes: e.target.value } : null)} data-testid="input-edit-notes" />
              </div>
              <Button className="w-full" onClick={() => {
                if (!editingRate) return;
                updateRateMutation.mutate({ id: editingRate.id, lowRate: editingRate.lowRate, typicalRate: editingRate.typicalRate, highRate: editingRate.highRate, notes: editingRate.notes });
              }} disabled={updateRateMutation.isPending} data-testid="button-save-rate">
                {updateRateMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Pencil className="h-4 w-4 mr-2" />}
                Save Changes
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={showAddCategory} onOpenChange={setShowAddCategory}>
        <DialogContent className="w-[95vw] max-w-md">
          <DialogHeader><DialogTitle>Add Cost Category</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input value={newCategory.name} onChange={e => setNewCategory(prev => ({ ...prev, name: e.target.value }))} placeholder="e.g., Solar Panels" data-testid="input-category-name" />
            </div>
            <div>
              <Label>Description</Label>
              <Input value={newCategory.description} onChange={e => setNewCategory(prev => ({ ...prev, description: e.target.value }))} placeholder="Brief description..." data-testid="input-category-description" />
            </div>
            <div>
              <Label>Default Unit Type</Label>
              <Select value={newCategory.defaultUnitType} onValueChange={v => setNewCategory(prev => ({ ...prev, defaultUnitType: v }))}>
                <SelectTrigger data-testid="select-category-unit"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sq_ft">Per Square Foot</SelectItem>
                  <SelectItem value="board">Per Board / Unit</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full" onClick={() => {
              if (!newCategory.name) { toast({ title: "Name is required", variant: "destructive" }); return; }
              addCategoryMutation.mutate(newCategory);
            }} disabled={addCategoryMutation.isPending} data-testid="button-submit-category">
              {addCategoryMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              Add Category
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Contact card (read) ───────────────────────────────────────
function ContactCard({
  contact, categories, isAdmin, onEdit, onDelete,
}: {
  contact: Subcontractor;
  categories: CostCategory[];
  isAdmin: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const cat = categories.find(c => c.id === contact.categoryId);
  const rate = contact.hourlyRate
    ? `$${contact.hourlyRate}/hr`
    : contact.dailyRate
    ? `$${contact.dailyRate}/day`
    : contact.unitRate
    ? `$${contact.unitRate}/${contact.unitType || "unit"}`
    : null;

  return (
    <Card data-testid={`card-contact-${contact.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-foreground truncate" data-testid={`text-business-name-${contact.id}`}>
                {contact.businessName}
              </h3>
              {contact.isPreferred && <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500 shrink-0" />}
            </div>
            {(cat || contact.trade) && (
              <Badge variant="secondary" className="mt-1 text-xs" data-testid={`badge-trade-${contact.id}`}>
                {cat?.name || contact.trade}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {rate && (
              <span className="text-sm font-medium text-muted-foreground whitespace-nowrap mr-1" data-testid={`text-rate-${contact.id}`}>
                {rate}
              </span>
            )}
            {isAdmin && (
              <div className="flex items-center gap-0.5">
                <Button size="icon" variant="ghost" onClick={onEdit} data-testid={`button-edit-contact-${contact.id}`}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon" variant="ghost" onClick={onDelete} data-testid={`button-delete-contact-${contact.id}`}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
        </div>
        <div className="mt-3 space-y-1.5">
          {contact.contactName && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <User className="h-3.5 w-3.5 shrink-0" />
              <span data-testid={`text-contact-name-${contact.id}`}>{contact.contactName}</span>
            </div>
          )}
          {contact.phone && (
            <a href={`tel:${contact.phone}`} className="flex items-center gap-2 text-sm text-primary hover:underline" data-testid={`link-phone-${contact.id}`}>
              <Phone className="h-3.5 w-3.5 shrink-0" />
              {contact.phone}
            </a>
          )}
          {contact.email && (
            <a href={`mailto:${contact.email}`} className="flex items-center gap-2 text-sm text-primary hover:underline" data-testid={`link-email-${contact.id}`}>
              <Mail className="h-3.5 w-3.5 shrink-0" />
              {contact.email}
            </a>
          )}
          {contact.address && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span data-testid={`text-address-${contact.id}`}>{contact.address}</span>
            </div>
          )}
        </div>
        {contact.notes && (
          <p className="mt-2 text-xs text-muted-foreground" data-testid={`text-notes-${contact.id}`}>
            {contact.notes}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Add/Edit contact dialog ───────────────────────────────────
function EditContactDialog({
  contact, open, categories, onClose,
}: {
  contact: Subcontractor | null;
  open: boolean;
  categories: CostCategory[];
  onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isNew = !contact;

  const [formData, setFormData] = useState<Record<string, string | boolean>>({});

  const resetForm = (c: Subcontractor | null) => {
    setFormData(c ? {
      businessName: c.businessName,
      contactName: c.contactName || "",
      phone: c.phone || "",
      email: c.email || "",
      categoryId: c.categoryId ? String(c.categoryId) : "",
      trade: c.trade || "",
      hourlyRate: c.hourlyRate || "",
      dailyRate: c.dailyRate || "",
      unitRate: c.unitRate || "",
      unitType: c.unitType || "hour",
      isPreferred: c.isPreferred || false,
      address: c.address || "",
      notes: c.notes || "",
    } : {
      businessName: "", contactName: "", phone: "", email: "",
      categoryId: "", trade: "", hourlyRate: "", dailyRate: "",
      unitRate: "", unitType: "hour", isPreferred: false, address: "", notes: "",
    });
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) resetForm(contact);
    if (!isOpen) onClose();
  };

  const mutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      if (contact) {
        await apiRequest("PATCH", `/api/subcontractors/${contact.id}`, data);
      } else {
        await apiRequest("POST", `/api/subcontractors`, data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/subcontractors"] });
      toast({ title: contact ? "Contact updated" : "Contact added" });
      onClose();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to save contact", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const catId = formData.categoryId as string;
    const cat = catId ? categories.find(c => c.id === parseInt(catId)) : null;
    const payload: Record<string, unknown> = {
      businessName: formData.businessName as string,
      isPreferred: formData.isPreferred as boolean,
      categoryId: catId ? parseInt(catId) : null,
      trade: cat?.name || (formData.trade as string) || null,
    };
    const optionalFields = ["contactName", "phone", "email", "hourlyRate", "dailyRate", "unitRate", "unitType", "address", "notes"];
    for (const field of optionalFields) {
      const val = formData[field] as string;
      payload[field] = val || null;
    }
    mutation.mutate(payload);
  };

  const updateField = (field: string, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle data-testid="text-dialog-title">{isNew ? "Add Contact" : "Edit Contact"}</DialogTitle>
          <DialogDescription>
            {isNew ? "Add a new trade contact to your directory." : "Update the contact details."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="businessName">Business Name *</Label>
            <Input
              id="businessName"
              value={(formData.businessName as string) || ""}
              onChange={e => updateField("businessName", e.target.value)}
              required
              data-testid="input-business-name"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="contactName">Contact Name</Label>
              <Input id="contactName" value={(formData.contactName as string) || ""} onChange={e => updateField("contactName", e.target.value)} data-testid="input-contact-name" />
            </div>
            <div className="space-y-2">
              <Label>Trade / Category</Label>
              <Select value={(formData.categoryId as string) || ""} onValueChange={v => {
                const cat = categories.find(c => c.id === parseInt(v));
                updateField("categoryId", v);
                updateField("trade", cat?.name || "");
              }}>
                <SelectTrigger data-testid="select-trade-category"><SelectValue placeholder="Select trade" /></SelectTrigger>
                <SelectContent>
                  {categories.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" value={(formData.phone as string) || ""} onChange={e => updateField("phone", e.target.value)} data-testid="input-phone" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={(formData.email as string) || ""} onChange={e => updateField("email", e.target.value)} data-testid="input-email" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <Input id="address" value={(formData.address as string) || ""} onChange={e => updateField("address", e.target.value)} data-testid="input-address" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="hourlyRate">Hourly Rate</Label>
              <Input id="hourlyRate" type="number" step="0.01" value={(formData.hourlyRate as string) || ""} onChange={e => updateField("hourlyRate", e.target.value)} placeholder="85" data-testid="input-hourly-rate" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dailyRate">Daily Rate</Label>
              <Input id="dailyRate" type="number" step="0.01" value={(formData.dailyRate as string) || ""} onChange={e => updateField("dailyRate", e.target.value)} placeholder="650" data-testid="input-daily-rate" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="unitRate">Unit Rate</Label>
              <Input id="unitRate" type="number" step="0.01" value={(formData.unitRate as string) || ""} onChange={e => updateField("unitRate", e.target.value)} placeholder="12" data-testid="input-unit-rate" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" value={(formData.notes as string) || ""} onChange={e => updateField("notes", e.target.value)} className="resize-none" rows={3} data-testid="input-notes" />
          </div>
          <div className="flex items-center gap-3">
            <Switch id="isPreferred" checked={(formData.isPreferred as boolean) || false} onCheckedChange={val => updateField("isPreferred", val)} data-testid="switch-preferred" />
            <Label htmlFor="isPreferred">Go-to / Preferred contact</Label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} data-testid="button-cancel-edit">Cancel</Button>
            <Button type="submit" disabled={mutation.isPending || !(formData.businessName as string)?.trim()} data-testid="button-save-contact">
              {mutation.isPending ? "Saving..." : isNew ? "Add Contact" : "Save Changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
