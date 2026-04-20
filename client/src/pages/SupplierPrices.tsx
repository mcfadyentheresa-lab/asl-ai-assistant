import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Navbar } from "@/components/layout/Navbar";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Package, Plus, Trash2, Pencil, Search, Store, ExternalLink, Loader2, Star, Phone, Mail, MapPin, Globe, Receipt, ArrowLeft, RefreshCw } from "lucide-react";
import { Link } from "wouter";
import type { Supplier, SupplierPrice, CostCategory } from "@shared/schema";

export default function SupplierPrices() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | null>(null);
  const [showAddSupplier, setShowAddSupplier] = useState(false);
  const [showAddPrice, setShowAddPrice] = useState(false);
  const [showAddFromReceipt, setShowAddFromReceipt] = useState(false);
  const [editingPrice, setEditingPrice] = useState<SupplierPrice | null>(null);
  const [deletePrice, setDeletePrice] = useState<SupplierPrice | null>(null);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);

  const { data: suppliersList = [], isLoading: loadingSuppliers } = useQuery<Supplier[]>({
    queryKey: ["/api/suppliers"],
  });

  const priceQueryPath = selectedSupplierId
    ? `/api/supplier-prices?supplierId=${selectedSupplierId}`
    : "/api/supplier-prices";
  const { data: prices = [], isLoading: loadingPrices } = useQuery<SupplierPrice[]>({
    queryKey: [priceQueryPath],
  });

  const { data: categories = [] } = useQuery<CostCategory[]>({
    queryKey: ["/api/cost-categories"],
  });

  const _isAdmin = user?.role === "admin";
  const [fetchingPriceId, setFetchingPriceId] = useState<number | null>(null);

  const activeSupplier = suppliersList.find(s => s.id === selectedSupplierId) || null;

  useEffect(() => {
    if (selectedSupplierId === null && suppliersList.length > 0) {
      const preferred = suppliersList.find(s => s.isPreferred);
      setSelectedSupplierId(preferred ? preferred.id : suppliersList[0].id);
    }
  }, [suppliersList, selectedSupplierId]);

  const filteredPrices = prices.filter(p => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      p.productName.toLowerCase().includes(q) ||
      (p.productCode?.toLowerCase().includes(q)) ||
      (p.notes?.toLowerCase().includes(q))
    );
  });

  const deletePriceMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/supplier-prices/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [priceQueryPath] });
      toast({ title: "Price deleted" });
      setDeletePrice(null);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete price", description: error.message, variant: "destructive" });
    },
  });

  async function fetchLivePrice(price: SupplierPrice) {
    if (!price.productUrl) return;
    setFetchingPriceId(price.id);
    try {
      const res = await apiRequest("POST", `/api/supplier-prices/${price.id}/fetch-price`, {});
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({ title: err.message || "Could not fetch price", variant: "destructive" });
        return;
      }
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: [priceQueryPath] });
      toast({ title: `Price updated to $${parseFloat(data.fetchedPrice).toFixed(2)}${data.currency ? ` ${data.currency}` : ""}` });
    } catch {
      toast({ title: "Failed to reach product page", variant: "destructive" });
    } finally {
      setFetchingPriceId(null);
    }
  }

  if (!user || user.role !== "admin") {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="max-w-4xl mx-auto px-4 py-16 text-center">
          <p className="text-muted-foreground">Admin access required.</p>
        </div>
      </div>
    );
  }

  const getCategoryName = (categoryId: number | null) => {
    if (!categoryId) return null;
    return categories.find(c => c.id === categoryId)?.name || null;
  };

  const formatUnitType = (unitType: string) => {
    const map: Record<string, string> = {
      sq_ft: "per sq ft",
      hour: "per hour",
      unit: "per unit",
      linear_ft: "per linear ft",
      each: "each",
      board_ft: "per board ft",
      bundle: "per bundle",
      bag: "per bag",
      sheet: "per sheet",
      box: "per box",
    };
    return map[unitType] || unitType;
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="md:hidden flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/60 border border-border/50 text-xs text-muted-foreground mb-4" data-testid="banner-desktop-best">
          <span>💻</span>
          <span>Supplier Price Book is best viewed on a larger screen.</span>
        </div>
        <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="icon" className="h-8 w-8" data-testid="button-back">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl sm:text-3xl font-serif font-bold text-foreground" data-testid="text-page-title">
                Supplier Price Book
              </h1>
              <p className="text-sm text-muted-foreground mt-1">Track material prices from your suppliers</p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <Button variant="outline" onClick={() => setShowAddFromReceipt(true)} data-testid="button-add-from-receipt">
              <Receipt className="h-4 w-4 mr-2" />
              Add from Receipt
            </Button>
            <Button onClick={() => setShowAddPrice(true)} disabled={!selectedSupplierId} data-testid="button-add-price">
              <Plus className="h-4 w-4 mr-2" />
              Add Price
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-6">
          {loadingSuppliers ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <>
              {suppliersList.map(s => (
                <Badge
                  key={s.id}
                  variant={selectedSupplierId === s.id ? "default" : "outline"}
                  className="cursor-pointer text-sm"
                  onClick={() => setSelectedSupplierId(s.id)}
                  data-testid={`badge-supplier-${s.id}`}
                >
                  {s.isPreferred && <Star className="h-3 w-3 mr-1 fill-current" />}
                  {s.name}
                </Badge>
              ))}
              <Button size="icon" variant="outline" onClick={() => setShowAddSupplier(true)} data-testid="button-add-supplier">
                <Plus className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>

        {activeSupplier && (
          <Card className="mb-6">
            <CardContent className="py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Store className="h-5 w-5 text-muted-foreground shrink-0" />
                    <h2 className="font-semibold text-lg text-foreground" data-testid="text-supplier-name">
                      {activeSupplier.name}
                    </h2>
                    {activeSupplier.isPreferred && (
                      <Badge variant="secondary" className="text-xs">Preferred</Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-muted-foreground">
                    {activeSupplier.phone && (
                      <a href={`tel:${activeSupplier.phone}`} className="flex items-center gap-1 hover:text-primary" data-testid="link-supplier-phone">
                        <Phone className="h-3.5 w-3.5" /> {activeSupplier.phone}
                      </a>
                    )}
                    {activeSupplier.email && (
                      <a href={`mailto:${activeSupplier.email}`} className="flex items-center gap-1 hover:text-primary" data-testid="link-supplier-email">
                        <Mail className="h-3.5 w-3.5" /> {activeSupplier.email}
                      </a>
                    )}
                    {activeSupplier.address && (
                      <span className="flex items-center gap-1" data-testid="text-supplier-address">
                        <MapPin className="h-3.5 w-3.5" /> {activeSupplier.address}
                      </span>
                    )}
                    {activeSupplier.website && (
                      <a href={activeSupplier.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-primary" data-testid="link-supplier-website">
                        <Globe className="h-3.5 w-3.5" /> Website
                      </a>
                    )}
                  </div>
                  {activeSupplier.notes && (
                    <p className="text-xs text-muted-foreground mt-2 italic" data-testid="text-supplier-notes">{activeSupplier.notes}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="icon" variant="ghost" onClick={() => setEditingSupplier(activeSupplier)} data-testid="button-edit-supplier">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search by product name, code, or notes..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-prices"
          />
        </div>

        {loadingPrices ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredPrices.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Package className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p>{search ? "No matching prices found" : "No prices added yet"}</p>
            {!search && selectedSupplierId && (
              <Button variant="outline" className="mt-4" onClick={() => setShowAddPrice(true)} data-testid="button-add-first-price">
                <Plus className="h-4 w-4 mr-2" />
                Add First Price
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_auto] gap-3 px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              <span>Product</span>
              <span>Category</span>
              <span>Price</span>
              <span>Unit</span>
              <span>Code</span>
              <span>Updated</span>
              <span>Actions</span>
            </div>
            {filteredPrices.map(price => (
              <Card key={price.id} data-testid={`card-price-${price.id}`}>
                <CardContent className="py-3 px-4">
                  {/* Mobile layout */}
                  <div className="md:hidden">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-medium text-foreground" data-testid={`text-product-name-${price.id}`}>
                            {price.productName}
                          </span>
                          {price.productUrl && (
                            <a href={price.productUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary shrink-0" data-testid={`link-product-url-${price.id}`}>
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="font-semibold text-foreground" data-testid={`text-price-${price.id}`}>
                            ${parseFloat(price.unitPrice).toFixed(2)}
                          </span>
                          <span className="text-xs text-muted-foreground" data-testid={`text-unit-type-${price.id}`}>
                            {formatUnitType(price.unitType)}
                          </span>
                          {getCategoryName(price.categoryId) && (
                            <Badge variant="secondary" className="text-xs" data-testid={`badge-category-${price.id}`}>
                              {getCategoryName(price.categoryId)}
                            </Badge>
                          )}
                        </div>
                        {price.notes && (
                          <p className="text-xs text-muted-foreground mt-0.5 italic">{price.notes}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        {price.productUrl && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-11 w-11 text-muted-foreground hover:text-primary"
                            onClick={() => fetchLivePrice(price)}
                            disabled={fetchingPriceId === price.id}
                            title="Fetch live price"
                            data-testid={`button-fetch-price-${price.id}`}
                          >
                            {fetchingPriceId === price.id
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <RefreshCw className="h-3.5 w-3.5" />}
                          </Button>
                        )}
                        <Button size="icon" variant="ghost" className="h-11 w-11" onClick={() => setEditingPrice(price)} data-testid={`button-edit-price-${price.id}`}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-11 w-11" onClick={() => setDeletePrice(price)} data-testid={`button-delete-price-${price.id}`}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                  {/* Desktop layout */}
                  <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_auto] gap-3 items-center">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground truncate" data-testid={`text-product-name-${price.id}`}>
                          {price.productName}
                        </span>
                        {price.productUrl && (
                          <a href={price.productUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary shrink-0" data-testid={`link-product-url-${price.id}`}>
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                    </div>
                    <div>
                      {getCategoryName(price.categoryId) && (
                        <Badge variant="secondary" className="text-xs" data-testid={`badge-category-${price.id}`}>
                          {getCategoryName(price.categoryId)}
                        </Badge>
                      )}
                    </div>
                    <div className="font-semibold text-foreground" data-testid={`text-price-${price.id}`}>
                      ${parseFloat(price.unitPrice).toFixed(2)}
                    </div>
                    <div className="text-sm text-muted-foreground" data-testid={`text-unit-type-${price.id}`}>
                      {formatUnitType(price.unitType)}
                    </div>
                    <div className="text-sm text-muted-foreground" data-testid={`text-code-${price.id}`}>
                      {price.productCode || "—"}
                    </div>
                    <div className="text-xs text-muted-foreground" data-testid={`text-updated-${price.id}`}>
                      {price.lastUpdated ? new Date(price.lastUpdated).toLocaleDateString() : "—"}
                    </div>
                    <div className="flex items-center gap-0.5">
                      {price.productUrl && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-muted-foreground hover:text-primary"
                          onClick={() => fetchLivePrice(price)}
                          disabled={fetchingPriceId === price.id}
                          title="Fetch live price from website"
                          data-testid={`button-fetch-price-${price.id}`}
                        >
                          {fetchingPriceId === price.id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <RefreshCw className="h-3.5 w-3.5" />}
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" onClick={() => setEditingPrice(price)} data-testid={`button-edit-price-${price.id}`}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => setDeletePrice(price)} data-testid={`button-delete-price-${price.id}`}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  {price.notes && (
                    <p className="hidden md:block text-xs text-muted-foreground mt-1 italic">{price.notes}</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <AddSupplierDialog open={showAddSupplier} onClose={() => setShowAddSupplier(false)} />
      <EditSupplierDialog supplier={editingSupplier} open={!!editingSupplier} onClose={() => setEditingSupplier(null)} />

      <PriceFormDialog
        open={showAddPrice}
        onClose={() => setShowAddPrice(false)}
        supplierId={selectedSupplierId}
        categories={categories}
        price={null}
      />
      <PriceFormDialog
        open={!!editingPrice}
        onClose={() => setEditingPrice(null)}
        supplierId={selectedSupplierId}
        categories={categories}
        price={editingPrice}
      />

      <AddFromReceiptDialog
        open={showAddFromReceipt}
        onClose={() => setShowAddFromReceipt(false)}
        suppliers={suppliersList}
        categories={categories}
      />

      <AlertDialog open={!!deletePrice} onOpenChange={(open) => !open && setDeletePrice(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Price</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the price for "{deletePrice?.productName}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletePrice && deletePriceMutation.mutate(deletePrice.id)}
              disabled={deletePriceMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deletePriceMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AddSupplierDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    name: "", phone: "", email: "", address: "", website: "", notes: "", isPreferred: false,
  });

  const mutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      await apiRequest("POST", "/api/suppliers", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/suppliers"] });
      toast({ title: "Supplier added" });
      onClose();
      setFormData({ name: "", phone: "", email: "", address: "", website: "", notes: "", isPreferred: false });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to add supplier", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: Record<string, unknown> = { name: formData.name, isPreferred: formData.isPreferred, isActive: true };
    for (const field of ["phone", "email", "address", "website", "notes"] as const) {
      payload[field] = formData[field] || null;
    }
    mutation.mutate(payload);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="w-[95vw] max-w-lg">
        <DialogHeader>
          <DialogTitle data-testid="text-add-supplier-title">Add Supplier</DialogTitle>
          <DialogDescription>Add a new material supplier to your price book.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="supplierName">Supplier Name *</Label>
            <Input id="supplierName" value={formData.name} onChange={e => setFormData(p => ({ ...p, name: e.target.value }))} required data-testid="input-supplier-name" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="supplierPhone">Phone</Label>
              <Input id="supplierPhone" value={formData.phone} onChange={e => setFormData(p => ({ ...p, phone: e.target.value }))} data-testid="input-supplier-phone" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supplierEmail">Email</Label>
              <Input id="supplierEmail" type="email" value={formData.email} onChange={e => setFormData(p => ({ ...p, email: e.target.value }))} data-testid="input-supplier-email" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="supplierAddress">Address</Label>
              <Input id="supplierAddress" value={formData.address} onChange={e => setFormData(p => ({ ...p, address: e.target.value }))} data-testid="input-supplier-address" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supplierWebsite">Website</Label>
              <Input id="supplierWebsite" value={formData.website} onChange={e => setFormData(p => ({ ...p, website: e.target.value }))} placeholder="https://" data-testid="input-supplier-website" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="supplierNotes">Notes</Label>
            <Textarea id="supplierNotes" value={formData.notes} onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))} className="resize-none" rows={2} data-testid="input-supplier-notes" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} data-testid="button-cancel-supplier">Cancel</Button>
            <Button type="submit" disabled={mutation.isPending || !formData.name.trim()} data-testid="button-save-supplier">
              {mutation.isPending ? "Saving..." : "Add Supplier"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditSupplierDialog({ supplier, open, onClose }: { supplier: Supplier | null; open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    name: "", phone: "", email: "", address: "", website: "", notes: "", isPreferred: false,
  });

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen && supplier) {
      setFormData({
        name: supplier.name,
        phone: supplier.phone || "",
        email: supplier.email || "",
        address: supplier.address || "",
        website: supplier.website || "",
        notes: supplier.notes || "",
        isPreferred: supplier.isPreferred || false,
      });
    }
    if (!isOpen) onClose();
  };

  const mutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      await apiRequest("PATCH", `/api/suppliers/${supplier!.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/suppliers"] });
      toast({ title: "Supplier updated" });
      onClose();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update supplier", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: Record<string, unknown> = { name: formData.name, isPreferred: formData.isPreferred };
    for (const field of ["phone", "email", "address", "website", "notes"] as const) {
      payload[field] = formData[field] || null;
    }
    mutation.mutate(payload);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[95vw] max-w-lg">
        <DialogHeader>
          <DialogTitle data-testid="text-edit-supplier-title">Edit Supplier</DialogTitle>
          <DialogDescription>Update supplier details.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="editSupplierName">Supplier Name *</Label>
            <Input id="editSupplierName" value={formData.name} onChange={e => setFormData(p => ({ ...p, name: e.target.value }))} required data-testid="input-edit-supplier-name" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="editSupplierPhone">Phone</Label>
              <Input id="editSupplierPhone" value={formData.phone} onChange={e => setFormData(p => ({ ...p, phone: e.target.value }))} data-testid="input-edit-supplier-phone" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editSupplierEmail">Email</Label>
              <Input id="editSupplierEmail" type="email" value={formData.email} onChange={e => setFormData(p => ({ ...p, email: e.target.value }))} data-testid="input-edit-supplier-email" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="editSupplierAddress">Address</Label>
              <Input id="editSupplierAddress" value={formData.address} onChange={e => setFormData(p => ({ ...p, address: e.target.value }))} data-testid="input-edit-supplier-address" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editSupplierWebsite">Website</Label>
              <Input id="editSupplierWebsite" value={formData.website} onChange={e => setFormData(p => ({ ...p, website: e.target.value }))} data-testid="input-edit-supplier-website" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="editSupplierNotes">Notes</Label>
            <Textarea id="editSupplierNotes" value={formData.notes} onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))} className="resize-none" rows={2} data-testid="input-edit-supplier-notes" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} data-testid="button-cancel-edit-supplier">Cancel</Button>
            <Button type="submit" disabled={mutation.isPending || !formData.name.trim()} data-testid="button-save-edit-supplier">
              {mutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PriceFormDialog({
  open, onClose, supplierId, categories, price,
}: {
  open: boolean;
  onClose: () => void;
  supplierId: number | null;
  categories: CostCategory[];
  price: SupplierPrice | null;
}) {
  const { toast } = useToast();
  const isNew = !price;

  const [formData, setFormData] = useState({
    productName: "", categoryId: "", unitPrice: "", unitType: "unit", productCode: "", productUrl: "", notes: "",
  });

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      if (price) {
        setFormData({
          productName: price.productName,
          categoryId: price.categoryId ? String(price.categoryId) : "",
          unitPrice: price.unitPrice,
          unitType: price.unitType,
          productCode: price.productCode || "",
          productUrl: price.productUrl || "",
          notes: price.notes || "",
        });
      } else {
        setFormData({ productName: "", categoryId: "", unitPrice: "", unitType: "unit", productCode: "", productUrl: "", notes: "" });
      }
    }
    if (!isOpen) onClose();
  };

  const mutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      if (price) {
        await apiRequest("PATCH", `/api/supplier-prices/${price.id}`, data);
      } else {
        await apiRequest("POST", "/api/supplier-prices", data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [priceQueryPath] });
      toast({ title: price ? "Price updated" : "Price added" });
      onClose();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to save price", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: Record<string, unknown> = {
      productName: formData.productName,
      unitPrice: formData.unitPrice,
      unitType: formData.unitType,
      supplierId: price?.supplierId || supplierId,
    };
    payload.categoryId = formData.categoryId ? parseInt(formData.categoryId) : null;
    payload.productCode = formData.productCode || null;
    payload.productUrl = formData.productUrl || null;
    payload.notes = formData.notes || null;
    mutation.mutate(payload);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[95vw] max-w-lg">
        <DialogHeader>
          <DialogTitle data-testid="text-price-dialog-title">{isNew ? "Add Price" : "Edit Price"}</DialogTitle>
          <DialogDescription>{isNew ? "Add a new product price to this supplier." : "Update product price details."}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="productName">Product Name *</Label>
            <Input id="productName" value={formData.productName} onChange={e => setFormData(p => ({ ...p, productName: e.target.value }))} required data-testid="input-product-name" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="priceCategory">Category</Label>
              <Select value={formData.categoryId} onValueChange={v => setFormData(p => ({ ...p, categoryId: v }))}>
                <SelectTrigger data-testid="select-price-category"><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {categories.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="unitType">Unit Type *</Label>
              <Select value={formData.unitType} onValueChange={v => setFormData(p => ({ ...p, unitType: v }))}>
                <SelectTrigger data-testid="select-unit-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unit">Per Unit</SelectItem>
                  <SelectItem value="sq_ft">Per Sq Ft</SelectItem>
                  <SelectItem value="linear_ft">Per Linear Ft</SelectItem>
                  <SelectItem value="board_ft">Per Board Ft</SelectItem>
                  <SelectItem value="hour">Per Hour</SelectItem>
                  <SelectItem value="each">Each</SelectItem>
                  <SelectItem value="bundle">Per Bundle</SelectItem>
                  <SelectItem value="bag">Per Bag</SelectItem>
                  <SelectItem value="sheet">Per Sheet</SelectItem>
                  <SelectItem value="box">Per Box</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="unitPrice">Unit Price (CAD) *</Label>
              <Input id="unitPrice" type="number" step="0.01" value={formData.unitPrice} onChange={e => setFormData(p => ({ ...p, unitPrice: e.target.value }))} required data-testid="input-unit-price" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="productCode">Product Code</Label>
              <Input id="productCode" value={formData.productCode} onChange={e => setFormData(p => ({ ...p, productCode: e.target.value }))} placeholder="SKU / Code" data-testid="input-product-code" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="productUrl">Product URL</Label>
            <Input id="productUrl" value={formData.productUrl} onChange={e => setFormData(p => ({ ...p, productUrl: e.target.value }))} placeholder="https://" data-testid="input-product-url" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="priceNotes">Notes</Label>
            <Textarea id="priceNotes" value={formData.notes} onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))} className="resize-none" rows={2} data-testid="input-price-notes" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} data-testid="button-cancel-price">Cancel</Button>
            <Button type="submit" disabled={mutation.isPending || !formData.productName.trim() || !formData.unitPrice} data-testid="button-save-price">
              {mutation.isPending ? "Saving..." : isNew ? "Add Price" : "Save Changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddFromReceiptDialog({
  open, onClose, suppliers: suppliersList, categories,
}: {
  open: boolean;
  onClose: () => void;
  suppliers: Supplier[];
  categories: CostCategory[];
}) {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    supplierId: "", productName: "", unitPrice: "", unitType: "unit", categoryId: "", productCode: "", notes: "",
  });

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      const preferred = suppliersList.find(s => s.isPreferred);
      setFormData({
        supplierId: preferred ? String(preferred.id) : (suppliersList[0] ? String(suppliersList[0].id) : ""),
        productName: "", unitPrice: "", unitType: "unit", categoryId: "", productCode: "", notes: "",
      });
    }
    if (!isOpen) onClose();
  };

  const mutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      await apiRequest("POST", "/api/supplier-prices", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [priceQueryPath] });
      toast({ title: "Price added from receipt" });
      onClose();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to add price", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: Record<string, unknown> = {
      supplierId: parseInt(formData.supplierId),
      productName: formData.productName,
      unitPrice: formData.unitPrice,
      unitType: formData.unitType,
      categoryId: formData.categoryId ? parseInt(formData.categoryId) : null,
      productCode: formData.productCode || null,
      notes: formData.notes || null,
    };
    mutation.mutate(payload);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[95vw] max-w-lg">
        <DialogHeader>
          <DialogTitle data-testid="text-receipt-dialog-title">Add Price from Receipt</DialogTitle>
          <DialogDescription>Quickly add a product price from a receipt or invoice.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="receiptSupplier">Supplier *</Label>
            <Select value={formData.supplierId} onValueChange={v => setFormData(p => ({ ...p, supplierId: v }))}>
              <SelectTrigger data-testid="select-receipt-supplier"><SelectValue placeholder="Select supplier" /></SelectTrigger>
              <SelectContent>
                {suppliersList.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="receiptProduct">Product Name *</Label>
            <Input id="receiptProduct" value={formData.productName} onChange={e => setFormData(p => ({ ...p, productName: e.target.value }))} placeholder="e.g., 2x6x10 SPF Lumber" required data-testid="input-receipt-product" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="receiptPrice">Price (CAD) *</Label>
              <Input id="receiptPrice" type="number" step="0.01" value={formData.unitPrice} onChange={e => setFormData(p => ({ ...p, unitPrice: e.target.value }))} required data-testid="input-receipt-price" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="receiptUnit">Unit Type</Label>
              <Select value={formData.unitType} onValueChange={v => setFormData(p => ({ ...p, unitType: v }))}>
                <SelectTrigger data-testid="select-receipt-unit"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unit">Per Unit</SelectItem>
                  <SelectItem value="sq_ft">Per Sq Ft</SelectItem>
                  <SelectItem value="linear_ft">Per Linear Ft</SelectItem>
                  <SelectItem value="board_ft">Per Board Ft</SelectItem>
                  <SelectItem value="each">Each</SelectItem>
                  <SelectItem value="bundle">Per Bundle</SelectItem>
                  <SelectItem value="sheet">Per Sheet</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="receiptCode">Code</Label>
              <Input id="receiptCode" value={formData.productCode} onChange={e => setFormData(p => ({ ...p, productCode: e.target.value }))} placeholder="SKU" data-testid="input-receipt-code" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="receiptCategory">Category</Label>
            <Select value={formData.categoryId} onValueChange={v => setFormData(p => ({ ...p, categoryId: v }))}>
              <SelectTrigger data-testid="select-receipt-category"><SelectValue placeholder="Select category" /></SelectTrigger>
              <SelectContent>
                {categories.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="receiptNotes">Notes</Label>
            <Textarea id="receiptNotes" value={formData.notes} onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))} className="resize-none" rows={2} placeholder="Receipt details, date, etc." data-testid="input-receipt-notes" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} data-testid="button-cancel-receipt">Cancel</Button>
            <Button type="submit" disabled={mutation.isPending || !formData.productName.trim() || !formData.unitPrice || !formData.supplierId} data-testid="button-save-receipt">
              {mutation.isPending ? "Saving..." : "Add Price"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
