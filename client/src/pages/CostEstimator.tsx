import { useState, useRef } from "react";
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
  DollarSign, ArrowLeft, Receipt as ReceiptIcon, EyeOff, Pencil,
  TrendingUp, TrendingDown, Minus, Loader2, Sparkles, Shapes, ChevronDown, ChevronRight,
  Wallet, Lightbulb, ArrowDownRight, ExternalLink, Home, Store
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import type { CostCategory, MarketRate, ProjectEstimate, EstimateItem, Receipt, EstimateWarning, Project, CrewRate, Subcontractor, Supplier, SupplierPrice } from "@shared/schema";

export default function CostEstimator() {
  const { id } = useParams<{ id: string }>();
  const projectId = parseInt(id || "0");
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isAdmin = (user as any)?.role === "admin";
  const isCrew = (user as any)?.role === "crew";
  const canEdit = isAdmin;

  const [showAddItem, setShowAddItem] = useState(false);
  const [showAddReceipt, setShowAddReceipt] = useState(false);
  const [viewMode, setViewMode] = useState<"all" | "sq_ft" | "board" | "room">("all");
  const [showAiAnalyzer, setShowAiAnalyzer] = useState(false);
  const [showBoardImport, setShowBoardImport] = useState(false);
  const [expandedBoards, setExpandedBoards] = useState<Set<number>>(new Set());
  const [aiDescription, setAiDescription] = useState("");
  const [aiResults, setAiResults] = useState<any>(null);
  const [showAlternatives, setShowAlternatives] = useState(false);
  const [alternativesResults, setAlternativesResults] = useState<any>(null);
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetInput, setBudgetInput] = useState("");
  const [editingContingency, setEditingContingency] = useState(false);
  const [contingencyInput, setContingencyInput] = useState("");

  const [newItem, setNewItem] = useState({
    categoryId: "", customCategory: "", unitType: "sq_ft",
    quantity: "", unitCost: "", materialCost: "", laborCost: "", notes: "", isCustomRate: false,
    length: "", width: "", crewCount: "1", room: "", productUrl: "",
  });

  const [newReceipt, setNewReceipt] = useState<{
    vendor: string; description: string; date: string; amount: string; estimateItemId: string;
    lineItems: Array<{ description: string; qty: number; unitPrice: number; subtotal: number }>;
  }>({
    vendor: "", description: "", date: new Date().toISOString().split("T")[0], amount: "", estimateItemId: "", lineItems: [],
  });
  const [expandedReceipts, setExpandedReceipts] = useState<Set<number>>(new Set());
  const [priceBookImport, setPriceBookImport] = useState<{
    enabled: boolean;
    supplierId: string;
    items: Array<{ checked: boolean; productName: string; categoryId: string; unitPrice: string }>;
  }>({ enabled: false, supplierId: "", items: [] });
  const priceBookImportRef = useRef(priceBookImport);
  priceBookImportRef.current = priceBookImport;

  const { data: project } = useQuery<Project>({ queryKey: ["/api/projects", projectId] });
  const { data: categories = [] } = useQuery<CostCategory[]>({ queryKey: ["/api/cost-categories"] });
  const { data: marketRates = [] } = useQuery<MarketRate[]>({ queryKey: ["/api/market-rates"] });
  const { data: estimates = [] } = useQuery<ProjectEstimate[]>({ queryKey: ["/api/projects", projectId, "estimates"] });
  const { data: crewRates = [] } = useQuery<CrewRate[]>({ queryKey: ["/api/crew-rates"], enabled: canEdit });
  const { data: subcontractors = [] } = useQuery<Subcontractor[]>({ queryKey: ["/api/subcontractors"], enabled: canEdit });
  const { data: priceBookSuppliers = [] } = useQuery<Supplier[]>({ queryKey: ["/api/suppliers"], enabled: canEdit });
  const { data: supplierPrices = [] } = useQuery<SupplierPrice[]>({ queryKey: ["/api/supplier-prices"], enabled: canEdit });
  const { data: boardMaterials = [], isLoading: boardMaterialsLoading } = useQuery<any[]>({
    queryKey: ["/api/projects", projectId, "board-materials"],
    enabled: showBoardImport,
  });

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
      setNewItem({ categoryId: "", customCategory: "", unitType: "sq_ft", quantity: "", unitCost: "", materialCost: "", laborCost: "", notes: "", isCustomRate: false, length: "", width: "", crewCount: "1", room: "", productUrl: "" });
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
    onSuccess: async (receipt) => {
      const pb = priceBookImportRef.current;
      let importedCount = 0;
      if (pb.enabled && pb.supplierId) {
        const checkedItems = pb.items.filter(i => i.checked && i.productName.trim() && i.unitPrice);
        if (checkedItems.length > 0) {
          await apiRequest("POST", "/api/supplier-prices/bulk", {
            items: checkedItems.map(i => ({
              supplierId: parseInt(pb.supplierId),
              productName: i.productName.trim(),
              unitPrice: i.unitPrice,
              unitType: "unit",
              categoryId: i.categoryId ? parseInt(i.categoryId) : null,
              sourceReceiptId: receipt.id,
            })),
          });
          queryClient.invalidateQueries({ queryKey: ["/api/supplier-prices"] });
          importedCount = checkedItems.length;
        }
      }
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "receipts"] });
      setShowAddReceipt(false);
      setNewReceipt({ vendor: "", description: "", date: new Date().toISOString().split("T")[0], amount: "", estimateItemId: "", lineItems: [] });
      setPriceBookImport({ enabled: false, supplierId: "", items: [] });
      toast({ title: importedCount > 0 ? `Receipt added · ${importedCount} item(s) sent to Price Book` : "Receipt added" });
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

  const aiAnalyzeMutation = useMutation({
    mutationFn: async (description: string) => {
      const res = await apiRequest("POST", `/api/estimates/${activeEstimate?.id}/ai-analyze`, { description });
      return res.json();
    },
    onSuccess: (data) => {
      setAiResults(data);
      toast({ title: "AI analysis complete", description: data.summary });
    },
    onError: () => {
      toast({ title: "Analysis failed", description: "Could not analyze project scope", variant: "destructive" });
    },
  });

  const suggestAlternativesMutation = useMutation({
    mutationFn: async (budget: string) => {
      const res = await apiRequest("POST", `/api/estimates/${activeEstimate?.id}/suggest-alternatives`, { budget });
      return res.json();
    },
    onSuccess: (data) => {
      setAlternativesResults(data);
      toast({ title: "Suggestions ready", description: data.summary });
    },
    onError: () => {
      toast({ title: "Could not generate suggestions", description: "Please try again", variant: "destructive" });
    },
  });

  const updateItemMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const res = await apiRequest("PATCH", `/api/estimate-items/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", activeEstimate?.id, "items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", activeEstimate?.id, "warnings"] });
      toast({ title: "Line item updated" });
    },
  });

  const [applyingAlt, setApplyingAlt] = useState<number | null>(null);
  const [editingWarningItem, setEditingWarningItem] = useState<number | null>(null);
  const [warningEditCost, setWarningEditCost] = useState("");
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [editItemForm, setEditItemForm] = useState({ quantity: "", unitCost: "", materialCost: "", laborCost: "" });

  async function applyAlternative(suggestion: any) {
    setApplyingAlt(suggestion.itemId);
    try {
      await updateItemMutation.mutateAsync({
        id: suggestion.itemId,
        unitCost: suggestion.estimatedCost,
        notes: suggestion.alternativeName + ": " + suggestion.alternativeDescription
      });
      setAlternativesResults((prev: any) => ({
        ...prev,
        suggestions: prev.suggestions.filter((s: any) => s.itemId !== suggestion.itemId)
      }));
    } catch (error) {
      toast({ title: "Failed to apply alternative", variant: "destructive" });
    } finally {
      setApplyingAlt(null);
    }
  }

  const [applyingAi, setApplyingAi] = useState(false);

  async function applyAiResults() {
    if (!aiResults?.items || applyingAi) return;
    setApplyingAi(true);
    let added = 0;
    try {
      for (const item of aiResults.items) {
        await addItemMutation.mutateAsync({
          categoryId: item.categoryId,
          customCategory: null,
          unitType: item.unitType,
          quantity: item.quantity,
          unitCost: item.unitCost,
          materialCost: item.materialCost || "0",
          laborCost: "0",
          notes: item.notes || null,
          isCustomRate: false,
        });
        added++;
      }
      setAiResults(null);
      setShowAiAnalyzer(false);
      setAiDescription("");
      toast({ title: "Estimate populated", description: `${added} line items added from AI analysis` });
    } catch {
      toast({ title: "Partially applied", description: `${added} of ${aiResults.items.length} items added before an error occurred`, variant: "destructive" });
    } finally {
      setApplyingAi(false);
    }
  }

  function onCategoryChange(catId: string) {
    if (catId === "other") {
      setNewItem(prev => ({
        ...prev,
        categoryId: "other",
        customCategory: prev.customCategory || "",
        unitCost: "",
      }));
      return;
    }
    const cat = categories.find(c => c.id === parseInt(catId));
    const rate = marketRates.find(r => r.categoryId === parseInt(catId) && r.isActive);
    setNewItem(prev => ({
      ...prev,
      categoryId: catId,
      customCategory: "",
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

  const filteredItems = viewMode === "all" || viewMode === "room" ? itemTotals : itemTotals.filter(i => i.unitType === viewMode);
  const grandTotal = itemTotals.reduce((sum, i) => sum + i.lineTotal, 0);
  const totalMarkup = itemTotals.reduce((sum, i) => sum + i.materialMarkup, 0);
  const grandTotalWithMarkup = grandTotal + totalMarkup;
  const contingencyRate = parseFloat(activeEstimate?.contingencyPercent || "0") / 100;
  const contingencyAmount = grandTotalWithMarkup * contingencyRate;
  const managementFeeRate = activeEstimate?.managementFeeEnabled ? parseFloat(activeEstimate.managementFeePercent || "25") / 100 : 0;
  const managementFeeAmount = (grandTotalWithMarkup + contingencyAmount) * managementFeeRate;
  const hstRate = 0.13;
  const subtotalBeforeHST = grandTotalWithMarkup + contingencyAmount + managementFeeAmount;
  const hstAmount = subtotalBeforeHST * hstRate;
  const grandTotalWithHST = subtotalBeforeHST + hstAmount;
  const totalReceipts = receipts.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
  const variance = grandTotalWithHST > 0 ? ((totalReceipts - grandTotalWithHST) / grandTotalWithHST) * 100 : 0;
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
      categoryId: newItem.categoryId && newItem.categoryId !== "other" ? parseInt(newItem.categoryId) : null,
      customCategory: newItem.categoryId === "other" ? (newItem.customCategory || "Other") : (newItem.customCategory || null),
      unitType: newItem.unitType,
      quantity: newItem.quantity,
      unitCost: newItem.unitCost,
      materialCost: newItem.materialCost || "0",
      laborCost: newItem.laborCost || "0",
      notes: newItem.notes || null,
      isCustomRate: newItem.isCustomRate,
      room: newItem.room || null,
      productUrl: newItem.productUrl || null,
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
      lineItems: newReceipt.lineItems.length > 0 ? newReceipt.lineItems : null,
    });
  }

  const [scanning, setScanning] = useState(false);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setScanning(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      
      const uploadRes = await fetch("/api/receipts/upload", {
        method: "POST",
        body: formData,
      });
      
      if (!uploadRes.ok) {
        const errData = await uploadRes.json().catch(() => ({}));
        throw new Error(errData.message || "Upload failed");
      }
      const { url } = await uploadRes.json();

      const scanRes = await apiRequest("POST", `/api/projects/${projectId}/receipts/scan`, { imageUrl: url });
      const data = await scanRes.json();

      const lineItems = Array.isArray(data.lineItems) ? data.lineItems : [];
      setNewReceipt(prev => ({
        ...prev,
        vendor: data.vendor || "",
        amount: data.amount?.toString() || "",
        date: data.date || prev.date,
        lineItems,
      }));
      if (lineItems.length > 0) {
        const firstSupplier = priceBookSuppliers[0];
        setPriceBookImport({
          enabled: false,
          supplierId: firstSupplier ? String(firstSupplier.id) : "",
          items: lineItems.map((item: { description: string; unitPrice: number }) => ({
            checked: true,
            productName: item.description,
            categoryId: "",
            unitPrice: String(item.unitPrice),
          })),
        });
      }
      toast({ title: `Receipt scanned — ${lineItems.length} line item(s) extracted` });
    } catch (error) {
      toast({ title: "Failed to scan receipt", variant: "destructive" });
    } finally {
      setScanning(false);
    }
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

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
        <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
        <p className="text-muted-foreground text-center max-w-md mb-6">
          The Cost Estimator is restricted to administrative personnel only. 
          Please contact your project manager if you believe this is an error.
        </p>
        <Link href="/">
          <Button variant="outline">Return to Dashboard</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center gap-3">
          <Link href={`/project/${projectId}`}>
            <Button variant="ghost" size="sm" data-testid="button-back-to-project">
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-semibold normal-case tracking-normal leading-tight" data-testid="text-page-title">Cost Estimator</h1>
            <p className="text-xs text-muted-foreground" data-testid="text-project-name">{project.name} · CAD</p>
          </div>
          <Select value={viewMode} onValueChange={(v: any) => setViewMode(v)}>
            <SelectTrigger className="w-[130px] h-8 text-sm" data-testid="select-view-mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Items</SelectItem>
              <SelectItem value="room">By Room</SelectItem>
              <SelectItem value="sq_ft">Per Sq Ft</SelectItem>
              <SelectItem value="hour">Per Hour</SelectItem>
              <SelectItem value="board">Per Board/Unit</SelectItem>
            </SelectContent>
          </Select>
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
                    ${grandTotalWithHST.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  {totalMarkup > 0 && (
                    <div className="text-xs text-muted-foreground">incl. ${totalMarkup.toLocaleString("en-CA", { minimumFractionDigits: 2 })} markup</div>
                  )}
                  {contingencyAmount > 0 && (
                    <div className="text-xs text-muted-foreground">incl. ${contingencyAmount.toLocaleString("en-CA", { minimumFractionDigits: 2 })} contingency</div>
                  )}
                  {managementFeeAmount > 0 && (
                    <div className="text-xs text-muted-foreground">incl. ${managementFeeAmount.toLocaleString("en-CA", { minimumFractionDigits: 2 })} management fee ({activeEstimate?.managementFeePercent || "25"}%)</div>
                  )}
                  <div className="text-xs text-muted-foreground">incl. ${hstAmount.toLocaleString("en-CA", { minimumFractionDigits: 2 })} HST (13%)</div>
                  {(() => {
                    const totalLabor = items.reduce((s, i) => s + (parseFloat(i.laborCost) || 0), 0);
                    return totalLabor > 0 ? <div className="text-xs text-muted-foreground">Labour: ${totalLabor.toLocaleString("en-CA", { minimumFractionDigits: 2 })}</div> : null;
                  })()}
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

            {(() => {
              const budget = parseFloat(activeEstimate.budget || "0");
              const hasBudget = budget > 0;
              const budgetUsedPercent = hasBudget ? Math.min((grandTotalWithHST / budget) * 100, 100) : 0;
              const overBudget = hasBudget && grandTotalWithHST > budget;
              const budgetRemaining = hasBudget ? budget - grandTotalWithHST : 0;
              return (
                <Card data-testid="card-budget">
                  <CardContent className="pt-4 pb-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Wallet className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Client Budget</span>
                      </div>
                      {canEdit && !editingBudget && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => { setBudgetInput(activeEstimate.budget || ""); setEditingBudget(true); }}
                          data-testid="button-edit-budget"
                        >
                          {hasBudget ? "Edit" : "Set Budget"}
                        </Button>
                      )}
                    </div>
                    {editingBudget && (
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            type="number"
                            step="1000"
                            className="pl-8"
                            value={budgetInput}
                            onChange={(e) => setBudgetInput(e.target.value)}
                            placeholder="e.g., 150000"
                            autoFocus
                            data-testid="input-budget"
                          />
                        </div>
                        <Button
                          size="sm"
                          onClick={() => {
                            updateEstimateMutation.mutate({ budget: budgetInput || null });
                            setEditingBudget(false);
                          }}
                          data-testid="button-save-budget"
                        >
                          Save
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setEditingBudget(false)} data-testid="button-cancel-budget">
                          Cancel
                        </Button>
                      </div>
                    )}
                    {hasBudget && !editingBudget && (
                      <>
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-2xl font-semibold" data-testid="text-budget-amount">
                            ${budget.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                          <span className={`text-sm font-medium ${overBudget ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`} data-testid="text-budget-remaining">
                            {overBudget
                              ? `$${Math.abs(budgetRemaining).toLocaleString("en-CA", { minimumFractionDigits: 2 })} over budget`
                              : `$${budgetRemaining.toLocaleString("en-CA", { minimumFractionDigits: 2 })} remaining`}
                          </span>
                        </div>
                        <Progress
                          value={budgetUsedPercent}
                          className={`h-2 ${overBudget ? "[&>div]:bg-red-500" : ""}`}
                          data-testid="progress-budget"
                        />
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{budgetUsedPercent.toFixed(0)}% of budget used</span>
                          <span>Estimate: ${grandTotalWithHST.toLocaleString("en-CA", { minimumFractionDigits: 2 })} (incl. HST)</span>
                        </div>
                        {overBudget && canEdit && items.length > 0 && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-950"
                            onClick={() => {
                              setAlternativesResults(null);
                              setShowAlternatives(true);
                              suggestAlternativesMutation.mutate(activeEstimate.budget!);
                            }}
                            disabled={suggestAlternativesMutation.isPending}
                            data-testid="button-suggest-alternatives"
                          >
                            {suggestAlternativesMutation.isPending ? (
                              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Finding alternatives...</>
                            ) : (
                              <><Lightbulb className="h-4 w-4 mr-2" /> Suggest Cost-Saving Alternatives</>
                            )}
                          </Button>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>
              );
            })()}

            {canEdit && (
              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" onClick={() => setShowBoardImport(true)} data-testid="button-import-board">
                  <Shapes className="h-4 w-4 mr-2" /> Import from Board
                </Button>
                <Button variant="outline" onClick={() => setShowAiAnalyzer(true)} data-testid="button-ai-analyze">
                  <Sparkles className="h-4 w-4 mr-2" /> AI Scope Analyzer
                </Button>
              </div>
            )}

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

            {canEdit && (
              <Card data-testid="card-contingency">
                <CardContent className="py-3 flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <Label>Contingency Allowance ({activeEstimate.contingencyPercent || "0"}%)</Label>
                  </div>
                  {editingContingency ? (
                    <div className="flex items-center gap-2">
                      <Label className="text-sm">Contingency %:</Label>
                      <Input
                        type="number"
                        className="w-20"
                        min="0"
                        max="25"
                        value={contingencyInput}
                        onChange={(e) => setContingencyInput(e.target.value)}
                        autoFocus
                        data-testid="input-contingency-percent"
                      />
                      <Button size="sm" onClick={() => {
                        const val = Math.min(25, Math.max(0, parseFloat(contingencyInput) || 0));
                        updateEstimateMutation.mutate({ contingencyPercent: String(val) });
                        setEditingContingency(false);
                      }} data-testid="button-save-contingency">
                        Save
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setEditingContingency(false)} data-testid="button-cancel-contingency">
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => { setContingencyInput(activeEstimate.contingencyPercent || "0"); setEditingContingency(true); }} data-testid="button-edit-contingency">
                      <Pencil className="h-3 w-3 mr-1" /> Edit
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}

            {canEdit && (
              <Card data-testid="card-management-fee">
                <CardContent className="py-3 flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={activeEstimate.managementFeeEnabled ?? false}
                      onCheckedChange={(checked) => updateEstimateMutation.mutate({ managementFeeEnabled: checked })}
                      data-testid="switch-management-fee"
                    />
                    <Label>Apply {activeEstimate.managementFeePercent || "25"}% management fee</Label>
                  </div>
                  {activeEstimate.managementFeeEnabled && (
                    <div className="flex items-center gap-2">
                      <Label className="text-sm">Fee %:</Label>
                      <Input
                        type="number"
                        className="w-20"
                        value={activeEstimate.managementFeePercent || "25"}
                        onChange={(e) => updateEstimateMutation.mutate({ managementFeePercent: e.target.value })}
                        data-testid="input-management-fee-percent"
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {activeWarnings.length > 0 && (
              <div className="space-y-2">
                {activeWarnings.map(w => {
                  const linkedItem = items.find(i => i.id === w.estimateItemId);
                  const marketRate = linkedItem?.categoryId ? marketRates.find(r => r.categoryId === linkedItem.categoryId && r.isActive) : null;
                  const isEditing = editingWarningItem === w.estimateItemId;
                  return (
                    <div key={w.id} className="p-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950" data-testid={`warning-${w.id}`}>
                      <div className="flex items-center gap-3">
                        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                        <span className="text-sm flex-1">{w.message}</span>
                      </div>
                      {isEditing ? (
                        <div className="flex items-center gap-2 mt-2 ml-7">
                          <Input
                            type="number"
                            step="0.01"
                            className="h-8 w-32"
                            value={warningEditCost}
                            onChange={(e) => setWarningEditCost(e.target.value)}
                            placeholder="New unit cost"
                            autoFocus
                            data-testid={`input-warning-edit-${w.id}`}
                          />
                          <Button size="sm" className="h-8"
                            disabled={!warningEditCost || updateItemMutation.isPending}
                            onClick={async () => {
                              await updateItemMutation.mutateAsync({ id: w.estimateItemId, unitCost: warningEditCost });
                              setEditingWarningItem(null);
                              setWarningEditCost("");
                            }}
                            data-testid={`button-save-warning-edit-${w.id}`}
                          >
                            {updateItemMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                          </Button>
                          <Button variant="ghost" size="sm" className="h-8" onClick={() => { setEditingWarningItem(null); setWarningEditCost(""); }}>
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 mt-2 ml-7 flex-wrap">
                          {marketRate && (
                            <Button variant="default" size="sm" className="h-7 text-xs"
                              disabled={updateItemMutation.isPending}
                              onClick={async () => {
                                await updateItemMutation.mutateAsync({ id: w.estimateItemId, unitCost: marketRate.typicalRate });
                                toast({ title: "Unit cost updated to market rate" });
                              }}
                              data-testid={`button-apply-market-${w.id}`}
                            >
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Apply Market Rate (${marketRate.typicalRate})
                            </Button>
                          )}
                          <Button variant="outline" size="sm" className="h-7 text-xs"
                            onClick={() => {
                              setEditingWarningItem(w.estimateItemId);
                              setWarningEditCost(linkedItem ? linkedItem.unitCost : "");
                            }}
                            data-testid={`button-edit-warning-${w.id}`}
                          >
                            <Pencil className="h-3 w-3 mr-1" /> Edit Cost
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => ignoreWarningMutation.mutate(w.id)} data-testid={`button-ignore-warning-${w.id}`}>
                            <EyeOff className="h-3 w-3 mr-1" /> Ignore
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
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
                      <div className="col-span-2">Category</div>
                      <div className="col-span-1">Type</div>
                      <div className="col-span-2 text-right">Qty</div>
                      <div className="col-span-2 text-right">Unit Cost</div>
                      <div className="col-span-1 text-right">Material</div>
                      <div className="col-span-1 text-right">Labour</div>
                      <div className="col-span-2 text-right">Total</div>
                      <div className="col-span-1"></div>
                    </div>
                    {(() => {
                      const renderItem = (item: typeof filteredItems[0]) => {
                        const itemWarnings = warnings.filter(w => w.estimateItemId === item.id && !w.ignored);
                        const isEditing = editingItemId === item.id;

                        if (isEditing && canEdit) {
                          const saveEdit = () => {
                            updateItemMutation.mutate({
                              id: item.id,
                              quantity: editItemForm.quantity,
                              unitCost: editItemForm.unitCost,
                              materialCost: editItemForm.materialCost || "0",
                              laborCost: editItemForm.laborCost || "0",
                            });
                            setEditingItemId(null);
                          };
                          return (
                            <div key={item.id} data-testid={`estimate-item-${item.id}`}>
                              {/* Mobile edit layout */}
                              <div className="md:hidden space-y-2 p-3 rounded-md border border-primary/40 bg-primary/5">
                                <div className="text-sm font-medium flex items-center gap-1 flex-wrap">
                                  <span>{item.categoryName}</span>
                                  <Badge variant="outline" className="text-[10px]">
                                    {item.unitType === "sq_ft" ? "sq ft" : item.unitType === "hour" ? "hr" : "unit"}
                                  </Badge>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <Label className="text-xs text-muted-foreground">Qty</Label>
                                    <Input type="number" className="h-11 text-sm" value={editItemForm.quantity} onChange={(e) => setEditItemForm(f => ({ ...f, quantity: e.target.value }))} data-testid={`input-edit-qty-${item.id}`} />
                                  </div>
                                  <div>
                                    <Label className="text-xs text-muted-foreground">Unit Cost</Label>
                                    <Input type="number" step="0.01" className="h-11 text-sm" value={editItemForm.unitCost} onChange={(e) => setEditItemForm(f => ({ ...f, unitCost: e.target.value }))} data-testid={`input-edit-unit-cost-${item.id}`} />
                                  </div>
                                  <div>
                                    <Label className="text-xs text-muted-foreground">Material Cost</Label>
                                    <Input type="number" step="0.01" className="h-11 text-sm" value={editItemForm.materialCost} onChange={(e) => setEditItemForm(f => ({ ...f, materialCost: e.target.value }))} data-testid={`input-edit-material-${item.id}`} />
                                  </div>
                                  <div>
                                    <Label className="text-xs text-muted-foreground">Labour Cost</Label>
                                    <Input type="number" step="1" className="h-11 text-sm" value={editItemForm.laborCost} onChange={(e) => setEditItemForm(f => ({ ...f, laborCost: e.target.value }))} data-testid={`input-edit-labor-${item.id}`} />
                                  </div>
                                </div>
                                <div className="flex gap-2 pt-1">
                                  <Button size="sm" className="flex-1 h-11" onClick={saveEdit} data-testid={`button-save-edit-${item.id}`}>Save</Button>
                                  <Button variant="ghost" size="sm" className="flex-1 h-11" onClick={() => setEditingItemId(null)} data-testid={`button-cancel-edit-${item.id}`}>Cancel</Button>
                                </div>
                              </div>
                              {/* Desktop edit layout */}
                              <div className="hidden md:grid grid-cols-12 gap-2 items-center p-2 rounded-md border border-primary/40 bg-primary/5">
                                <div className="col-span-2 text-sm font-medium flex items-center gap-1 flex-wrap">
                                  <span className="truncate">{item.categoryName}</span>
                                </div>
                                <div className="col-span-1">
                                  <Badge variant="outline" className="text-[10px]">
                                    {item.unitType === "sq_ft" ? "sq ft" : item.unitType === "hour" ? "hr" : "unit"}
                                  </Badge>
                                </div>
                                <div className="col-span-2">
                                  <Input type="number" className="h-7 text-sm text-right" value={editItemForm.quantity} onChange={(e) => setEditItemForm(f => ({ ...f, quantity: e.target.value }))} data-testid={`input-edit-qty-${item.id}`} />
                                </div>
                                <div className="col-span-2">
                                  <Input type="number" step="0.01" className="h-7 text-sm text-right" value={editItemForm.unitCost} onChange={(e) => setEditItemForm(f => ({ ...f, unitCost: e.target.value }))} data-testid={`input-edit-unit-cost-${item.id}`} />
                                </div>
                                <div className="col-span-1">
                                  <Input type="number" step="0.01" className="h-7 text-sm text-right" value={editItemForm.materialCost} onChange={(e) => setEditItemForm(f => ({ ...f, materialCost: e.target.value }))} data-testid={`input-edit-material-${item.id}`} />
                                </div>
                                <div className="col-span-1">
                                  <Input type="number" step="1" className="h-7 text-sm text-right" value={editItemForm.laborCost} onChange={(e) => setEditItemForm(f => ({ ...f, laborCost: e.target.value }))} data-testid={`input-edit-labor-${item.id}`} />
                                </div>
                                <div className="col-span-2 text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    <Button size="sm" className="h-7 px-2 text-xs" onClick={saveEdit} data-testid={`button-save-edit-${item.id}`}>Save</Button>
                                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setEditingItemId(null)} data-testid={`button-cancel-edit-${item.id}`}>Cancel</Button>
                                  </div>
                                </div>
                                <div className="col-span-1"></div>
                              </div>
                            </div>
                          );
                        }

                        const borderClass = itemWarnings.length > 0
                          ? 'border-amber-300 bg-amber-50/50 dark:border-amber-700 dark:bg-amber-950/30'
                          : 'border-border';
                        const editActions = canEdit ? (
                          <div className="flex items-center gap-0.5 shrink-0">
                            <Button variant="ghost" size="sm" className="h-11 w-11 md:h-7 md:w-7 p-0" onClick={() => {
                              setEditingItemId(item.id);
                              setEditItemForm({
                                quantity: item.quantity,
                                unitCost: item.unitCost,
                                materialCost: item.materialCost,
                                laborCost: item.laborCost,
                              });
                            }} data-testid={`button-edit-item-${item.id}`}>
                              <Pencil className="h-3 w-3 text-muted-foreground" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-11 w-11 md:h-7 md:w-7 p-0" onClick={() => deleteItemMutation.mutate(item.id)} data-testid={`button-delete-item-${item.id}`}>
                              <Trash2 className="h-3 w-3 text-muted-foreground" />
                            </Button>
                          </div>
                        ) : null;
                        return (
                          <div key={item.id} data-testid={`estimate-item-${item.id}`}>
                            {/* Mobile card layout */}
                            <div className={`md:hidden p-2.5 rounded-md border ${borderClass}`}>
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-1 flex-wrap min-w-0">
                                  {itemWarnings.length > 0 && <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />}
                                  <span className="font-medium text-sm">{item.categoryName}</span>
                                  {item.isCustomRate && <Badge variant="outline" className="text-[10px]">Custom</Badge>}
                                  {item.room && <Badge variant="outline" className="text-[10px]" data-testid={`badge-room-${item.id}`}><Home className="h-2.5 w-2.5 mr-0.5" />{item.room}</Badge>}
                                  {item.productUrl && (
                                    <a href={item.productUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} data-testid={`link-product-${item.id}`}>
                                      <ExternalLink className="h-3 w-3 text-muted-foreground" />
                                    </a>
                                  )}
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <span className="font-semibold text-sm">
                                    ${item.totalWithMarkup.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </span>
                                  {editActions}
                                </div>
                              </div>
                              <div className="flex gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                                <span>{parseFloat(item.quantity).toLocaleString()} × ${parseFloat(item.unitCost).toFixed(2)}</span>
                                {parseFloat(item.laborCost) > 0 && <span>Labour ${parseFloat(item.laborCost).toFixed(0)}</span>}
                                <span className="ml-auto">
                                  <Badge variant="outline" className="text-[10px]">
                                    {item.unitType === "sq_ft" ? "sq ft" : item.unitType === "hour" ? "hr" : "unit"}
                                  </Badge>
                                </span>
                              </div>
                            </div>
                            {/* Desktop grid layout */}
                            <div className={`hidden md:grid grid-cols-12 gap-2 items-center p-2 rounded-md border ${borderClass}`}>
                              <div className="col-span-2 text-sm font-medium flex items-center gap-1 flex-wrap">
                                {itemWarnings.length > 0 && <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />}
                                <span className="truncate">{item.categoryName}</span>
                                {item.isCustomRate && <Badge variant="outline" className="text-[10px] ml-1">Custom</Badge>}
                                {item.room && <Badge variant="outline" className="text-[10px] ml-1" data-testid={`badge-room-${item.id}`}><Home className="h-2.5 w-2.5 mr-0.5" />{item.room}</Badge>}
                                {item.productUrl && (
                                  <a href={item.productUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} data-testid={`link-product-${item.id}`}>
                                    <ExternalLink className="h-3 w-3 text-muted-foreground" />
                                  </a>
                                )}
                              </div>
                              <div className="col-span-1">
                                <Badge variant="outline" className="text-[10px]">
                                  {item.unitType === "sq_ft" ? "sq ft" : item.unitType === "hour" ? "hr" : "unit"}
                                </Badge>
                              </div>
                              <div className="text-right text-sm col-span-2">{parseFloat(item.quantity).toLocaleString()}</div>
                              <div className="text-right text-sm col-span-2">${parseFloat(item.unitCost).toFixed(2)}</div>
                              <div className="text-right text-sm col-span-1">${parseFloat(item.materialCost).toFixed(2)}</div>
                              <div className="text-right text-sm col-span-1">{parseFloat(item.laborCost) > 0 ? `$${parseFloat(item.laborCost).toFixed(0)}` : '—'}</div>
                              <div className="text-right text-sm font-medium col-span-2">
                                ${item.totalWithMarkup.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </div>
                              <div className="text-right col-span-1 flex items-center justify-end">
                                {editActions}
                              </div>
                            </div>
                          </div>
                        );
                      };

                      if (viewMode === "room") {
                        const roomGroups = filteredItems.reduce<Record<string, typeof filteredItems>>((acc, item) => {
                          const roomName = item.room || "Unassigned";
                          if (!acc[roomName]) acc[roomName] = [];
                          acc[roomName].push(item);
                          return acc;
                        }, {});
                        return Object.entries(roomGroups).map(([roomName, roomItems]) => {
                          const roomSubtotal = roomItems.reduce((sum, i) => sum + i.totalWithMarkup, 0);
                          return (
                            <div key={roomName} className="space-y-1" data-testid={`room-group-${roomName}`}>
                              <div className="flex items-center justify-between gap-3 px-2 py-1.5 rounded-md bg-muted/50">
                                <div className="flex items-center gap-2 text-sm font-semibold">
                                  <Home className="h-3.5 w-3.5" />
                                  {roomName}
                                </div>
                                <div className="text-sm font-semibold" data-testid={`text-room-subtotal-${roomName}`}>
                                  ${roomSubtotal.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                              </div>
                              {roomItems.map(renderItem)}
                            </div>
                          );
                        });
                      }
                      return filteredItems.map(renderItem);
                    })()}
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
                    <div className="grid grid-cols-2 md:grid-cols-12 gap-2 px-2">
                      <div className="md:col-span-8 text-sm font-semibold">Pre-Tax Total</div>
                      <div className="md:col-span-4 text-right text-sm font-semibold" data-testid="text-pretax-total">
                        ${grandTotalWithMarkup.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>
                    {contingencyAmount > 0 && (
                      <div className="grid grid-cols-2 md:grid-cols-12 gap-2 px-2">
                        <div className="md:col-span-8 text-sm text-muted-foreground">Contingency ({activeEstimate.contingencyPercent || "0"}%)</div>
                        <div className="md:col-span-4 text-right text-sm text-muted-foreground" data-testid="text-contingency-amount">
                          +${contingencyAmount.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </div>
                    )}
                    {managementFeeAmount > 0 && (
                      <div className="grid grid-cols-2 md:grid-cols-12 gap-2 px-2">
                        <div className="md:col-span-8 text-sm text-muted-foreground">Management Fee ({activeEstimate.managementFeePercent || "25"}%)</div>
                        <div className="md:col-span-4 text-right text-sm text-muted-foreground" data-testid="text-management-fee-amount">
                          +${managementFeeAmount.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-2 md:grid-cols-12 gap-2 px-2">
                      <div className="md:col-span-8 text-sm text-muted-foreground">HST (13%)</div>
                      <div className="md:col-span-4 text-right text-sm text-muted-foreground" data-testid="text-hst-amount">
                        +${hstAmount.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-12 gap-2 px-2 pb-1 pt-1 border-t">
                      <div className="md:col-span-8 text-base font-bold">Grand Total</div>
                      <div className="md:col-span-4 text-right text-base font-bold" data-testid="text-grand-total-bottom">
                        ${grandTotalWithHST.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3 flex-wrap">
                <CardTitle className="text-base flex items-center gap-2 shrink-0">
                  <ReceiptIcon className="h-4 w-4" /> Receipts & Actual Spend
                </CardTitle>
                {canEdit && (
                  <Button size="sm" className="h-8 shrink-0" onClick={() => setShowAddReceipt(true)} data-testid="button-add-receipt">
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
                      const lineItems = (r as any).lineItems as Array<{ description: string; qty: number; unitPrice: number; subtotal: number }> | null;
                      const isExpanded = expandedReceipts.has(r.id);
                      return (
                        <div key={r.id} className="rounded-md border" data-testid={`receipt-${r.id}`}>
                          <div className="flex items-center gap-3 p-3">
                            {lineItems && lineItems.length > 0 ? (
                              <button
                                className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                                onClick={() => setExpandedReceipts(prev => { const s = new Set(prev); isExpanded ? s.delete(r.id) : s.add(r.id); return s; })}
                                data-testid={`button-expand-receipt-${r.id}`}
                              >
                                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                              </button>
                            ) : (
                              <DollarSign className="h-4 w-4 text-muted-foreground shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium">{r.vendor}</div>
                              <div className="text-xs text-muted-foreground">
                                {r.date} {r.description && `· ${r.description}`}
                                {linkedItem && ` · Linked: ${linkedItem.categoryName}`}
                                {lineItems && lineItems.length > 0 && ` · ${lineItems.length} items`}
                              </div>
                            </div>
                            <div className="text-sm font-semibold">${parseFloat(r.amount).toLocaleString("en-CA", { minimumFractionDigits: 2 })}</div>
                            {canEdit && (
                              <Button variant="ghost" size="sm" className="h-11 w-11 md:h-7 md:w-7 p-0" onClick={() => deleteReceiptMutation.mutate(r.id)} data-testid={`button-delete-receipt-${r.id}`}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                          {isExpanded && lineItems && lineItems.length > 0 && (
                            <div className="border-t bg-muted/20 px-3 py-2 space-y-1">
                              <div className="grid grid-cols-12 text-[10px] uppercase tracking-wider text-muted-foreground font-medium pb-1 border-b border-border/40">
                                <span className="col-span-5">Item</span>
                                <span className="col-span-2 text-right">Qty</span>
                                <span className="col-span-3 text-right">Unit Price</span>
                                <span className="col-span-2 text-right">Total</span>
                              </div>
                              {lineItems.map((item, idx) => (
                                <div key={idx} className="grid grid-cols-12 text-xs py-0.5">
                                  <span className="col-span-5 truncate pr-1">{item.description}</span>
                                  <span className="col-span-2 text-right text-muted-foreground">{item.qty}</span>
                                  <span className="col-span-3 text-right text-muted-foreground">${item.unitPrice.toFixed(2)}</span>
                                  <span className="col-span-2 text-right font-medium">${item.subtotal.toFixed(2)}</span>
                                </div>
                              ))}
                            </div>
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
            {(() => {
              const predefinedRooms = ["Kitchen", "Bathroom", "Primary Bedroom", "Bedroom", "Living Room", "Dining Room", "Hallway", "Mudroom", "Laundry Room", "Garage", "Exterior", "Deck", "Dock", "Basement", "Attic", "Office"];
              const isCustomRoom = newItem.room !== "" && !predefinedRooms.includes(newItem.room);
              const selectVal = isCustomRoom ? "__other__" : newItem.room;
              return (
                <div>
                  <Label>Room</Label>
                  <Select value={selectVal} onValueChange={(v) => {
                    if (v === "__other__") {
                      setNewItem(prev => ({ ...prev, room: " " }));
                      setTimeout(() => setNewItem(prev => ({ ...prev, room: prev.room.trim() })), 0);
                    } else {
                      setNewItem(prev => ({ ...prev, room: v }));
                    }
                  }}>
                    <SelectTrigger data-testid="select-room"><SelectValue placeholder="Select room..." /></SelectTrigger>
                    <SelectContent>
                      {predefinedRooms.map(r => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
                      ))}
                      <SelectItem value="__other__">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  {(selectVal === "__other__" || isCustomRoom) && (
                    <Input
                      value={newItem.room}
                      onChange={(e) => setNewItem(prev => ({ ...prev, room: e.target.value }))}
                      placeholder="Enter custom room name..."
                      className="mt-2"
                      data-testid="input-custom-room"
                    />
                  )}
                </div>
              );
            })()}

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
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
                {newItem.categoryId === "other" && (
                  <Input value={newItem.customCategory} onChange={(e) => setNewItem(prev => ({ ...prev, customCategory: e.target.value }))} placeholder="Enter category name..." className="mt-2" data-testid="input-other-category" />
                )}
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
                  <SelectItem value="hour">Per Hour</SelectItem>
                  <SelectItem value="board">Per Board / Unit</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {newItem.unitType === "sq_ft" ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Length (ft)</Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={newItem.length}
                      onChange={(e) => {
                        const len = e.target.value;
                        const w = parseFloat(newItem.width) || 0;
                        const l = parseFloat(len) || 0;
                        const sqft = l > 0 && w > 0 ? (l * w).toFixed(1) : "";
                        setNewItem(prev => ({ ...prev, length: len, quantity: sqft || prev.quantity }));
                      }}
                      placeholder="0"
                      data-testid="input-length"
                    />
                  </div>
                  <div>
                    <Label>Width (ft)</Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={newItem.width}
                      onChange={(e) => {
                        const wid = e.target.value;
                        const l = parseFloat(newItem.length) || 0;
                        const w = parseFloat(wid) || 0;
                        const sqft = l > 0 && w > 0 ? (l * w).toFixed(1) : "";
                        setNewItem(prev => ({ ...prev, width: wid, quantity: sqft || prev.quantity }));
                      }}
                      placeholder="0"
                      data-testid="input-width"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Total Sq Ft</Label>
                    <Input
                      type="number"
                      value={newItem.quantity}
                      onChange={(e) => setNewItem(prev => ({ ...prev, quantity: e.target.value }))}
                      placeholder="0"
                      data-testid="input-quantity"
                    />
                    {parseFloat(newItem.length) > 0 && parseFloat(newItem.width) > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {newItem.length} × {newItem.width} = {(parseFloat(newItem.length) * parseFloat(newItem.width)).toFixed(1)} sq ft
                      </p>
                    )}
                  </div>
                  <div>
                    <Label>Cost per Sq Ft ($)</Label>
                    <Input type="number" step="0.01" value={newItem.unitCost} onChange={(e) => setNewItem(prev => ({ ...prev, unitCost: e.target.value }))} placeholder="0.00" data-testid="input-unit-cost" />
                    {!newItem.isCustomRate && newItem.categoryId && newItem.categoryId !== "other" && (() => {
                      const rate = marketRates.find(r => r.categoryId === parseInt(newItem.categoryId) && r.isActive);
                      return rate ? (
                        <p className="text-xs text-muted-foreground mt-1">Market: ${rate.lowRate} - ${rate.highRate} / sq ft</p>
                      ) : null;
                    })()}
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Quantity ({newItem.unitType === "sq_ft" ? "sq ft" : newItem.unitType === "hour" ? "hours" : "units"})</Label>
                    <Input type="number" value={newItem.quantity} onChange={(e) => setNewItem(prev => ({ ...prev, quantity: e.target.value }))} placeholder="0" data-testid="input-quantity" />
                  </div>
                  <div>
                    <Label>Cost per {newItem.unitType === "sq_ft" ? "Sq Ft" : newItem.unitType === "hour" ? "Hour" : "Unit"} ($)</Label>
                    <Input type="number" step="0.01" value={newItem.unitCost} onChange={(e) => setNewItem(prev => ({ ...prev, unitCost: e.target.value }))} placeholder="0.00" data-testid="input-unit-cost" />
                    {!newItem.isCustomRate && newItem.categoryId && newItem.categoryId !== "other" && (() => {
                      const rate = marketRates.find(r => r.categoryId === parseInt(newItem.categoryId) && r.isActive);
                      if (!rate) return null;
                      const rateUnitType = rate.unitType || "sq_ft";
                      if (rateUnitType !== newItem.unitType) return null;
                      return (
                        <p className="text-xs text-muted-foreground mt-1">Market: ${rate.lowRate} - ${rate.highRate} / {newItem.unitType === "sq_ft" ? "sq ft" : newItem.unitType === "hour" ? "hr" : "unit"}</p>
                      );
                    })()}
                  </div>
              </div>
            )}

            {supplierPrices.length > 0 && (
              <div>
                <Label className="flex items-center gap-1"><Store className="h-3 w-3" /> Fill from Price Book</Label>
                <Select onValueChange={(v) => {
                  const sp = supplierPrices.find(p => p.id === parseInt(v));
                  if (sp) {
                    const supplier = priceBookSuppliers.find(s => s.id === sp.supplierId);
                    setNewItem(prev => ({
                      ...prev,
                      unitCost: sp.unitPrice,
                      unitType: sp.unitType === "sq_ft" ? "sq_ft" : sp.unitType === "hour" ? "hour" : "board",
                      materialCost: sp.unitPrice,
                      productUrl: sp.productUrl || prev.productUrl,
                      notes: prev.notes || `${sp.productName}${supplier ? ` — ${supplier.name}` : ""}${sp.productCode ? ` (${sp.productCode})` : ""}`,
                    }));
                  }
                }}>
                  <SelectTrigger className="text-xs" data-testid="select-supplier-price"><SelectValue placeholder="Auto-fill from supplier price book..." /></SelectTrigger>
                  <SelectContent>
                    {priceBookSuppliers.map(supplier => {
                      const prices = supplierPrices.filter(p => p.supplierId === supplier.id);
                      if (prices.length === 0) return null;
                      return prices.map(p => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {supplier.name} — {p.productName} — ${p.unitPrice}/{p.unitType === "sq_ft" ? "sq ft" : p.unitType}
                        </SelectItem>
                      ));
                    })}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label>Material Cost ($) <span className="text-muted-foreground text-xs">(for markup calculation)</span></Label>
              <Input type="number" step="0.01" value={newItem.materialCost} onChange={(e) => setNewItem(prev => ({ ...prev, materialCost: e.target.value }))} placeholder="0.00" data-testid="input-material-cost" />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Labour Cost ($)</Label>
                <div className="flex items-center gap-2">
                  <Label className="text-[10px] text-muted-foreground">Crew Count:</Label>
                  <Input 
                    type="number" 
                    className="h-6 w-12 text-xs px-1" 
                    value={newItem.crewCount} 
                    onChange={(e) => setNewItem(prev => ({ ...prev, crewCount: e.target.value }))}
                  />
                  {isAdmin && (
                    <Link href="/labor-rates">
                      <Button variant="link" size="sm" className="h-auto p-0 text-xs">
                        Manage Labour Rates
                      </Button>
                    </Link>
                  )}
                </div>
              </div>
              <Input type="number" step="0.01" value={newItem.laborCost} onChange={(e) => setNewItem(prev => ({ ...prev, laborCost: e.target.value }))} placeholder="0.00" data-testid="input-labor-cost" />
              <div className="flex gap-2 mt-2 flex-wrap">
                {crewRates.filter(c => c.isActive !== false).length > 0 && (
                  <Select onValueChange={(v) => {
                    const crew = crewRates.find(c => c.id === parseInt(v));
                    if (crew) {
                      const hours = parseFloat(newItem.quantity) || 8;
                      const count = parseInt(newItem.crewCount) || 1;
                      const totalLabor = (parseFloat(crew.billableRate) * hours * count).toFixed(2);
                      setNewItem(prev => ({ 
                        ...prev, 
                        laborCost: totalLabor, 
                        notes: prev.notes || `${crew.name} (${count} crew) - ${hours}hrs @ $${crew.billableRate}/hr` 
                      }));
                    }
                  }}>
                    <SelectTrigger className="text-xs" data-testid="select-crew-rate"><SelectValue placeholder="Fill from crew rate..." /></SelectTrigger>
                    <SelectContent>
                      {crewRates.filter(c => c.isActive !== false).map(c => (
                        <SelectItem key={c.id} value={String(c.id)}>{c.name} — ${c.billableRate}/hr</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {(() => {
                  const catSubs = newItem.categoryId ? subcontractors.filter(s => s.categoryId === parseInt(newItem.categoryId) && s.isActive !== false) : [];
                  return catSubs.length > 0 ? (
                    <Select onValueChange={(v) => {
                      const sub = subcontractors.find(s => s.id === parseInt(v));
                      if (sub) {
                        const rate = sub.hourlyRate || sub.unitRate || sub.dailyRate || "0";
                        const qty = parseFloat(newItem.quantity) || 1;
                        setNewItem(prev => ({ ...prev, laborCost: (parseFloat(rate) * qty).toFixed(2), notes: prev.notes || `${sub.businessName} — $${rate}/${sub.unitType || "unit"}` }));
                      }
                    }}>
                      <SelectTrigger className="text-xs" data-testid="select-sub-rate"><SelectValue placeholder="Fill from subcontractor..." /></SelectTrigger>
                      <SelectContent>
                        {catSubs.map(s => (
                          <SelectItem key={s.id} value={String(s.id)}>{s.businessName} — ${s.hourlyRate || s.unitRate || s.dailyRate}/{s.unitType || "unit"}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : null;
                })()}
              </div>
            </div>

            <div>
              <Label>Notes</Label>
              <Input value={newItem.notes} onChange={(e) => setNewItem(prev => ({ ...prev, notes: e.target.value }))} placeholder="Optional notes..." data-testid="input-item-notes" />
            </div>

            <div>
              <Label>Product Link</Label>
              <Input value={newItem.productUrl} onChange={(e) => setNewItem(prev => ({ ...prev, productUrl: e.target.value }))} placeholder="https://..." data-testid="input-product-url" />
            </div>

            <Button className="w-full" onClick={handleAddItem} disabled={addItemMutation.isPending} data-testid="button-submit-item">
              {addItemMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              Add Line Item
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showAddReceipt} onOpenChange={(open) => { setShowAddReceipt(open); if (!open) { setNewReceipt({ vendor: "", description: "", date: new Date().toISOString().split("T")[0], amount: "", estimateItemId: "", lineItems: [] }); setPriceBookImport({ enabled: false, supplierId: "", items: [] }); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Receipt</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="p-4 border-2 border-dashed rounded-lg text-center bg-muted/30">
              <Input
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                id="receipt-upload"
                onChange={handleFileUpload}
                disabled={scanning}
              />
              <Label
                htmlFor="receipt-upload"
                className="cursor-pointer flex flex-col items-center gap-2"
              >
                {scanning ? (
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                ) : (
                  <ReceiptIcon className="h-8 w-8 text-muted-foreground" />
                )}
                <span className="text-sm font-medium">
                  {scanning ? "Analyzing Receipt..." : "Click to Scan Receipt Image"}
                </span>
                <span className="text-xs text-muted-foreground">
                  Accepts images or PDF · AI extracts vendor, date, amount & line items
                </span>
              </Label>
            </div>
            {newReceipt.lineItems.length > 0 && (
              <div className="space-y-2">
                <div className="rounded-md border bg-muted/30 p-3 space-y-1.5">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">Extracted Line Items</p>
                  {newReceipt.lineItems.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between text-xs gap-2">
                      <span className="flex-1 truncate">{item.description}</span>
                      <span className="text-muted-foreground shrink-0">{item.qty} × ${item.unitPrice.toFixed(2)}</span>
                      <span className="font-medium shrink-0 w-16 text-right">${item.subtotal.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
                <div className="rounded-md border p-3 space-y-3">
                  <button
                    type="button"
                    className="flex items-center justify-between w-full text-left"
                    onClick={() => setPriceBookImport(p => ({ ...p, enabled: !p.enabled }))}
                    data-testid="button-toggle-price-book-import"
                  >
                    <span className="text-xs font-medium flex items-center gap-1.5">
                      <Store className="h-3.5 w-3.5 text-muted-foreground" />
                      Also send to Price Book
                    </span>
                    {priceBookImport.enabled ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                  </button>
                  {priceBookImport.enabled && (
                    <div className="space-y-3 pt-1 border-t">
                      <div>
                        <Label className="text-xs">Supplier</Label>
                        <Select value={priceBookImport.supplierId} onValueChange={v => setPriceBookImport(p => ({ ...p, supplierId: v }))}>
                          <SelectTrigger className="h-8 text-sm mt-1" data-testid="select-pb-supplier">
                            <SelectValue placeholder="Select supplier" />
                          </SelectTrigger>
                          <SelectContent>
                            {priceBookSuppliers.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">Tick items to import:</p>
                        {priceBookImport.items.map((item, idx) => (
                          <div key={idx} className="flex items-center gap-2 text-xs">
                            <input
                              type="checkbox"
                              checked={item.checked}
                              onChange={e => setPriceBookImport(p => ({
                                ...p,
                                items: p.items.map((it, j) => j === idx ? { ...it, checked: e.target.checked } : it),
                              }))}
                              className="h-3.5 w-3.5 rounded shrink-0"
                              data-testid={`checkbox-pb-item-${idx}`}
                            />
                            <Input
                              value={item.productName}
                              onChange={e => setPriceBookImport(p => ({
                                ...p,
                                items: p.items.map((it, j) => j === idx ? { ...it, productName: e.target.value } : it),
                              }))}
                              className="h-7 text-xs flex-1 min-w-0"
                              data-testid={`input-pb-name-${idx}`}
                            />
                            <Select
                              value={item.categoryId || "none"}
                              onValueChange={v => setPriceBookImport(p => ({
                                ...p,
                                items: p.items.map((it, j) => j === idx ? { ...it, categoryId: v === "none" ? "" : v } : it),
                              }))}
                            >
                              <SelectTrigger className="h-7 text-xs w-32 shrink-0" data-testid={`select-pb-cat-${idx}`}>
                                <SelectValue placeholder="Category" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">No category</SelectItem>
                                {categories.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            <span className="text-muted-foreground shrink-0 w-14 text-right">${parseFloat(item.unitPrice || "0").toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
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

      <Dialog open={showBoardImport} onOpenChange={(open) => { setShowBoardImport(open); if (!open) setExpandedBoards(new Set()); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shapes className="h-5 w-5" /> Import from Planning Board
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {boardMaterialsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : boardMaterials.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-6" data-testid="text-no-board-materials">
                No materials or products found on this project's planning boards.
              </p>
            ) : (
              <div className="max-h-96 overflow-y-auto space-y-3">
                {boardMaterials.map((board: any) => (
                  <div key={board.boardId} data-testid={`board-group-${board.boardId}`}>
                    <button
                      className="flex items-center gap-2 w-full text-left text-sm font-medium py-1.5 hover-elevate rounded-md px-2"
                      onClick={() => {
                        setExpandedBoards(prev => {
                          const next = new Set(prev);
                          if (next.has(board.boardId)) next.delete(board.boardId);
                          else next.add(board.boardId);
                          return next;
                        });
                      }}
                      data-testid={`button-toggle-board-${board.boardId}`}
                    >
                      {expandedBoards.has(board.boardId) ? (
                        <ChevronDown className="h-4 w-4 shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0" />
                      )}
                      {board.boardName}
                      <Badge variant="secondary" className="ml-auto">{board.materials.length}</Badge>
                    </button>
                    {expandedBoards.has(board.boardId) && (
                      <div className="ml-6 mt-1 space-y-1">
                        {board.materials.map((mat: any) => {
                          const content = mat.content || {};
                          const name = content.name || "Untitled";
                          const supplier = content.supplier || "";
                          const price = content.price || "";
                          const code = content.code || "";
                          return (
                            <button
                              key={mat.id}
                              className="w-full text-left p-2 rounded-md border text-sm hover-elevate"
                              onClick={() => {
                                if (mat.type === "product") {
                                  const notes = [name, supplier].filter(Boolean).join(" — ");
                                  setNewItem(prev => ({
                                    ...prev,
                                    notes,
                                    materialCost: price || prev.materialCost,
                                    unitCost: price || prev.unitCost,
                                    quantity: prev.quantity || "1",
                                    isCustomRate: true,
                                    customCategory: name || "Product",
                                  }));
                                } else {
                                  const notes = [name, supplier, code].filter(Boolean).join(" — ");
                                  setNewItem(prev => ({
                                    ...prev,
                                    notes,
                                    quantity: prev.quantity || "1",
                                    isCustomRate: true,
                                    customCategory: name,
                                  }));
                                }
                                setShowBoardImport(false);
                                setShowAddItem(true);
                              }}
                              data-testid={`button-select-material-${mat.id}`}
                            >
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium">{name}</span>
                                <Badge variant="outline" className="text-[10px]">{mat.type}</Badge>
                              </div>
                              <div className="text-xs text-muted-foreground mt-0.5">
                                {supplier && <span>{supplier}</span>}
                                {price && <span className="ml-2">${price}</span>}
                                {code && <span className="ml-2">Code: {code}</span>}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showAlternatives} onOpenChange={(open) => { setShowAlternatives(open); if (!open) setAlternativesResults(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5" /> Cost-Saving Alternatives
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {suggestAlternativesMutation.isPending && !alternativesResults && (
              <div className="flex flex-col items-center justify-center py-8 gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Analyzing your estimate and finding alternatives...</p>
              </div>
            )}
            {alternativesResults && (
              <>
                <div className="p-3 rounded-lg bg-muted/50 text-sm" data-testid="text-alternatives-summary">
                  {alternativesResults.summary}
                </div>
                {parseFloat(alternativesResults.totalPotentialSavings) > 0 && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
                    <ArrowDownRight className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-medium text-green-700 dark:text-green-400" data-testid="text-total-savings">
                      Potential savings: up to ${parseFloat(alternativesResults.totalPotentialSavings).toLocaleString("en-CA", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                )}
                <div className="max-h-80 overflow-y-auto space-y-3">
                  {alternativesResults.suggestions?.map((sug: any, idx: number) => {
                    const linkedItem = itemTotals.find(i => i.id === sug.itemId);
                    return (
                      <div key={idx} className="p-3 rounded-lg border space-y-2" data-testid={`alternative-${idx}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-sm font-medium">{sug.alternativeName}</div>
                            {linkedItem && (
                              <div className="text-xs text-muted-foreground">
                                Replaces: {linkedItem.categoryName}
                              </div>
                            )}
                          </div>
                          {parseFloat(sug.estimatedSavings) > 0 && (
                            <Badge variant="outline" className="text-green-600 border-green-300 shrink-0">
                              Save ${parseFloat(sug.estimatedSavings).toLocaleString("en-CA", { minimumFractionDigits: 2 })}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{sug.alternativeDescription}</p>
                        {sug.estimatedCost && (
                          <div className="text-xs text-muted-foreground">
                            Estimated unit cost: ${parseFloat(sug.estimatedCost).toFixed(2)}
                            {linkedItem && ` (current: $${parseFloat(linkedItem.unitCost).toFixed(2)})`}
                          </div>
                        )}
                        {sug.tradeoffs && (
                          <div className="text-xs p-2 rounded bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400">
                            <strong>Trade-offs:</strong> {sug.tradeoffs}
                          </div>
                        )}
                        <Button 
                          size="sm" 
                          className="w-full mt-2" 
                          onClick={() => applyAlternative(sug)}
                          disabled={applyingAlt === sug.itemId}
                          data-testid={`button-apply-alternative-${idx}`}
                        >
                          {applyingAlt === sug.itemId ? (
                            <><Loader2 className="h-3 w-3 mr-2 animate-spin" /> Applying...</>
                          ) : (
                            <><CheckCircle2 className="h-3 w-3 mr-2" /> Apply Suggestion</>
                          )}
                        </Button>
                      </div>
                    );
                  })}
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    setAlternativesResults(null);
                    suggestAlternativesMutation.mutate(activeEstimate!.budget!);
                  }}
                  disabled={suggestAlternativesMutation.isPending}
                  className="w-full"
                  data-testid="button-regenerate-alternatives"
                >
                  {suggestAlternativesMutation.isPending ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Regenerating...</>
                  ) : (
                    <><Sparkles className="h-4 w-4 mr-2" /> Generate New Suggestions</>
                  )}
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showAiAnalyzer} onOpenChange={setShowAiAnalyzer}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" /> AI Scope Analyzer
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="mb-2 block">Describe the project scope</Label>
              <Textarea
                placeholder="e.g., 2,400 sq ft lakefront cottage renovation. 3 bedrooms, 2 full bathrooms, open-concept kitchen and living area. Full gut renovation including new roof, windows, insulation, electrical and plumbing. Hardwood floors throughout, quartz countertops, custom cabinetry. New composite deck (600 sq ft) and dock replacement."
                value={aiDescription}
                onChange={(e) => setAiDescription(e.target.value)}
                rows={5}
                data-testid="textarea-ai-description"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Include details like total square footage, number of rooms, scope of work, finish level, and any special features. The more detail you provide, the more accurate the estimate.
              </p>
            </div>

            {!aiResults && (
              <Button
                onClick={() => aiAnalyzeMutation.mutate(aiDescription)}
                disabled={!aiDescription.trim() || aiAnalyzeMutation.isPending}
                className="w-full"
                data-testid="button-run-ai-analysis"
              >
                {aiAnalyzeMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analyzing scope...</>
                ) : (
                  <><Sparkles className="h-4 w-4 mr-2" /> Analyze & Generate Estimate</>
                )}
              </Button>
            )}

            {aiResults && (
              <div className="space-y-3">
                <div className="p-3 rounded-lg bg-muted/50 text-sm" data-testid="text-ai-summary">
                  {aiResults.summary}
                </div>
                <div className="max-h-64 overflow-y-auto space-y-1">
                  {aiResults.items?.map((item: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between gap-3 p-2 rounded border text-sm" data-testid={`ai-item-${idx}`}>
                      <div>
                        <span className="font-medium">{item.categoryName}</span>
                        <span className="text-muted-foreground ml-2">
                          {item.quantity} {item.unitType === "sq_ft" ? "sq ft" : "units"} @ ${parseFloat(item.unitCost).toFixed(2)}
                        </span>
                      </div>
                      <div className="font-medium shrink-0">
                        ${(parseFloat(item.quantity) * parseFloat(item.unitCost)).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between gap-3 pt-2 border-t font-semibold">
                  <span>Projected Total</span>
                  <span data-testid="text-ai-projected-total">
                    ${aiResults.items?.reduce((sum: number, item: any) => sum + parseFloat(item.quantity) * parseFloat(item.unitCost), 0).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button onClick={applyAiResults} disabled={applyingAi} className="flex-1" data-testid="button-apply-ai-results">
                    {applyingAi ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Adding items...</>
                    ) : (
                      <><CheckCircle2 className="h-4 w-4 mr-2" /> Apply to Estimate</>
                    )}
                  </Button>
                  <Button variant="outline" onClick={() => { setAiResults(null); }} data-testid="button-retry-ai">
                    Re-analyze
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
