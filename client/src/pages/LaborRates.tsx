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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Users, Building2, Plus, Pencil, Trash2, DollarSign, Loader2, Phone, Mail, MapPin, Star } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import type { CostCategory } from "@shared/schema";

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

export default function LaborRates() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isAdmin = (user as any)?.role === "admin";

  const [activeTab, setActiveTab] = useState("crew");
  const [showAddCrew, setShowAddCrew] = useState(false);
  const [editingCrew, setEditingCrew] = useState<CrewRate | null>(null);
  const [showAddSub, setShowAddSub] = useState(false);
  const [editingSub, setEditingSub] = useState<Subcontractor | null>(null);

  const [newCrew, setNewCrew] = useState({ name: "", role: "", payRate: "", billableRate: "", notes: "" });
  const [newSub, setNewSub] = useState({ businessName: "", contactName: "", phone: "", email: "", categoryId: "", trade: "", hourlyRate: "", dailyRate: "", unitRate: "", unitType: "hour", isPreferred: false, address: "", notes: "" });

  const { data: crewRates = [], isLoading: loadingCrew } = useQuery<CrewRate[]>({ queryKey: ["/api/crew-rates"] });
  const { data: subcontractors = [], isLoading: loadingSubs } = useQuery<Subcontractor[]>({ queryKey: ["/api/subcontractors"] });
  const { data: categories = [] } = useQuery<CostCategory[]>({ queryKey: ["/api/cost-categories"] });

  // Crew mutations
  const addCrewMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/crew-rates", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crew-rates"] });
      setShowAddCrew(false);
      setNewCrew({ name: "", role: "", payRate: "", billableRate: "", notes: "" });
      toast({ title: "Crew rate added" });
    },
  });

  const updateCrewMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const res = await apiRequest("PATCH", `/api/crew-rates/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crew-rates"] });
      setEditingCrew(null);
      toast({ title: "Crew rate updated" });
    },
  });

  const deleteCrewMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/crew-rates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crew-rates"] });
      toast({ title: "Crew rate removed" });
    },
  });

  // Subcontractor mutations
  const addSubMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/subcontractors", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/subcontractors"] });
      setShowAddSub(false);
      setNewSub({ businessName: "", contactName: "", phone: "", email: "", categoryId: "", trade: "", hourlyRate: "", dailyRate: "", unitRate: "", unitType: "hour", isPreferred: false, address: "", notes: "" });
      toast({ title: "Subcontractor added" });
    },
  });

  const updateSubMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const res = await apiRequest("PATCH", `/api/subcontractors/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/subcontractors"] });
      setEditingSub(null);
      toast({ title: "Subcontractor updated" });
    },
  });

  const deleteSubMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/subcontractors/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/subcontractors"] });
      toast({ title: "Subcontractor removed" });
    },
  });

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          <p className="text-muted-foreground">Admin access required.</p>
        </div>
      </div>
    );
  }

  const activeCrew = crewRates.filter(c => c.isActive !== false);
  const inactiveCrew = crewRates.filter(c => c.isActive === false);
  const preferredSubs = subcontractors.filter(s => s.isPreferred && s.isActive !== false);
  const otherSubs = subcontractors.filter(s => !s.isPreferred && s.isActive !== false);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 py-6 max-w-6xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-labor-rates-title">Labor & Contractors</h1>
            <p className="text-sm text-muted-foreground">Manage crew pay rates, billable rates, and subcontractor information</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="text-xs text-muted-foreground uppercase tracking-wide">Crew Members</div>
              <div className="text-2xl font-semibold mt-1" data-testid="text-crew-count">{activeCrew.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="text-xs text-muted-foreground uppercase tracking-wide">Avg Pay Rate</div>
              <div className="text-2xl font-semibold mt-1" data-testid="text-avg-pay">
                ${activeCrew.length > 0 ? (activeCrew.reduce((s, c) => s + parseFloat(c.payRate), 0) / activeCrew.length).toFixed(2) : "0.00"}
              </div>
              <div className="text-xs text-muted-foreground">per hour (CAD)</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="text-xs text-muted-foreground uppercase tracking-wide">Subcontractors</div>
              <div className="text-2xl font-semibold mt-1" data-testid="text-sub-count">{subcontractors.filter(s => s.isActive !== false).length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="text-xs text-muted-foreground uppercase tracking-wide">Preferred</div>
              <div className="text-2xl font-semibold mt-1" data-testid="text-preferred-count">{preferredSubs.length}</div>
              <div className="text-xs text-muted-foreground">vendors</div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="crew" data-testid="tab-crew"><Users className="h-4 w-4 mr-2" /> Crew Rates</TabsTrigger>
            <TabsTrigger value="subs" data-testid="tab-subs"><Building2 className="h-4 w-4 mr-2" /> Subcontractors</TabsTrigger>
          </TabsList>

          <TabsContent value="crew">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Crew Pay & Billable Rates</h2>
              <Button onClick={() => setShowAddCrew(true)} data-testid="button-add-crew">
                <Plus className="h-4 w-4 mr-2" /> Add Crew Rate
              </Button>
            </div>

            {loadingCrew ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : (
              <div className="space-y-3">
                {activeCrew.map(crew => (
                  <Card key={crew.id}>
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
                              <div className="font-medium text-red-600" data-testid={`text-crew-pay-${crew.id}`}>${parseFloat(crew.payRate).toFixed(2)}/hr</div>
                            </div>
                            <div>
                              <div className="text-xs text-muted-foreground">Bill Rate</div>
                              <div className="font-medium text-green-600" data-testid={`text-crew-bill-${crew.id}`}>${parseFloat(crew.billableRate).toFixed(2)}/hr</div>
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
                {activeCrew.length === 0 && <p className="text-center text-muted-foreground py-8">No crew rates added yet.</p>}
              </div>
            )}
          </TabsContent>

          <TabsContent value="subs">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Subcontractors & Vendors</h2>
              <Button onClick={() => setShowAddSub(true)} data-testid="button-add-sub">
                <Plus className="h-4 w-4 mr-2" /> Add Subcontractor
              </Button>
            </div>

            {loadingSubs ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : (
              <div className="space-y-6">
                {preferredSubs.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                      <Star className="h-4 w-4 text-amber-500" /> Preferred Vendors
                    </h3>
                    <div className="space-y-3">
                      {preferredSubs.map(sub => <SubcontractorCard key={sub.id} sub={sub} categories={categories} onEdit={setEditingSub} onDelete={(id) => deleteSubMutation.mutate(id)} />)}
                    </div>
                  </div>
                )}
                {otherSubs.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">All Subcontractors</h3>
                    <div className="space-y-3">
                      {otherSubs.map(sub => <SubcontractorCard key={sub.id} sub={sub} categories={categories} onEdit={setEditingSub} onDelete={(id) => deleteSubMutation.mutate(id)} />)}
                    </div>
                  </div>
                )}
                {subcontractors.filter(s => s.isActive !== false).length === 0 && (
                  <p className="text-center text-muted-foreground py-8">No subcontractors added yet.</p>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Add Crew Dialog */}
        <Dialog open={showAddCrew} onOpenChange={setShowAddCrew}>
          <DialogContent>
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
              <Button onClick={() => addCrewMutation.mutate(newCrew)} disabled={!newCrew.name || !newCrew.payRate || !newCrew.billableRate || addCrewMutation.isPending} className="w-full" data-testid="button-save-crew">
                {addCrewMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                Add Crew Rate
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Edit Crew Dialog */}
        <Dialog open={!!editingCrew} onOpenChange={() => setEditingCrew(null)}>
          <DialogContent>
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

        {/* Add Subcontractor Dialog */}
        <Dialog open={showAddSub} onOpenChange={setShowAddSub}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Add Subcontractor</DialogTitle></DialogHeader>
            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
              <div>
                <Label>Business Name</Label>
                <Input value={newSub.businessName} onChange={e => setNewSub(p => ({ ...p, businessName: e.target.value }))} placeholder="e.g., Muskoka Plumbing & Heating" data-testid="input-sub-business" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Contact Name</Label>
                  <Input value={newSub.contactName} onChange={e => setNewSub(p => ({ ...p, contactName: e.target.value }))} placeholder="Dave Morrison" data-testid="input-sub-contact" />
                </div>
                <div>
                  <Label>Trade</Label>
                  <Select value={newSub.categoryId} onValueChange={v => {
                    const cat = categories.find(c => c.id === parseInt(v));
                    setNewSub(p => ({ ...p, categoryId: v, trade: cat?.name || p.trade }));
                  }}>
                    <SelectTrigger data-testid="select-sub-category"><SelectValue placeholder="Select trade" /></SelectTrigger>
                    <SelectContent>
                      {categories.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Phone</Label>
                  <Input value={newSub.phone} onChange={e => setNewSub(p => ({ ...p, phone: e.target.value }))} placeholder="(705) 645-8822" data-testid="input-sub-phone" />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input value={newSub.email} onChange={e => setNewSub(p => ({ ...p, email: e.target.value }))} placeholder="dave@example.ca" data-testid="input-sub-email" />
                </div>
              </div>
              <div>
                <Label>Address</Label>
                <Input value={newSub.address} onChange={e => setNewSub(p => ({ ...p, address: e.target.value }))} placeholder="Bracebridge, ON" data-testid="input-sub-address" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Hourly Rate</Label>
                  <Input type="number" step="0.01" value={newSub.hourlyRate} onChange={e => setNewSub(p => ({ ...p, hourlyRate: e.target.value }))} placeholder="95.00" data-testid="input-sub-hourly" />
                </div>
                <div>
                  <Label>Daily Rate</Label>
                  <Input type="number" step="0.01" value={newSub.dailyRate} onChange={e => setNewSub(p => ({ ...p, dailyRate: e.target.value }))} placeholder="760.00" data-testid="input-sub-daily" />
                </div>
                <div>
                  <Label>Unit Rate</Label>
                  <Input type="number" step="0.01" value={newSub.unitRate} onChange={e => setNewSub(p => ({ ...p, unitRate: e.target.value }))} placeholder="per sq ft" data-testid="input-sub-unit" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={newSub.isPreferred} onCheckedChange={checked => setNewSub(p => ({ ...p, isPreferred: checked }))} data-testid="switch-sub-preferred" />
                <Label>Preferred Vendor</Label>
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea value={newSub.notes} onChange={e => setNewSub(p => ({ ...p, notes: e.target.value }))} placeholder="Certifications, specialties, availability..." data-testid="input-sub-notes" />
              </div>
              <Button onClick={() => addSubMutation.mutate({ ...newSub, categoryId: newSub.categoryId ? parseInt(newSub.categoryId) : null, hourlyRate: newSub.hourlyRate || null, dailyRate: newSub.dailyRate || null, unitRate: newSub.unitRate || null })} disabled={!newSub.businessName || addSubMutation.isPending} className="w-full" data-testid="button-save-sub">
                {addSubMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                Add Subcontractor
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Edit Subcontractor Dialog */}
        <Dialog open={!!editingSub} onOpenChange={() => setEditingSub(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Edit Subcontractor</DialogTitle></DialogHeader>
            {editingSub && (
              <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
                <div>
                  <Label>Business Name</Label>
                  <Input value={editingSub.businessName} onChange={e => setEditingSub({ ...editingSub, businessName: e.target.value })} data-testid="input-edit-sub-business" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Contact Name</Label>
                    <Input value={editingSub.contactName || ""} onChange={e => setEditingSub({ ...editingSub, contactName: e.target.value })} data-testid="input-edit-sub-contact" />
                  </div>
                  <div>
                    <Label>Trade</Label>
                    <Select value={editingSub.categoryId ? String(editingSub.categoryId) : ""} onValueChange={v => {
                      const cat = categories.find(c => c.id === parseInt(v));
                      setEditingSub({ ...editingSub, categoryId: parseInt(v), trade: cat?.name || editingSub.trade });
                    }}>
                      <SelectTrigger data-testid="select-edit-sub-category"><SelectValue placeholder="Select trade" /></SelectTrigger>
                      <SelectContent>
                        {categories.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Phone</Label>
                    <Input value={editingSub.phone || ""} onChange={e => setEditingSub({ ...editingSub, phone: e.target.value })} data-testid="input-edit-sub-phone" />
                  </div>
                  <div>
                    <Label>Email</Label>
                    <Input value={editingSub.email || ""} onChange={e => setEditingSub({ ...editingSub, email: e.target.value })} data-testid="input-edit-sub-email" />
                  </div>
                </div>
                <div>
                  <Label>Address</Label>
                  <Input value={editingSub.address || ""} onChange={e => setEditingSub({ ...editingSub, address: e.target.value })} data-testid="input-edit-sub-address" />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>Hourly Rate</Label>
                    <Input type="number" step="0.01" value={editingSub.hourlyRate || ""} onChange={e => setEditingSub({ ...editingSub, hourlyRate: e.target.value || null })} data-testid="input-edit-sub-hourly" />
                  </div>
                  <div>
                    <Label>Daily Rate</Label>
                    <Input type="number" step="0.01" value={editingSub.dailyRate || ""} onChange={e => setEditingSub({ ...editingSub, dailyRate: e.target.value || null })} data-testid="input-edit-sub-daily" />
                  </div>
                  <div>
                    <Label>Unit Rate</Label>
                    <Input type="number" step="0.01" value={editingSub.unitRate || ""} onChange={e => setEditingSub({ ...editingSub, unitRate: e.target.value || null })} data-testid="input-edit-sub-unit" />
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Switch checked={editingSub.isPreferred === true} onCheckedChange={checked => setEditingSub({ ...editingSub, isPreferred: checked })} />
                    <Label>Preferred</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={editingSub.isActive !== false} onCheckedChange={checked => setEditingSub({ ...editingSub, isActive: checked })} />
                    <Label>Active</Label>
                  </div>
                </div>
                <div>
                  <Label>Notes</Label>
                  <Textarea value={editingSub.notes || ""} onChange={e => setEditingSub({ ...editingSub, notes: e.target.value })} data-testid="input-edit-sub-notes" />
                </div>
                <Button onClick={() => updateSubMutation.mutate(editingSub)} disabled={updateSubMutation.isPending} className="w-full" data-testid="button-update-sub">
                  {updateSubMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Pencil className="h-4 w-4 mr-2" />}
                  Update Subcontractor
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

function SubcontractorCard({ sub, categories, onEdit, onDelete }: { sub: Subcontractor; categories: CostCategory[]; onEdit: (s: Subcontractor) => void; onDelete: (id: number) => void }) {
  const cat = categories.find(c => c.id === sub.categoryId);
  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-semibold" data-testid={`text-sub-name-${sub.id}`}>{sub.businessName}</span>
              {sub.isPreferred && <Badge className="bg-amber-100 text-amber-800 text-xs"><Star className="h-3 w-3 mr-1" /> Preferred</Badge>}
              {cat && <Badge variant="secondary" className="text-xs">{cat.name}</Badge>}
              {!cat && sub.trade && <Badge variant="outline" className="text-xs">{sub.trade}</Badge>}
            </div>
            <div className="flex flex-wrap gap-4 mt-2 text-sm text-muted-foreground">
              {sub.contactName && <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {sub.contactName}</span>}
              {sub.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {sub.phone}</span>}
              {sub.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {sub.email}</span>}
              {sub.address && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {sub.address}</span>}
            </div>
            <div className="flex flex-wrap gap-4 mt-2">
              {sub.hourlyRate && (
                <div>
                  <span className="text-xs text-muted-foreground">Hourly: </span>
                  <span className="font-medium" data-testid={`text-sub-hourly-${sub.id}`}>${parseFloat(sub.hourlyRate).toFixed(2)}/hr</span>
                </div>
              )}
              {sub.dailyRate && (
                <div>
                  <span className="text-xs text-muted-foreground">Daily: </span>
                  <span className="font-medium">${parseFloat(sub.dailyRate).toFixed(2)}/day</span>
                </div>
              )}
              {sub.unitRate && (
                <div>
                  <span className="text-xs text-muted-foreground">Unit: </span>
                  <span className="font-medium">${parseFloat(sub.unitRate).toFixed(2)}/{sub.unitType || "unit"}</span>
                </div>
              )}
            </div>
            {sub.notes && <p className="text-xs text-muted-foreground mt-2">{sub.notes}</p>}
          </div>
          <div className="flex gap-1 ml-4">
            <Button variant="ghost" size="icon" onClick={() => onEdit(sub)} data-testid={`button-edit-sub-${sub.id}`}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => onDelete(sub.id)} data-testid={`button-delete-sub-${sub.id}`}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
