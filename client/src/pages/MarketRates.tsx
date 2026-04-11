import { useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TrendingUp, Plus, Pencil, DollarSign, Loader2, Calendar, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import type { CostCategory, MarketRate } from "@shared/schema";

export default function MarketRates() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isAdmin = (user as any)?.role === "admin";

  const [showAddRate, setShowAddRate] = useState(false);
  const [editingRate, setEditingRate] = useState<MarketRate | null>(null);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string>("all");

  const [newRate, setNewRate] = useState({
    categoryId: "", unitType: "sq_ft", lowRate: "", typicalRate: "", highRate: "",
    effectiveDate: new Date().toISOString().split("T")[0], notes: "",
  });

  const [newCategory, setNewCategory] = useState({ name: "", description: "", defaultUnitType: "sq_ft" });

  const { data: categories = [] } = useQuery<CostCategory[]>({ queryKey: ["/api/cost-categories"] });
  const { data: rates = [], isLoading } = useQuery<MarketRate[]>({ queryKey: ["/api/market-rates"] });

  const addRateMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/market-rates", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/market-rates"] });
      setShowAddRate(false);
      setNewRate({ categoryId: "", unitType: "sq_ft", lowRate: "", typicalRate: "", highRate: "", effectiveDate: new Date().toISOString().split("T")[0], notes: "" });
      toast({ title: "Market rate added" });
    },
  });

  const updateRateMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const res = await apiRequest("PATCH", `/api/market-rates/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/market-rates"] });
      setEditingRate(null);
      toast({ title: "Market rate updated" });
    },
  });

  const addCategoryMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/cost-categories", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cost-categories"] });
      setShowAddCategory(false);
      setNewCategory({ name: "", description: "", defaultUnitType: "sq_ft" });
      toast({ title: "Category added" });
    },
  });

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

  const activeRates = rates.filter(r => r.isActive);
  const groupedByCategory = categories.map(cat => ({
    category: cat,
    rates: activeRates.filter(r => r.categoryId === cat.id),
    latestRate: activeRates.find(r => r.categoryId === cat.id),
  }));

  const filtered = filterCategory === "all" ? groupedByCategory : groupedByCategory.filter(g => String(g.category.id) === filterCategory);

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="max-w-4xl mx-auto px-4 py-20 text-center">
          <p className="text-muted-foreground">Admin access required to manage market rates.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="icon" className="h-8 w-8" data-testid="button-back">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
            <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-page-title">Market Rates</h1>
            <p className="text-sm text-muted-foreground">Manage baseline pricing for high-end Muskoka renovations (CAD)</p>
          </div>
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

        <div className="flex items-center gap-2">
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

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {filtered.map(({ category, latestRate }) => (
              <Card key={category.id} data-testid={`category-card-${category.id}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{category.name}</CardTitle>
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
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingRate(latestRate)}
                          data-testid={`button-edit-rate-${category.id}`}
                        >
                          <Pencil className="h-3 w-3 mr-1" /> Edit
                        </Button>
                      </div>
                      {latestRate.notes && (
                        <p className="text-xs text-muted-foreground italic">{latestRate.notes}</p>
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
      </div>

      <Dialog open={showAddRate} onOpenChange={setShowAddRate}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Market Rate</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Category</Label>
              <Select value={newRate.categoryId} onValueChange={(v) => {
                const cat = categories.find(c => c.id === parseInt(v));
                setNewRate(prev => ({ ...prev, categoryId: v, unitType: cat?.defaultUnitType || "sq_ft" }));
              }}>
                <SelectTrigger data-testid="select-rate-category"><SelectValue placeholder="Select category..." /></SelectTrigger>
                <SelectContent>
                  {categories.map(c => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Unit Type</Label>
              <Select value={newRate.unitType} onValueChange={(v) => setNewRate(prev => ({ ...prev, unitType: v }))}>
                <SelectTrigger data-testid="select-rate-unit"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sq_ft">Per Square Foot</SelectItem>
                  <SelectItem value="board">Per Board / Unit</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label>Low ($)</Label>
                <Input type="number" step="0.01" value={newRate.lowRate} onChange={(e) => setNewRate(prev => ({ ...prev, lowRate: e.target.value }))} data-testid="input-rate-low" />
              </div>
              <div>
                <Label>Typical ($)</Label>
                <Input type="number" step="0.01" value={newRate.typicalRate} onChange={(e) => setNewRate(prev => ({ ...prev, typicalRate: e.target.value }))} data-testid="input-rate-typical" />
              </div>
              <div>
                <Label>High ($)</Label>
                <Input type="number" step="0.01" value={newRate.highRate} onChange={(e) => setNewRate(prev => ({ ...prev, highRate: e.target.value }))} data-testid="input-rate-high" />
              </div>
            </div>
            <div>
              <Label>Effective Date</Label>
              <Input type="date" value={newRate.effectiveDate} onChange={(e) => setNewRate(prev => ({ ...prev, effectiveDate: e.target.value }))} data-testid="input-rate-date" />
            </div>
            <div>
              <Label>Notes</Label>
              <Input value={newRate.notes} onChange={(e) => setNewRate(prev => ({ ...prev, notes: e.target.value }))} placeholder="e.g., Updated for 2026 season" data-testid="input-rate-notes" />
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
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Market Rate</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="text-sm font-medium">{categories.find(c => c.id === editingRate.categoryId)?.name}</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <Label>Low ($)</Label>
                  <Input type="number" step="0.01" defaultValue={editingRate.lowRate}
                    onChange={(e) => setEditingRate(prev => prev ? { ...prev, lowRate: e.target.value } : null)}
                    data-testid="input-edit-low" />
                </div>
                <div>
                  <Label>Typical ($)</Label>
                  <Input type="number" step="0.01" defaultValue={editingRate.typicalRate}
                    onChange={(e) => setEditingRate(prev => prev ? { ...prev, typicalRate: e.target.value } : null)}
                    data-testid="input-edit-typical" />
                </div>
                <div>
                  <Label>High ($)</Label>
                  <Input type="number" step="0.01" defaultValue={editingRate.highRate}
                    onChange={(e) => setEditingRate(prev => prev ? { ...prev, highRate: e.target.value } : null)}
                    data-testid="input-edit-high" />
                </div>
              </div>
              <div>
                <Label>Notes</Label>
                <Input defaultValue={editingRate.notes || ""} onChange={(e) => setEditingRate(prev => prev ? { ...prev, notes: e.target.value } : null)} data-testid="input-edit-notes" />
              </div>
              <Button className="w-full" onClick={() => {
                if (!editingRate) return;
                updateRateMutation.mutate({
                  id: editingRate.id,
                  lowRate: editingRate.lowRate,
                  typicalRate: editingRate.typicalRate,
                  highRate: editingRate.highRate,
                  notes: editingRate.notes,
                });
              }} disabled={updateRateMutation.isPending} data-testid="button-save-rate">
                {updateRateMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Pencil className="h-4 w-4 mr-2" />}
                Save Changes
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={showAddCategory} onOpenChange={setShowAddCategory}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Cost Category</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input value={newCategory.name} onChange={(e) => setNewCategory(prev => ({ ...prev, name: e.target.value }))} placeholder="e.g., Solar Panels" data-testid="input-category-name" />
            </div>
            <div>
              <Label>Description</Label>
              <Input value={newCategory.description} onChange={(e) => setNewCategory(prev => ({ ...prev, description: e.target.value }))} placeholder="Brief description..." data-testid="input-category-description" />
            </div>
            <div>
              <Label>Default Unit Type</Label>
              <Select value={newCategory.defaultUnitType} onValueChange={(v) => setNewCategory(prev => ({ ...prev, defaultUnitType: v }))}>
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
