import { useAuth } from "@/hooks/use-auth";
import { Navbar } from "@/components/layout/Navbar";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { Phone, Mail, Star, Search, Building2, User, MapPin, Loader2 } from "lucide-react";

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
  const [search, setSearch] = useState("");
  const [filterTrade, setFilterTrade] = useState<string | null>(null);

  const { data: subcontractors = [], isLoading } = useQuery<Subcontractor[]>({
    queryKey: ["/api/subcontractors"],
  });

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
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-serif font-bold text-foreground" data-testid="text-page-title">
            Trade Contacts
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Your go-to list for Muskoka trades and contractors</p>
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
                    <ContactCard key={s.id} contact={s} />
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
                    <ContactCard key={s.id} contact={s} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ContactCard({ contact }: { contact: Subcontractor }) {
  const rate = contact.hourlyRate
    ? `$${contact.hourlyRate}/hr`
    : contact.dailyRate
    ? `$${contact.dailyRate}/day`
    : contact.unitRate
    ? `$${contact.unitRate}/${contact.unitType || "unit"}`
    : null;

  return (
    <Card className="overflow-hidden" data-testid={`card-contact-${contact.id}`}>
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
          {rate && (
            <span className="text-sm font-medium text-muted-foreground whitespace-nowrap" data-testid={`text-rate-${contact.id}`}>
              {rate}
            </span>
          )}
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
