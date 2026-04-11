import { useAuth } from "@/hooks/use-auth";
import { Navbar } from "@/components/layout/Navbar";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useState } from "react";
import { Phone, Mail, Star, Search, Building2, User, MapPin, Loader2, Plus, Pencil, Trash2, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

interface Subcontractor {
  id: number;
  businessName: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  trade: string | null;
  hourlyRate: string | null;
  dailyRate: string | null;
  unitRate: string | null;
  unitType: string | null;
  isPreferred: boolean | null;
  address: string | null;
  notes: string | null;
}

export default function TradeContacts() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [filterTrade, setFilterTrade] = useState<string | null>(null);
  const [editContact, setEditContact] = useState<Subcontractor | null>(null);
  const [deleteContact, setDeleteContact] = useState<Subcontractor | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);

  const { data: subcontractors = [], isLoading } = useQuery<Subcontractor[]>({
    queryKey: ["/api/subcontractors"],
  });

  const isAdmin = user?.role === "admin";

  const trades = Array.from(new Set(subcontractors.map(s => s.trade).filter(Boolean) as string[])).sort();

  const filtered = subcontractors.filter(s => {
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

  const preferred = filtered.filter(s => s.isPreferred);
  const others = filtered.filter(s => !s.isPreferred);

  const grouped: Record<string, Subcontractor[]> = {};
  for (const s of others) {
    const trade = s.trade || "Other";
    if (!grouped[trade]) grouped[trade] = [];
    grouped[trade].push(s);
  }
  const sortedTrades = Object.keys(grouped).sort();

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/subcontractors/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/subcontractors"] });
      toast({ title: "Contact deleted" });
      setDeleteContact(null);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete contact", description: error.message, variant: "destructive" });
    },
  });

  if (!user || (user.role !== "admin" && user.role !== "crew")) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="max-w-4xl mx-auto px-4 py-16 text-center">
          <p className="text-muted-foreground">This page is available to crew and admin only.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="icon" className="h-8 w-8" data-testid="button-back">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl sm:text-3xl font-serif font-bold text-foreground" data-testid="text-page-title">
                Trade Contacts
              </h1>
              <p className="text-sm text-muted-foreground mt-1">Your go-to list for Muskoka trades and contractors</p>
            </div>
          </div>
          {isAdmin && (
            <Button onClick={() => setShowAddDialog(true)} data-testid="button-add-contact">
              <Plus className="h-4 w-4 mr-2" />
              Add Contact
            </Button>
          )}
        </div>

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

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
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
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground" data-testid="text-preferred-heading">
                    Go-To Contacts
                  </h2>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {preferred.map(s => (
                    <ContactCard
                      key={s.id}
                      contact={s}
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
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3" data-testid={`text-trade-heading-${trade.toLowerCase().replace(/\s+/g, "-")}`}>
                  {trade}
                </h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {grouped[trade].map(s => (
                    <ContactCard
                      key={s.id}
                      contact={s}
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
      </div>

      <EditContactDialog
        contact={editContact}
        open={!!editContact}
        onClose={() => setEditContact(null)}
      />

      <EditContactDialog
        contact={null}
        open={showAddDialog}
        onClose={() => setShowAddDialog(false)}
      />

      <AlertDialog open={!!deleteContact} onOpenChange={(open) => !open && setDeleteContact(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Contact</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {deleteContact?.businessName}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteContact && deleteMutation.mutate(deleteContact.id)}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ContactCard({
  contact,
  isAdmin,
  onEdit,
  onDelete,
}: {
  contact: Subcontractor;
  isAdmin: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
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
              {contact.isPreferred && (
                <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500 shrink-0" />
              )}
            </div>
            {contact.trade && (
              <Badge variant="secondary" className="mt-1 text-xs" data-testid={`badge-trade-${contact.id}`}>
                {contact.trade}
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
              <div className="flex items-center gap-0.5" style={{ visibility: "visible" }}>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={onEdit}
                  data-testid={`button-edit-contact-${contact.id}`}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={onDelete}
                  data-testid={`button-delete-contact-${contact.id}`}
                >
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
            <a
              href={`tel:${contact.phone}`}
              className="flex items-center gap-2 text-sm text-primary hover:underline"
              data-testid={`link-phone-${contact.id}`}
            >
              <Phone className="h-3.5 w-3.5 shrink-0" />
              {contact.phone}
            </a>
          )}
          {contact.email && (
            <a
              href={`mailto:${contact.email}`}
              className="flex items-center gap-2 text-sm text-primary hover:underline"
              data-testid={`link-email-${contact.id}`}
            >
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
          <p className="mt-2 text-xs text-muted-foreground italic" data-testid={`text-notes-${contact.id}`}>
            {contact.notes}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function EditContactDialog({
  contact,
  open,
  onClose,
}: {
  contact: Subcontractor | null;
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const isNew = !contact;

  const [formData, setFormData] = useState<Record<string, string | boolean>>({});

  const resetForm = (c: Subcontractor | null) => {
    if (c) {
      setFormData({
        businessName: c.businessName,
        contactName: c.contactName || "",
        phone: c.phone || "",
        email: c.email || "",
        trade: c.trade || "",
        hourlyRate: c.hourlyRate || "",
        dailyRate: c.dailyRate || "",
        unitRate: c.unitRate || "",
        unitType: c.unitType || "",
        isPreferred: c.isPreferred || false,
        address: c.address || "",
        notes: c.notes || "",
      });
    } else {
      setFormData({
        businessName: "",
        contactName: "",
        phone: "",
        email: "",
        trade: "",
        hourlyRate: "",
        dailyRate: "",
        unitRate: "",
        unitType: "",
        isPreferred: false,
        address: "",
        notes: "",
      });
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      resetForm(contact);
    }
    if (!isOpen) {
      onClose();
    }
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
    const payload: Record<string, unknown> = {
      businessName: formData.businessName as string,
      isPreferred: formData.isPreferred as boolean,
    };
    const optionalFields = ["contactName", "phone", "email", "trade", "hourlyRate", "dailyRate", "unitRate", "unitType", "address", "notes"];
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
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
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
              <Input
                id="contactName"
                value={(formData.contactName as string) || ""}
                onChange={e => updateField("contactName", e.target.value)}
                data-testid="input-contact-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="trade">Trade</Label>
              <Input
                id="trade"
                value={(formData.trade as string) || ""}
                onChange={e => updateField("trade", e.target.value)}
                data-testid="input-trade"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={(formData.phone as string) || ""}
                onChange={e => updateField("phone", e.target.value)}
                data-testid="input-phone"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={(formData.email as string) || ""}
                onChange={e => updateField("email", e.target.value)}
                data-testid="input-email"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <Input
              id="address"
              value={(formData.address as string) || ""}
              onChange={e => updateField("address", e.target.value)}
              data-testid="input-address"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="hourlyRate">Hourly Rate</Label>
              <Input
                id="hourlyRate"
                value={(formData.hourlyRate as string) || ""}
                onChange={e => updateField("hourlyRate", e.target.value)}
                placeholder="e.g. 85"
                data-testid="input-hourly-rate"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dailyRate">Daily Rate</Label>
              <Input
                id="dailyRate"
                value={(formData.dailyRate as string) || ""}
                onChange={e => updateField("dailyRate", e.target.value)}
                placeholder="e.g. 650"
                data-testid="input-daily-rate"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="unitRate">Unit Rate</Label>
              <Input
                id="unitRate"
                value={(formData.unitRate as string) || ""}
                onChange={e => updateField("unitRate", e.target.value)}
                placeholder="e.g. 12"
                data-testid="input-unit-rate"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="unitType">Unit Type</Label>
            <Input
              id="unitType"
              value={(formData.unitType as string) || ""}
              onChange={e => updateField("unitType", e.target.value)}
              placeholder="e.g. sq ft, linear ft, unit"
              data-testid="input-unit-type"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={(formData.notes as string) || ""}
              onChange={e => updateField("notes", e.target.value)}
              className="resize-none"
              rows={3}
              data-testid="input-notes"
            />
          </div>

          <div className="flex items-center gap-3">
            <Switch
              id="isPreferred"
              checked={(formData.isPreferred as boolean) || false}
              onCheckedChange={val => updateField("isPreferred", val)}
              data-testid="switch-preferred"
            />
            <Label htmlFor="isPreferred">Go-to / Preferred contact</Label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} data-testid="button-cancel-edit">
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending || !(formData.businessName as string)?.trim()} data-testid="button-save-contact">
              {mutation.isPending ? "Saving..." : isNew ? "Add Contact" : "Save Changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
