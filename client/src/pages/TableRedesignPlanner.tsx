import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useUpload } from "@/hooks/use-upload";
import { useToast } from "@/hooks/use-toast";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { AlertTriangle, ArrowLeft, Check, ExternalLink, Loader2, Plus, Trash2, Upload, Image, Send, Copy, Eye, X } from "lucide-react";
import { Link } from "wouter";
import type { TableRedesignPlan, TableRedesignMaterial } from "@shared/schema";

const PIECE_TYPES = [
  { value: "table", label: "Table" },
  { value: "desk", label: "Desk" },
  { value: "console", label: "Console" },
  { value: "coffee_table", label: "Coffee Table" },
];

const TABLE_SHAPES = [
  { value: "rectangular", label: "Rectangular" },
  { value: "round", label: "Round" },
  { value: "oval", label: "Oval" },
  { value: "square", label: "Square" },
];

const WEIGHT_CLASSES = [
  { value: "light", label: "Light" },
  { value: "medium", label: "Medium" },
  { value: "heavy", label: "Heavy" },
  { value: "unknown", label: "Unknown" },
];

const REDESIGN_SCOPES = [
  { value: "base_only", label: "Base Only" },
  { value: "finish", label: "Finish" },
  { value: "full", label: "Full Redesign" },
];

const BASE_TYPES = [
  { value: "pedestal", label: "Pedestal" },
  { value: "trestle", label: "Trestle" },
  { value: "four_leg", label: "Four-Leg" },
  { value: "plinth", label: "Plinth" },
  { value: "custom", label: "Custom" },
];

const INTENDED_USES = [
  { value: "dining", label: "Dining" },
  { value: "occasional", label: "Occasional" },
  { value: "display", label: "Display" },
  { value: "high_use", label: "High-Use" },
  { value: "decorative", label: "Decorative" },
];

const PRIORITY_CONSTRAINTS = [
  { value: "aesthetic", label: "Aesthetic" },
  { value: "durability", label: "Durability" },
  { value: "budget", label: "Budget" },
  { value: "timeline", label: "Timeline" },
];

const APPROVAL_STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "ready_for_client", label: "Ready for Client" },
  { value: "approved", label: "Approved" },
  { value: "revise", label: "Revise" },
];

const HEAVY_MATERIALS = ["stone", "granite", "marble", "glass", "concrete", "quartz", "slate", "travertine"];

function calculateBaseRange(
  shape: string,
  lengthInches: number | null,
  widthInches: number | null,
  weightClass: string,
  existingMaterial: string | null
): { min: number; max: number; notes: string; isHeavy: boolean } {
  const l = lengthInches || 48;
  const w = widthInches || l;
  const matLower = (existingMaterial || "").toLowerCase();
  const isHeavy = weightClass === "heavy" || HEAVY_MATERIALS.some(m => matLower.includes(m));

  let minRatio: number, maxRatio: number;
  let notes = "";

  if (shape === "round" || shape === "oval") {
    minRatio = isHeavy ? 0.60 : 0.55;
    maxRatio = isHeavy ? 0.75 : 0.70;
    notes = `${shape === "round" ? "Round" : "Oval"}: central support or leg spread = ${Math.round(minRatio * 100)}–${Math.round(maxRatio * 100)}% of top diameter.`;
  } else {
    minRatio = isHeavy ? 0.70 : 0.60;
    maxRatio = isHeavy ? 0.80 : 0.75;
    notes = `Rectangular/Square: base footprint = ${Math.round(minRatio * 100)}–${Math.round(maxRatio * 100)}% of top dimensions.`;
  }

  if (isHeavy) {
    notes += " Heavy top detected — wider base recommended for stability.";
  }

  const primaryDim = Math.max(l, w);
  const min = Math.round(primaryDim * minRatio);
  const max = Math.round(primaryDim * maxRatio);

  return { min, max, notes, isHeavy };
}

export default function TableRedesignPlanner() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { uploadFile, isUploading } = useUpload();

  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showShareView, setShowShareView] = useState(false);
  const [pushBoardId, setPushBoardId] = useState<string>("");
  const [pushBoardTag, setPushBoardTag] = useState<string>("");
  const [showPushDialog, setShowPushDialog] = useState(false);

  const [draftPlanId, setDraftPlanId] = useState<number | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftIdRef = useRef<number | null>(null);
  const creatingRef = useRef(false);
  const pendingUpdateRef = useRef(false);

  const initialForm = {
    pieceType: "table",
    pieceName: "",
    beforeImageUrl: "",
    inspirationImageUrl: "",
    conceptImageUrl: "",
    tableShape: "rectangular",
    lengthInches: "",
    widthInches: "",
    heightInches: "30",
    thicknessInches: "",
    weightClass: "unknown",
    existingMaterial: "",
    redesignScope: "full",
    proposedBaseType: "",
    styleDirection: "",
    finishDirection: "",
    intendedUse: "",
    priorityConstraint: "",
    approvalStatus: "draft",
    conceptTitle: "",
    conceptDescription: "",
    buildNotes: "",
  };

  const [form, setForm] = useState(initialForm);

  const { data: projects } = useQuery<any[]>({ queryKey: ["/api/projects"] });
  const { data: plans, isLoading: plansLoading } = useQuery<TableRedesignPlan[]>({
    queryKey: ["/api/redesign-plans", selectedProjectId],
    queryFn: async () => {
      const url = selectedProjectId ? `/api/redesign-plans?projectId=${selectedProjectId}` : "/api/redesign-plans";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch plans");
      return res.json();
    },
  });

  const selectedPlan = plans?.find(p => p.id === selectedPlanId);

  const { data: materials } = useQuery<TableRedesignMaterial[]>({
    queryKey: ["/api/redesign-plans", selectedPlanId, "materials"],
    queryFn: async () => {
      const res = await fetch(`/api/redesign-plans/${selectedPlanId}/materials`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch materials");
      return res.json();
    },
    enabled: !!selectedPlanId,
  });

  const { data: boards } = useQuery<any[]>({
    queryKey: ["/api/projects", selectedPlan?.projectId, "planning-boards"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${selectedPlan?.projectId}/planning-boards`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch boards");
      return res.json();
    },
    enabled: !!selectedPlan?.projectId,
  });

  const updatePlan = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest("PATCH", `/api/redesign-plans/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/redesign-plans"] });
      toast({ title: "Plan updated" });
    },
  });

  const deletePlan = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/redesign-plans/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/redesign-plans"] });
      setSelectedPlanId(null);
      toast({ title: "Plan deleted" });
    },
  });

  const addMaterial = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", `/api/redesign-plans/${selectedPlanId}/materials`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/redesign-plans", selectedPlanId, "materials"] });
    },
  });

  const deleteMaterial = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/redesign-plans/${selectedPlanId}/materials/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/redesign-plans", selectedPlanId, "materials"] });
    },
  });

  const pushToBoard = useMutation({
    mutationFn: async ({ planId, boardId, tag }: { planId: number; boardId: number; tag?: string }) => {
      const res = await apiRequest("POST", `/api/redesign-plans/${planId}/push-to-board`, { boardId, tag: tag || undefined });
      return res.json();
    },
    onSuccess: () => {
      setShowPushDialog(false);
      setPushBoardTag("");
      toast({ title: "Card added to Planning Board" });
    },
  });

  const buildPayload = () => {
    const base = calculateBaseRange(
      form.tableShape,
      form.lengthInches ? parseInt(form.lengthInches, 10) || null : null,
      form.widthInches ? parseInt(form.widthInches, 10) || null : null,
      form.weightClass,
      form.existingMaterial
    );
    return {
      projectId: parseInt(selectedProjectId),
      pieceType: form.pieceType,
      pieceName: form.pieceName,
      beforeImageUrl: form.beforeImageUrl || null,
      inspirationImageUrl: form.inspirationImageUrl || null,
      conceptImageUrl: form.conceptImageUrl || null,
      tableShape: form.tableShape,
      lengthInches: form.lengthInches ? parseInt(form.lengthInches, 10) || null : null,
      widthInches: form.widthInches ? parseInt(form.widthInches, 10) || null : null,
      heightInches: form.heightInches ? parseInt(form.heightInches, 10) || null : null,
      thicknessInches: form.thicknessInches ? parseInt(form.thicknessInches, 10) || null : null,
      weightClass: form.weightClass,
      existingMaterial: form.existingMaterial || null,
      redesignScope: form.redesignScope,
      proposedBaseType: form.proposedBaseType || null,
      styleDirection: form.styleDirection || null,
      finishDirection: form.finishDirection || null,
      intendedUse: form.intendedUse || null,
      priorityConstraint: form.priorityConstraint || null,
      approvalStatus: form.approvalStatus,
      conceptTitle: form.conceptTitle || form.pieceName,
      conceptDescription: form.conceptDescription || null,
      baseSizeMinInches: base.min,
      baseSizeMaxInches: base.max,
      baseSizeNotes: base.notes,
      buildNotes: form.buildNotes || null,
    };
  };

  useEffect(() => {
    if (!showCreateForm) return;
    if (!selectedProjectId || selectedProjectId === "all" || !form.pieceName.trim()) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);

    const delay = draftIdRef.current ? 800 : 300;
    debounceRef.current = setTimeout(async () => {
      setSaveStatus("saving");
      try {
        if (draftIdRef.current) {
          const payload = buildPayload();
          await apiRequest("PATCH", `/api/redesign-plans/${draftIdRef.current}`, payload);
        } else if (!creatingRef.current) {
          creatingRef.current = true;
          pendingUpdateRef.current = false;
          const payload = buildPayload();
          const res = await apiRequest("POST", "/api/redesign-plans", payload);
          const created = await res.json();
          setDraftPlanId(created.id);
          draftIdRef.current = created.id;
          creatingRef.current = false;
          if (pendingUpdateRef.current) {
            pendingUpdateRef.current = false;
            const freshPayload = buildPayload();
            await apiRequest("PATCH", `/api/redesign-plans/${created.id}`, freshPayload);
          }
        } else {
          pendingUpdateRef.current = true;
        }
        queryClient.invalidateQueries({ queryKey: ["/api/redesign-plans"] });
        setSaveStatus("saved");
      } catch {
        setSaveStatus("idle");
        creatingRef.current = false;
      }
    }, delay);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [form, selectedProjectId, showCreateForm]);

  const handleUpload = async (field: "beforeImageUrl" | "inspirationImageUrl" | "conceptImageUrl") => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const result = await uploadFile(file);
      if (result) {
        const publicUrl = result.objectPath;
        setForm(prev => ({ ...prev, [field]: publicUrl }));
        if (selectedPlanId && !showCreateForm) {
          updatePlan.mutate({ id: selectedPlanId, data: { [field]: publicUrl } });
        } else if (draftIdRef.current) {
          try {
            await apiRequest("PATCH", `/api/redesign-plans/${draftIdRef.current}`, { [field]: publicUrl });
            queryClient.invalidateQueries({ queryKey: ["/api/redesign-plans"] });
          } catch {}
        }
      }
    };
    input.click();
  };

  const baseRange = selectedPlan
    ? calculateBaseRange(
        selectedPlan.tableShape,
        selectedPlan.lengthInches,
        selectedPlan.widthInches,
        selectedPlan.weightClass,
        selectedPlan.existingMaterial
      )
    : null;

  const isHeavyTop = selectedPlan && (
    selectedPlan.weightClass === "heavy" ||
    HEAVY_MATERIALS.some(m => (selectedPlan.existingMaterial || "").toLowerCase().includes(m))
  );

  const handleNewPlan = () => {
    setForm(initialForm);
    setDraftPlanId(null);
    draftIdRef.current = null;
    creatingRef.current = false;
    setSaveStatus("idle");
    setShowCreateForm(true);
    setSelectedPlanId(null);
  };

  const handleDoneCreate = () => {
    if (draftPlanId) {
      setSelectedPlanId(draftPlanId);
    }
    setShowCreateForm(false);
    setDraftPlanId(null);
    draftIdRef.current = null;
    creatingRef.current = false;
    setSaveStatus("idle");
    setForm(initialForm);
  };

  const handleCopyShareText = () => {
    if (!selectedPlan) return;
    const lines = [
      selectedPlan.conceptTitle || selectedPlan.pieceName,
      "",
      selectedPlan.conceptDescription || "",
      "",
      materials?.length ? "Materials:" : "",
      ...(materials || []).map(m => `• ${m.component}${m.material ? ` — ${m.material}` : ""}${m.finish ? ` (${m.finish})` : ""}${m.webLink ? ` [${m.webLink}]` : ""}`),
      "",
      "Concept and planning preview only. Final result may vary based on material availability, structural requirements, and on-site conditions.",
    ].filter(Boolean).join("\n");
    navigator.clipboard.writeText(lines);
    toast({ title: "Copied to clipboard" });
  };

  if (!user || user.role !== "admin") {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="p-8 text-center">
          <p className="text-muted-foreground">Admin access required.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold uppercase tracking-wide" data-testid="text-page-title">
              FURNITURE PLANNER
            </h1>
            <p className="text-sm text-muted-foreground">Create and manage furniture redesign concepts</p>
          </div>
        </div>

        <div className="flex gap-4 mb-6 items-end">
          <div className="w-64">
            <Label>Filter by Project</Label>
            <Select value={selectedProjectId} onValueChange={(v) => { setSelectedProjectId(v); setSelectedPlanId(null); }}>
              <SelectTrigger data-testid="select-project-filter">
                <SelectValue placeholder="All Projects" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Projects</SelectItem>
                {projects?.map((p: any) => (
                  <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleNewPlan} data-testid="button-new-plan">
            <Plus className="h-4 w-4 mr-2" /> New Concept
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Plan list sidebar */}
          <div className="col-span-1 lg:col-span-3">
            <Card>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm uppercase tracking-wider">Concepts</CardTitle>
              </CardHeader>
              <CardContent className="p-2">
                {plansLoading && <p className="text-sm text-muted-foreground px-2">Loading…</p>}
                {plans?.length === 0 && <p className="text-sm text-muted-foreground px-2">No concepts yet</p>}
                {plans?.map(plan => {
                  const isSelected = selectedPlanId === plan.id || (showCreateForm && draftPlanId === plan.id);
                  return (
                    <button
                      key={plan.id}
                      onClick={() => {
                        if (showCreateForm && draftPlanId === plan.id) {
                          handleDoneCreate();
                        } else {
                          setSelectedPlanId(plan.id);
                          setShowCreateForm(false);
                          setDraftPlanId(null);
                          draftIdRef.current = null;
                          creatingRef.current = false;
                          setSaveStatus("idle");
                          setForm(initialForm);
                        }
                      }}
                      className={`w-full text-left px-3 py-2 rounded-md text-sm hover:bg-accent transition-colors ${
                        isSelected ? "bg-accent text-accent-foreground" : ""
                      }`}
                      data-testid={`button-plan-${plan.id}`}
                    >
                      <div className="font-medium truncate">{plan.conceptTitle || plan.pieceName}</div>
                      <div className={`text-xs capitalize ${isSelected ? "text-accent-foreground/70" : "text-muted-foreground"}`}>
                        {(plan.approvalStatus || plan.status || "draft").replace("_", " ")}
                      </div>
                    </button>
                  );
                })}
              </CardContent>
            </Card>
          </div>

          {/* Main content */}
          <div className="col-span-1 lg:col-span-9">
            {showCreateForm && (
              <Card>
                <CardHeader>
                  <CardTitle className="uppercase tracking-wider">New Concept</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <Label>Project *</Label>
                    <Select value={selectedProjectId || ""} onValueChange={setSelectedProjectId}>
                      <SelectTrigger data-testid="select-project">
                        <SelectValue placeholder="Select project" />
                      </SelectTrigger>
                      <SelectContent>
                        {projects?.map((p: any) => (
                          <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Piece Name *</Label>
                    <Input
                      value={form.pieceName}
                      onChange={e => setForm(f => ({ ...f, pieceName: e.target.value }))}
                      placeholder="e.g. Client's Dining Table"
                      data-testid="input-piece-name"
                    />
                  </div>

                  <Separator />
                  <h3 className="text-sm font-semibold uppercase tracking-wider">Images</h3>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <Label>Before Image</Label>
                      <Button variant="outline" className="w-full mt-1" onClick={() => handleUpload("beforeImageUrl")} disabled={isUploading} data-testid="button-upload-before">
                        <Upload className="h-4 w-4 mr-2" /> {form.beforeImageUrl ? "Replace" : "Upload"}
                      </Button>
                      {form.beforeImageUrl && <img src={form.beforeImageUrl} className="mt-2 rounded h-20 object-cover w-full" alt="Before" />}
                    </div>
                    <div>
                      <Label>Inspiration Image</Label>
                      <Button variant="outline" className="w-full mt-1" onClick={() => handleUpload("inspirationImageUrl")} disabled={isUploading} data-testid="button-upload-inspiration">
                        <Image className="h-4 w-4 mr-2" /> {form.inspirationImageUrl ? "Replace" : "Upload"}
                      </Button>
                      {form.inspirationImageUrl && <img src={form.inspirationImageUrl} className="mt-2 rounded h-20 object-cover w-full" alt="Inspiration" />}
                    </div>
                    <div>
                      <Label>Concept Image (Optional)</Label>
                      <Button variant="outline" className="w-full mt-1" onClick={() => handleUpload("conceptImageUrl")} disabled={isUploading} data-testid="button-upload-concept">
                        <Image className="h-4 w-4 mr-2" /> {form.conceptImageUrl ? "Replace" : "Upload"}
                      </Button>
                      {form.conceptImageUrl && <img src={form.conceptImageUrl} className="mt-2 rounded h-20 object-cover w-full" alt="Concept" />}
                    </div>
                  </div>

                  <Separator />
                  <h3 className="text-sm font-semibold uppercase tracking-wider">Dimensions & Weight</h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label>Weight Class *</Label>
                      <Select value={form.weightClass} onValueChange={v => setForm(f => ({ ...f, weightClass: v }))}>
                        <SelectTrigger data-testid="select-weight">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {WEIGHT_CLASSES.map(w => <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div>
                      <Label>Length (inches)</Label>
                      <Input type="number" value={form.lengthInches} onChange={e => setForm(f => ({ ...f, lengthInches: e.target.value }))} data-testid="input-length" />
                    </div>
                    <div>
                      <Label>Width (inches)</Label>
                      <Input type="number" value={form.widthInches} onChange={e => setForm(f => ({ ...f, widthInches: e.target.value }))} data-testid="input-width" />
                    </div>
                    <div>
                      <Label>Height (inches)</Label>
                      <Input type="number" value={form.heightInches} onChange={e => setForm(f => ({ ...f, heightInches: e.target.value }))} data-testid="input-height" />
                    </div>
                    <div>
                      <Label>Thickness (inches)</Label>
                      <Input type="number" value={form.thicknessInches} onChange={e => setForm(f => ({ ...f, thicknessInches: e.target.value }))} data-testid="input-thickness" />
                    </div>
                  </div>

                  <div>
                    <Label>Existing Material</Label>
                    <Input
                      value={form.existingMaterial}
                      onChange={e => setForm(f => ({ ...f, existingMaterial: e.target.value }))}
                      placeholder="e.g. oak, marble, glass"
                      data-testid="input-existing-material"
                    />
                  </div>

                  {(form.weightClass === "heavy" || HEAVY_MATERIALS.some(m => form.existingMaterial.toLowerCase().includes(m))) && (
                    <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md" data-testid="warning-heavy-top">
                      <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
                      <p className="text-sm text-amber-800 dark:text-amber-200">
                        <strong>Heavy top detected.</strong> Stone, glass, or concrete tops require structural review. Base range will be widened for stability.
                      </p>
                    </div>
                  )}

                  <Separator />
                  <h3 className="text-sm font-semibold uppercase tracking-wider">Design Direction</h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label>Intended Use *</Label>
                      <Select value={form.intendedUse} onValueChange={v => setForm(f => ({ ...f, intendedUse: v }))}>
                        <SelectTrigger data-testid="select-intended-use">
                          <SelectValue placeholder="Select intended use" />
                        </SelectTrigger>
                        <SelectContent>
                          {INTENDED_USES.map(u => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Priority Constraint *</Label>
                      <Select value={form.priorityConstraint} onValueChange={v => setForm(f => ({ ...f, priorityConstraint: v }))}>
                        <SelectTrigger data-testid="select-priority-constraint">
                          <SelectValue placeholder="Select priority" />
                        </SelectTrigger>
                        <SelectContent>
                          {PRIORITY_CONSTRAINTS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label>Redesign Scope *</Label>
                      <Select value={form.redesignScope} onValueChange={v => setForm(f => ({ ...f, redesignScope: v }))}>
                        <SelectTrigger data-testid="select-scope">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {REDESIGN_SCOPES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Proposed Base Type</Label>
                      <Select value={form.proposedBaseType} onValueChange={v => setForm(f => ({ ...f, proposedBaseType: v }))}>
                        <SelectTrigger data-testid="select-base-type">
                          <SelectValue placeholder="Select base type" />
                        </SelectTrigger>
                        <SelectContent>
                          {BASE_TYPES.map(b => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label>Style Direction</Label>
                      <Input
                        value={form.styleDirection}
                        onChange={e => setForm(f => ({ ...f, styleDirection: e.target.value }))}
                        placeholder="e.g. modern farmhouse, mid-century"
                        data-testid="input-style"
                      />
                    </div>
                    <div>
                      <Label>Finish Direction</Label>
                      <Input
                        value={form.finishDirection}
                        onChange={e => setForm(f => ({ ...f, finishDirection: e.target.value }))}
                        placeholder="e.g. matte black, natural oak"
                        data-testid="input-finish"
                      />
                    </div>
                  </div>

                  <Separator />
                  <h3 className="text-sm font-semibold uppercase tracking-wider">Concept Output</h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label>Concept Title</Label>
                      <Input
                        value={form.conceptTitle}
                        onChange={e => setForm(f => ({ ...f, conceptTitle: e.target.value }))}
                        placeholder={form.pieceName || "Auto-fills from piece name if empty"}
                        data-testid="input-concept-title"
                      />
                    </div>
                    <div>
                      <Label>Approval Status</Label>
                      <Select value={form.approvalStatus} onValueChange={v => {
                        if (v !== "draft" && !form.intendedUse) {
                          toast({ title: "Please select an intended use before changing status", variant: "destructive" });
                          return;
                        }
                        if (v !== "draft" && !form.priorityConstraint) {
                          toast({ title: "Please select a priority constraint before changing status", variant: "destructive" });
                          return;
                        }
                        setForm(f => ({ ...f, approvalStatus: v }));
                      }}>
                        <SelectTrigger data-testid="select-approval-status">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {APPROVAL_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <Label>Concept Description</Label>
                    <Textarea
                      value={form.conceptDescription}
                      onChange={e => setForm(f => ({ ...f, conceptDescription: e.target.value }))}
                      placeholder="Short description of the redesign concept"
                      rows={2}
                      data-testid="input-concept-description"
                    />
                  </div>

                  <div>
                    <Label>Scope Notes</Label>
                    <Textarea
                      value={form.buildNotes}
                      onChange={e => setForm(f => ({ ...f, buildNotes: e.target.value }))}
                      rows={2}
                      placeholder="Construction notes, special considerations"
                      data-testid="input-scope-notes"
                    />
                  </div>

                  <div className="flex items-center gap-3">
                    {saveStatus === "saving" && (
                      <span className="flex items-center gap-1 text-sm text-muted-foreground" data-testid="text-save-status">
                        <Loader2 className="h-3 w-3 animate-spin" /> Saving…
                      </span>
                    )}
                    {saveStatus === "saved" && (
                      <span className="flex items-center gap-1 text-sm text-green-600" data-testid="text-save-status">
                        <Check className="h-3 w-3" /> Saved
                      </span>
                    )}
                    {saveStatus === "idle" && !draftPlanId && (
                      <span className="text-sm text-muted-foreground" data-testid="text-save-status">
                        Select a project and enter a piece name to start
                      </span>
                    )}
                    <Button variant="outline" onClick={handleDoneCreate} data-testid="button-done-create">
                      {draftPlanId ? "Done" : "Cancel"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {selectedPlan && !showCreateForm && (
              <div className="space-y-6">
                {/* Plan detail header */}
                <Card>
                  <CardHeader className="py-3 px-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <CardTitle className="uppercase tracking-wider text-sm leading-tight" data-testid="text-plan-title">
                          {selectedPlan.conceptTitle || selectedPlan.pieceName}
                        </CardTitle>
                        <div className="flex gap-1.5 mt-1.5 flex-wrap">
                          <Badge variant="outline" className="capitalize text-xs px-1.5 py-0">{selectedPlan.redesignScope.replace("_", " ")}</Badge>
                          {selectedPlan.intendedUse && (
                            <Badge variant="outline" className="capitalize text-xs px-1.5 py-0">{selectedPlan.intendedUse.replace("_", " ")}</Badge>
                          )}
                          {selectedPlan.proposedBaseType && (
                            <Badge variant="secondary" className="capitalize text-xs px-1.5 py-0">
                              Base: {selectedPlan.proposedBaseType.replace("_", " ")}
                            </Badge>
                          )}
                          <Badge className={`capitalize text-xs px-1.5 py-0 ${
                            selectedPlan.approvalStatus === "approved" ? "bg-green-600" :
                            selectedPlan.approvalStatus === "ready_for_client" ? "bg-blue-600" :
                            selectedPlan.approvalStatus === "revise" ? "bg-amber-600" : ""
                          }`}>
                            {(selectedPlan.approvalStatus || "draft").replace("_", " ")}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => setShowPushDialog(true)} data-testid="button-push-to-board">
                          <Send className="h-3.5 w-3.5 mr-1" /> Board
                        </Button>
                        <Button variant="destructive" size="sm" className="h-7 w-7 px-0" onClick={() => deletePlan.mutate(selectedPlan.id)} data-testid="button-delete-plan">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {isHeavyTop && (
                      <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md" data-testid="warning-heavy-top-detail">
                        <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
                        <p className="text-sm text-amber-800 dark:text-amber-200">
                          <strong>Heavy top detected.</strong> Stone, glass, or concrete tops require structural review before final build.
                        </p>
                      </div>
                    )}

                    {/* Images row */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {[
                        { key: "beforeImageUrl" as const, label: "Before" },
                        { key: "inspirationImageUrl" as const, label: "Inspiration" },
                        { key: "conceptImageUrl" as const, label: "Concept" },
                      ].map(({ key, label }) => (
                        <div key={key} className="space-y-1">
                          <Label className="text-xs">{label}</Label>
                          {selectedPlan[key] ? (
                            <div className="relative group">
                              <img src={selectedPlan[key]!} className="rounded border h-32 w-full object-cover" alt={label} />
                              <Button
                                variant="outline"
                                size="sm"
                                className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity h-7 text-xs"
                                onClick={() => handleUpload(key)}
                                disabled={isUploading}
                              >
                                Replace
                              </Button>
                            </div>
                          ) : (
                            <Button variant="outline" className="w-full h-32 border-dashed" onClick={() => handleUpload(key)} disabled={isUploading} data-testid={`button-upload-${key}`}>
                              <Upload className="h-4 w-4 mr-2" /> Upload {label}
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Dimensions summary */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                      <div className="bg-muted/50 rounded p-2">
                        <div className="text-xs text-muted-foreground">Dimensions</div>
                        <div className="font-medium">
                          {selectedPlan.lengthInches || "—"}" × {selectedPlan.widthInches || "—"}" × {selectedPlan.heightInches || "—"}"
                        </div>
                      </div>
                      <div className="bg-muted/50 rounded p-2">
                        <div className="text-xs text-muted-foreground">Weight</div>
                        <div className="font-medium capitalize">{selectedPlan.weightClass}</div>
                      </div>
                      <div className="bg-muted/50 rounded p-2">
                        <div className="text-xs text-muted-foreground">Material</div>
                        <div className="font-medium">{selectedPlan.existingMaterial || "—"}</div>
                      </div>
                    </div>

                    {selectedPlan.conceptDescription && (
                      <div>
                        <Label className="text-xs text-muted-foreground">Description</Label>
                        <p className="text-sm mt-1">{selectedPlan.conceptDescription}</p>
                      </div>
                    )}

                    {/* Base size range */}
                    {baseRange && (
                      <Card className="border-primary/20">
                        <CardContent className="py-3 px-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="text-sm font-semibold uppercase tracking-wider">Recommended Base Size Range</h4>
                                <Badge variant="outline" className="text-xs">Planning Guidance Only</Badge>
                              </div>
                              <p className="text-2xl font-bold mt-1" data-testid="text-base-range">
                                {selectedPlan.baseSizeMinInches || baseRange.min}" – {selectedPlan.baseSizeMaxInches || baseRange.max}"
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">{selectedPlan.baseSizeNotes || baseRange.notes}</p>
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground mt-2 italic">
                            These values are editable planning estimates, not engineering specifications. Always verify with structural assessment for heavy tops.
                          </p>
                        </CardContent>
                      </Card>
                    )}

                    {selectedPlan.buildNotes && (
                      <div>
                        <Label className="text-xs text-muted-foreground">Scope Notes</Label>
                        <p className="text-sm mt-1">{selectedPlan.buildNotes}</p>
                      </div>
                    )}

                    <div className="text-xs text-muted-foreground italic border-t pt-3" data-testid="text-disclaimer">
                      Concept and planning preview only. Final result may vary based on material availability, structural requirements, and on-site conditions.
                    </div>
                  </CardContent>
                </Card>

                {/* Materials panel */}
                <Card>
                  <CardHeader className="py-3 px-4">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm uppercase tracking-wider">Materials / Spec List</CardTitle>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => addMaterial.mutate({ component: "New Component" })}
                        disabled={addMaterial.isPending}
                        data-testid="button-add-material"
                      >
                        <Plus className="h-3 w-3 mr-1" /> Add
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {(!materials || materials.length === 0) && (
                      <p className="text-sm text-muted-foreground">No materials added yet.</p>
                    )}
                    <div className="space-y-3">
                      {materials?.map(mat => (
                        <MaterialRow
                          key={mat.id}
                          material={mat}
                          planId={selectedPlanId!}
                          onDelete={() => deleteMaterial.mutate(mat.id)}
                        />
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {!selectedPlan && !showCreateForm && (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground">Select a plan from the list or create a new one.</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Push to Board Dialog */}
      <Dialog open={showPushDialog} onOpenChange={setShowPushDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add to Planning Board</DialogTitle>
            <DialogDescription>Choose a board to add a clean concept card.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Select Board</Label>
              <Select value={pushBoardId} onValueChange={setPushBoardId}>
                <SelectTrigger data-testid="select-board">
                  <SelectValue placeholder="Choose a board" />
                </SelectTrigger>
                <SelectContent>
                  {boards?.map((b: any) => (
                    <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tag (optional)</Label>
              <Input
                value={pushBoardTag}
                onChange={e => setPushBoardTag(e.target.value)}
                placeholder="e.g. Option A"
                data-testid="input-push-tag"
              />
            </div>
            <div className="bg-muted/50 rounded p-3 text-sm">
              <p className="font-medium mb-1">Card will contain:</p>
              <ul className="text-muted-foreground text-xs space-y-1">
                <li>• Image (concept or before photo)</li>
                <li>• Title: {selectedPlan?.conceptTitle || selectedPlan?.pieceName}</li>
                <li>• Description (1–2 lines)</li>
                {pushBoardTag && <li>• Tag: {pushBoardTag}</li>}
              </ul>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowPushDialog(false)}>Cancel</Button>
              <Button
                onClick={() => pushToBoard.mutate({ planId: selectedPlan!.id, boardId: parseInt(pushBoardId), tag: pushBoardTag || undefined })}
                disabled={!pushBoardId || pushToBoard.isPending}
                data-testid="button-confirm-push"
              >
                {pushToBoard.isPending ? "Adding…" : "Add Card"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Client Share View Dialog */}
      <Dialog open={showShareView} onOpenChange={setShowShareView}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Client Share View</DialogTitle>
            <DialogDescription>Preview of the presentation-ready summary.</DialogDescription>
          </DialogHeader>
          {selectedPlan && (
            <div className="space-y-4">
              {selectedPlan.beforeImageUrl && (
                <div>
                  <Label className="text-xs text-muted-foreground">Before</Label>
                  <img src={selectedPlan.beforeImageUrl} className="rounded border w-full h-40 object-cover mt-1" alt="Before" />
                </div>
              )}
              {selectedPlan.conceptImageUrl && (
                <div>
                  <Label className="text-xs text-muted-foreground">Concept</Label>
                  <img src={selectedPlan.conceptImageUrl} className="rounded border w-full h-40 object-cover mt-1" alt="Concept" />
                </div>
              )}
              <div>
                <h3 className="font-bold text-lg">{selectedPlan.conceptTitle || selectedPlan.pieceName}</h3>
                <p className="text-sm text-muted-foreground mt-1">{selectedPlan.conceptDescription}</p>
              </div>
              {materials && materials.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold uppercase tracking-wider mb-2">Selected Materials</h4>
                  {materials.map(m => (
                    <div key={m.id} className="text-sm">
                      <span className="font-medium">{m.component}</span>
                      {m.material && <span className="text-muted-foreground"> — {m.material}</span>}
                      {m.finish && <span className="text-muted-foreground"> ({m.finish})</span>}
                    </div>
                  ))}
                </div>
              )}
              {selectedPlan.buildNotes && (
                <div>
                  <h4 className="text-sm font-semibold uppercase tracking-wider mb-1">Scope Notes</h4>
                  <p className="text-sm text-muted-foreground">{selectedPlan.buildNotes}</p>
                </div>
              )}
              <p className="text-xs text-muted-foreground italic">
                Concept and planning preview only. Final result may vary based on material availability, structural requirements, and on-site conditions.
              </p>
              <Button onClick={handleCopyShareText} variant="outline" className="w-full" data-testid="button-copy-share">
                <Copy className="h-4 w-4 mr-2" /> Copy to Clipboard
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MaterialRow({ material, planId, onDelete }: { material: TableRedesignMaterial; planId: number; onDelete: () => void }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    component: material.component,
    material: material.material || "",
    finish: material.finish || "",
    dimensions: material.dimensions || "",
    quantity: String(material.quantity || 1),
    notes: material.notes || "",
    supplier: material.supplier || "",
    webLink: material.webLink || "",
  });

  const updateMaterial = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("PATCH", `/api/redesign-plans/${planId}/materials/${material.id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/redesign-plans", planId, "materials"] });
      setEditing(false);
    },
  });

  if (!editing) {
    return (
      <div className="flex items-center gap-3 p-2 rounded border text-sm group" data-testid={`material-row-${material.id}`}>
        <div className="flex-1 space-y-1">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            <div><span className="text-xs text-muted-foreground block">Component</span>{material.component}</div>
            <div><span className="text-xs text-muted-foreground block">Material</span>{material.material || "—"}</div>
            <div><span className="text-xs text-muted-foreground block">Finish</span>{material.finish || "—"}</div>
            <div><span className="text-xs text-muted-foreground block">Dimensions</span>{material.dimensions || "—"}</div>
            <div><span className="text-xs text-muted-foreground block">Qty</span>{material.quantity || 1}</div>
            <div><span className="text-xs text-muted-foreground block">Supplier</span>{material.supplier || "—"}</div>
          </div>
          {material.webLink && (
            <div className="flex items-center gap-1 text-xs">
              <ExternalLink className="h-3 w-3 text-muted-foreground" />
              <a href={material.webLink} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate max-w-xs" data-testid={`link-material-${material.id}`}>{material.webLink}</a>
            </div>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={() => setEditing(true)} className="opacity-0 group-hover:opacity-100 h-7 text-xs">Edit</Button>
        <Button variant="ghost" size="sm" onClick={onDelete} className="opacity-0 group-hover:opacity-100 h-7 text-xs text-destructive"><Trash2 className="h-3 w-3" /></Button>
      </div>
    );
  }

  return (
    <div className="p-3 rounded border space-y-2" data-testid={`material-edit-${material.id}`}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Input placeholder="Component" value={form.component} onChange={e => setForm(f => ({ ...f, component: e.target.value }))} />
        <Input placeholder="Material" value={form.material} onChange={e => setForm(f => ({ ...f, material: e.target.value }))} />
        <Input placeholder="Finish" value={form.finish} onChange={e => setForm(f => ({ ...f, finish: e.target.value }))} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Input placeholder="Dimensions" value={form.dimensions} onChange={e => setForm(f => ({ ...f, dimensions: e.target.value }))} />
        <Input placeholder="Qty" type="number" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} />
        <Input placeholder="Supplier" value={form.supplier} onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))} />
        <Input placeholder="Notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
      </div>
      <div>
        <Input placeholder="Web link (e.g. supplier URL or cost estimator link)" value={form.webLink} onChange={e => setForm(f => ({ ...f, webLink: e.target.value }))} data-testid="input-material-weblink" />
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => updateMaterial.mutate({ ...form, quantity: parseInt(form.quantity) || 1 })} disabled={updateMaterial.isPending}>Save</Button>
        <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
      </div>
    </div>
  );
}
