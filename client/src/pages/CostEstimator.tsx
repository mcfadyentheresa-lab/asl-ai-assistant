import { useState } from "react";
import { useParams, Link } from "wouter";
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
import {
  Calculator, Plus, Trash2, AlertTriangle, CheckCircle2,
  DollarSign, ArrowLeft, Receipt as ReceiptIcon, EyeOff,
  TrendingUp, TrendingDown, Minus, Loader2
} from "lucide-react";
import type { CostCategory, MarketRate, ProjectEstimate, EstimateItem, Receipt, EstimateWarning, Project } from "@shared/schema";

export default function CostEstimator() {
  const { id } = useParams<{ id: string }>();
  const projectId = parseInt(id || "0");
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isAdmin = (user as any)?.role === "admin";
  const isCrew = (user as any)?.role === "crew";
  const canEdit = isAdmin || isCrew;

  const [showAddItem, setShowAddItem] = useState(false);
  const [showAddReceipt, setShowAddReceipt] = useState(false);
  const [viewMode, setViewMode] = useState<"all" | "sq_ft" | "board">("all");

  const [newItem, setNewItem] = useState({
    categoryId: "", customCategory: "", unitType: "sq_ft",
    quantity: "", unitCost: "", materialCost: "", laborCost: "", notes: "", isCustomRate: false,
  });

  const [newReceipt, setNewReceipt] = useState({
    vendor: "", description: "", date: new Date().toISOString().split("T")[0], amount: "", estimateItemId: "",
  });

  const { data: project } = useQuery<Project>({ queryKey: ["/api/projects", projectId] });
  const { data: categories = [] } = useQuery<CostCategory[]>({ queryKey: ["/api/cost-categories"] });
  const { data: marketRates = [] } = useQuery<MarketRate[]>({ queryKey: ["/api/market-rates"] });
  const { data: estimates = [] } = useQuery<ProjectEstimate[]>({ queryKey: ["/api/projects", projectId, "estimates"] });

  const activeEstimate = estimates[0];

  const { data: items = [] } = useQuery<EstimateItem[]>({
    queryKey: ["/api/estimates", activeEstimate?.id, "items"],
    enabled: !!activeEstimate,
  });
  const { data: warnings = [] } = useQuery<EstimateWarning[]>({
    queryKey: ["/api/estimates", activeEstimate?.id, "warnings"],
    enabled: !!activeEstimate,
  });
  const { data: receipts = [] } = useQuery<Receipt[]>({
    queryKey: ["/api/projects", projectId, "receipts"],
  });

  const createEstimateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/estimates`, { name: "Main Estimate" });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "estimates"] }),
  });

  const updateEstimateMutation = useMutation({
    mutationFn: async (updates: any) => {
      const res = await apiRequest("PATCH", `/api/estimates/${activeEstimate?.id}`, updates);
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "estimates"] }),
  });

  const addItemMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", `/api/estimates/${activeEstimate?.id}/items`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", activeEstimate?.id, "items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", activeEstimate?.id, "warnings"] });
      setShowAddItem(false);
      setNewItem({ categoryId: "", customCategory: "", unitType: "sq_ft", quantity: "", unitCost: "", materialCost: "", laborCost: "", notes: "", isCustomRate: false });
      toast({ title: "Line item added" });
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (itemId: number) => { await apiRequest("DELETE", `/api/estimate-items/${itemId}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", activeEstimate?.id, "items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", activeEstimate?.id, "warnings"] });
    },
  });

  const addReceiptMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/receipts`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "receipts"] });
      setShowAddReceipt(false);
      setNewReceipt({ vendor: "", description: "", date: new Date().toISOString().split("T")[0], amount: "", estimateItemId: "" });
      toast({ title: "Receipt added" });
    },
  });

  const deleteReceiptMutation = useMutation({
    mutationFn: async (receiptId: number) => { await apiRequest("DELETE", `/api/receipts/${receiptId}`); },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "receipts"] }),
  });

  const ignoreWarningMutation = useMutation({
    mutationFn: async (warningId: number) => {
      const res = await apiRequest("POST", `/api/warnings/${warningId}/ignore`);
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/estimates", activeEstimate?.id, "warnings"] }),
  });

  function onCategoryChange(catId: string) {
    const cat = categories.find(c => c.id === parseInt(catId));
    const rate = marketRates.find(r => r.categoryId === parseInt(catId) && r.isActive);
    setNewItem(prev => ({
      ...prev,
      categoryId: catId,
      unitType: cat?.defaultUnitType || "sq_ft",
      unitCost: rate ? rate.typicalRate : prev.unitCost,
    }));
  }

  const markupRate = activeEstimate?.markupEnabled ? parseFloat(activeEstimate.markupPercent || "25") / 100 : 0;

  const itemTotals = items.map(item => {
    const qty = parseFloat(item.quantity) || 0;
    const unitCost = parseFloat(item.unitCost) || 0;
    const matCost = parseFloat(item.materialCost) || 0;
    const lineTotal = qty * unitCost;
    const materialMarkup = matCost * markupRate;
    return {
      ...item,
      lineTotal,
      materialMarkup,
      totalWithMarkup: lineTotal + materialMarkup,
      categoryName: item.categoryId ? categories.find(c => c.id === item.categoryId)?.name || "Unknown" : item.customCategory || "Custom",
    };
  });

  const filteredItems = viewMode === "all" ? itemTotals : itemTotals.filter(i => i.unitType === viewMode);
  const grandTotal = itemTotals.reduce((sum, i) => sum + i.lineTotal, 0);
  const totalMarkup = itemTotals.reduce((sum, i) => sum + i.materialMarkup, 0);
  const grandTotalWithMarkup = grandTotal + totalMarkup;
  const totalReceipts = receipts.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
  const variance = grandTotalWithMarkup > 0 ? ((totalReceipts - grandTotalWithMarkup) / grandTotalWithMarkup) * 100 : 0;
  const activeWarnings = warnings.filter(w => !w.ignored);

  function getVarianceStatus() {
    if (grandTotalWithMarkup === 0) return { label: "No Estimate", color: "secondary" as const, icon: Minus };
    if (Math.abs(variance) <= 5) return { label: "On Track", color: "default" as const, icon: CheckCircle2 };
    if (variance < -5) return { label: "Under Budget", color: "default" as const, icon: TrendingDown };
    return { label: "Over Budget", color: "destructive" as const, icon: TrendingUp };
  }
  const varianceStatus = getVarianceStatus();

  function handleAddItem() {
    if (!newItem.quantity || !newItem.unitCost) {
      toast({ title: "Please fill in quantity and unit cost", variant: "destructive" });
      return;
    }
    addItemMutation.mutate({
      categoryId: newItem.categoryId ? parseInt(newItem.categoryId) : null,
      customCategory: newItem.customCategory || null,
      unitType: newItem.unitType,
      quantity: newItem.quantity,
      unitCost: newItem.unitCost,
      materialCost: newItem.materialCost || "0",
      laborCost: newItem.laborCost || "0",
      notes: newItem.notes || null,
      isCustomRate: newItem.isCustomRate,
    });
  }

  function handleAddReceipt() {
    if (!newReceipt.vendor || !newReceipt.amount) {
      toast({ title: "Please fill in vendor and amount", variant: "destructive" });
      return;
    }
    addReceiptMutation.mutate({
      vendor: newReceipt.vendor,
      description: newReceipt.description || null,
      date: newReceipt.date,
      amount: newReceipt.amount,
      estimateItemId: newReceipt.estimateItemId && newReceipt.estimateItemId !== "none" ? parseInt(newReceipt.estimateItemId) : null,
    });
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center gap-3 flex-wrap">
          <Link href={`/project/${projectId}`}>
            <Button variant="ghost" size="sm" data-testid="button-back-to-project">
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-page-title">Cost Estimator</h1>
            <p className="text-sm text-muted-foreground" data-testid="text-project-name">{project.name}</p>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-sm">View:</Label>
            <Select value={viewMode} onValueChange={(v: any) => setViewMode(v)}>
              <SelectTrigger className="w-[140px]" data-testid="select-view-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Items</SelectItem>
                <SelectItem value="sq_ft">Per Sq Ft</SelectItem>
                <SelectItem value="board">Per Board/Unit</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {!activeEstimate && canEdit && (
          <Card>
            <CardContent className="py-8 text-center">
              <Calculator className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground mb-4">No estimate has been created for this project yet.</p>
              <Button onClick={() => createEstimateMutation.mutate()} disabled={createEstimateMutation.isPending} data-testid="button-create-estimate">
                <Plus className="h-4 w-4 mr-2" /> Create Estimate
              </Button>
            </CardContent>
          </Card>
        )}

        {activeEstimate && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-4 pb-3">
                  <div className="text-xs text-muted-foreground uppercase tracking-wide">Estimated Total</div>
                  <div className="text-2xl font-semibold mt-1" data-testid="text-grand-total">
                    ${grandTotalWithMarkup.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  {totalMarkup > 0 && (
                    <div className="text-xs text-muted-foreground">incl. ${totalMarkup.toLocaleString("en-CA", { minimumFractionDigits: 2 })} markup</div>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3">
                  <div className="text-xs text-muted-foreground uppercase tracking-wide">Actual Spend</div>
                  <div className="text-2xl font-semibold mt-1" data-testid="text-total-receipts">
                    ${totalReceipts.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div className="text-xs text-muted-foreground">{receipts.length} receipt{receipts.length !== 1 ? "s" : ""}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3">
                  <div className="text-xs text-muted-foreground uppercase tracking-wide">Variance</div>
                  <div className="text-2xl font-semibold mt-1" data-testid="text-variance">
                    {variance !== 0 ? `${variance > 0 ? "+" : ""}${variance.toFixed(1)}%` : "--"}
                  </div>
                  <Badge variant={varianceStatus.color} className="text-xs mt-1" data-testid="badge-variance-status">
                    <varianceStatus.icon className="h-3 w-3 mr-1" />
                    {varianceStatus.label}
                  </Badge>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3">
                  <div className="text-xs text-muted-foreground uppercase tracking-wide">Warnings</div>
                  <div className="text-2xl font-semibold mt-1" data-testid="text-warning-count">{activeWarnings.length}</div>
                  {activeWarnings.length > 0 && (
                    <Badge variant="destructive" className="text-xs mt-1">
                      <AlertTriangle className="h-3 w-3 mr-1" /> Needs Review
                    </Badge>
                  )}
                </CardContent>
              </Card>
            </div>

            {canEdit && (
              <Card>
                <CardContent className="py-3 flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={activeEstimate.markupEnabled ?? true}
                      onCheckedChange={(checked) => updateEstimateMutation.mutate({ markupEnabled: checked })}
                      data-testid="switch-markup"
                    />
                    <Label>Apply {activeEstimate.markupPercent || "25"}% markup on materials</Label>
                  </div>
                  {activeEstimate.markupEnabled && (
                    <div className="flex items-center gap-2">
                      <Label className="text-sm">Markup %:</Label>
                      <Input
                        type="number"
                        className="w-20"
                        value={activeEstimate.markupPercent || "25"}
                        onChange={(e) => updateEstimateMutation.mutate({ markupPercent: e.target.value })}
                        data-testid="input-markup-percent"
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {activeWarnings.length > 0 && (
              <div className="space-y-2">
                {activeWarnings.map(w => (
                  <div key={w.id} className="flex items-center gap-3 p-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950" data-testid={`warning-${w.id}`}>
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                    <span className="text-sm flex-1">{w.message}</span>
                    <Button variant="ghost" size="sm" onClick={() => ignoreWarningMutation.mutate(w.id)} data-testid={`button-ignore-warning-${w.id}`}>
                      <EyeOff className="h-3 w-3 mr-1" /> Ignore
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-lg">Estimate Line Items</CardTitle>
                {canEdit && (
                  <Button size="sm" onClick={() => setShowAddItem(true)} data-testid="button-add-line-item">
                    <Plus className="h-4 w-4 mr-1" /> Add Item
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {filteredItems.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-6">
                    {items.length === 0 ? "No line items yet. Add your first estimate item." : "No items match the selected view."}
                  </p>
                ) : (
                  <div className="space-y-2">
                    <div className="hidden md:grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide px-2">
                      <div className="col-span-3">Category</div>
                      <div className="col-span-1">Type</div>
                      <div className="col-span-2 text-right">Qty</div>
                      <div className="col-span-2 text-right">Unit Cost</div>
                      <div className="col-span-2 text-right">Material</div>
                      <div className="col-span-2 text-right">Line Total</div>
                    </div>
                    {filteredItems.map(item => {
                      const itemWarnings = warnings.filter(w => w.estimateItemId === item.id && !w.ignored);
                      return (
                        <div key={item.id} className={`grid grid-cols-2 md:grid-cols-12 gap-2 items-center p-2 rounded-md border ${itemWarnings.length > 0 ? 'border-amber-300 bg-amber-50/50 dark:border-amber-700 dark:bg-amber-950/30' : 'border-border'}`} data-testid={`estimate-item-${item.id}`}>
                          <div className="col-span-2 md:col-span-3 text-sm font-medium flex items-center gap-1">
                            {itemWarnings.length > 0 && <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />}
                            {item.categoryName}
                            {item.isCustomRate && <Badge variant="outline" className="text-[10px] ml-1">Custom</Badge>}
                          </div>
                          <div className="hidden md:block md:col-span-1">
                            <Badge variant="outline" className="text-[10px]">{item.unitType === "sq_ft" ? "sq ft" : "unit"}</Badge>
                          </div>
                          <div className="text-right text-sm md:col-span-2">{parseFloat(item.quantity).toLocaleString()}</div>
                          <div className="text-right text-sm md:col-span-2">${parseFloat(item.unitCost).toFixed(2)}</div>
                          <div className="text-right text-sm md:col-span-2">${parseFloat(item.materialCost).toFixed(2)}</div>
                          <div className="text-right text-sm font-medium flex items-center justify-end gap-1 md:col-span-2">
                            ${item.totalWithMarkup.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            {canEdit && (
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 ml-1" onClick={() => deleteItemMutation.mutate(item.id)} data-testid={`button-delete-item-${item.id}`}>
                                <Trash2 className="h-3 w-3 text-muted-foreground" />
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    <div className="grid grid-cols-2 md:grid-cols-12 gap-2 pt-3 mt-2 border-t px-2">
                      <div className="md:col-span-8 text-sm font-semibold">Subtotal</div>
                      <div className="md:col-span-4 text-right text-sm font-semibold" data-testid="text-subtotal">
                        ${grandTotal.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>
                    {totalMarkup > 0 && (
                      <div className="grid grid-cols-2 md:grid-cols-12 gap-2 px-2">
                        <div className="md:col-span-8 text-sm text-muted-foreground">Material Markup ({activeEstimate.markupPercent || "25"}%)</div>
                        <div className="md:col-span-4 text-right text-sm text-muted-foreground" data-testid="text-markup-total">
                          +${totalMarkup.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-2 md:grid-cols-12 gap-2 px-2 pb-1">
                      <div className="md:col-span-8 text-base font-bold">Grand Total</div>
                      <div className="md:col-span-4 text-right text-base font-bold" data-testid="text-grand-total-bottom">
                        ${grandTotalWithMarkup.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <ReceiptIcon className="h-5 w-5" /> Receipts & Actual Spend
                </CardTitle>
                {canEdit && (
                  <Button size="sm" onClick={() => setShowAddReceipt(true)} data-testid="button-add-receipt">
                    <Plus className="h-4 w-4 mr-1" /> Add Receipt
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {receipts.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-6">No receipts added yet. Add receipts to compare against your estimate.</p>
                ) : (
                  <div className="space-y-2">
                    {receipts.map(r => {
                      const linkedItem = r.estimateItemId ? itemTotals.find(i => i.id === r.estimateItemId) : null;
                      return (
                        <div key={r.id} className="flex items-center gap-3 p-3 rounded-md border" data-testid={`receipt-${r.id}`}>
                          <DollarSign className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium">{r.vendor}</div>
                            <div className="text-xs text-muted-foreground">
                              {r.date} {r.description && `· ${r.description}`}
                              {linkedItem && ` · Linked: ${linkedItem.categoryName}`}
                            </div>
                          </div>
                          <div className="text-sm font-semibold">${parseFloat(r.amount).toLocaleString("en-CA", { minimumFractionDigits: 2 })}</div>
                          {canEdit && (
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => deleteReceiptMutation.mutate(r.id)} data-testid={`button-delete-receipt-${r.id}`}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      );
                    })}
                    <div className="flex justify-between pt-3 border-t">
                      <span className="text-sm font-semibold">Total Actual Spend</span>
                      <span className="text-sm font-semibold" data-testid="text-total-actual">${totalReceipts.toLocaleString("en-CA", { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <Dialog open={showAddItem} onOpenChange={setShowAddItem}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Estimate Line Item</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Switch checked={newItem.isCustomRate} onCheckedChange={(checked) => setNewItem(prev => ({ ...prev, isCustomRate: checked }))} data-testid="switch-custom-rate" />
              <Label>Use custom pricing</Label>
            </div>

            {!newItem.isCustomRate ? (
              <div>
                <Label>Category</Label>
                <Select value={newItem.categoryId} onValueChange={onCategoryChange}>
                  <SelectTrigger data-testid="select-category"><SelectValue placeholder="Select category..." /></SelectTrigger>
                  <SelectContent>
                    {categories.map(c => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div>
                <Label>Custom Category Name</Label>
                <Input value={newItem.customCategory} onChange={(e) => setNewItem(prev => ({ ...prev, customCategory: e.target.value }))} placeholder="e.g., Custom Stonework" data-testid="input-custom-category" />
              </div>
            )}

            <div>
              <Label>Pricing Type</Label>
              <Select value={newItem.unitType} onValueChange={(v) => setNewItem(prev => ({ ...prev, unitType: v }))}>
                <SelectTrigger data-testid="select-unit-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sq_ft">Per Square Foot</SelectItem>
                  <SelectItem value="board">Per Board / Unit</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Quantity ({newItem.unitType === "sq_ft" ? "sq ft" : "units"})</Label>
                <Input type="number" value={newItem.quantity} onChange={(e) => setNewItem(prev => ({ ...prev, quantity: e.target.value }))} placeholder="0" data-testid="input-quantity" />
              </div>
              <div>
                <Label>Unit Cost ($)</Label>
                <Input type="number" step="0.01" value={newItem.unitCost} onChange={(e) => setNewItem(prev => ({ ...prev, unitCost: e.target.value }))} placeholder="0.00" data-testid="input-unit-cost" />
                {!newItem.isCustomRate && newItem.categoryId && (() => {
                  const rate = marketRates.find(r => r.categoryId === parseInt(newItem.categoryId) && r.isActive);
                  return rate ? (
                    <p className="text-xs text-muted-foreground mt-1">Market: ${rate.lowRate} - ${rate.highRate} / {newItem.unitType === "sq_ft" ? "sq ft" : "unit"}</p>
                  ) : null;
                })()}
              </div>
            </div>

            <div>
              <Label>Material Cost ($) <span className="text-muted-foreground text-xs">(for markup calculation)</span></Label>
              <Input type="number" step="0.01" value={newItem.materialCost} onChange={(e) => setNewItem(prev => ({ ...prev, materialCost: e.target.value }))} placeholder="0.00" data-testid="input-material-cost" />
            </div>

            <div>
              <Label>Notes</Label>
              <Input value={newItem.notes} onChange={(e) => setNewItem(prev => ({ ...prev, notes: e.target.value }))} placeholder="Optional notes..." data-testid="input-item-notes" />
            </div>

            <Button className="w-full" onClick={handleAddItem} disabled={addItemMutation.isPending} data-testid="button-submit-item">
              {addItemMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              Add Line Item
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showAddReceipt} onOpenChange={setShowAddReceipt}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Receipt</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Vendor</Label>
              <Input value={newReceipt.vendor} onChange={(e) => setNewReceipt(prev => ({ ...prev, vendor: e.target.value }))} placeholder="e.g., Home Hardware" data-testid="input-receipt-vendor" />
            </div>
            <div>
              <Label>Amount ($)</Label>
              <Input type="number" step="0.01" value={newReceipt.amount} onChange={(e) => setNewReceipt(prev => ({ ...prev, amount: e.target.value }))} placeholder="0.00" data-testid="input-receipt-amount" />
            </div>
            <div>
              <Label>Date</Label>
              <Input type="date" value={newReceipt.date} onChange={(e) => setNewReceipt(prev => ({ ...prev, date: e.target.value }))} data-testid="input-receipt-date" />
            </div>
            <div>
              <Label>Description</Label>
              <Input value={newReceipt.description} onChange={(e) => setNewReceipt(prev => ({ ...prev, description: e.target.value }))} placeholder="Optional description..." data-testid="input-receipt-description" />
            </div>
            <div>
              <Label>Link to Estimate Item</Label>
              <Select value={newReceipt.estimateItemId} onValueChange={(v) => setNewReceipt(prev => ({ ...prev, estimateItemId: v }))}>
                <SelectTrigger data-testid="select-receipt-item"><SelectValue placeholder="None (general)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (general receipt)</SelectItem>
                  {itemTotals.map(i => (
                    <SelectItem key={i.id} value={String(i.id)}>{i.categoryName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full" onClick={handleAddReceipt} disabled={addReceiptMutation.isPending} data-testid="button-submit-receipt">
              {addReceiptMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ReceiptIcon className="h-4 w-4 mr-2" />}
              Add Receipt
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
