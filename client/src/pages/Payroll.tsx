import { useState, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Navbar } from "@/components/layout/Navbar";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock,
  Users,
  DollarSign,
  Loader2,
  ChevronDown,
  ChevronUp,
  FileText,
} from "lucide-react";
import type { TimeEntry, Project } from "@shared/schema";

interface UserInfo {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  role?: string | null;
}

function getPayPeriod(date: Date) {
  const anchor = new Date(2025, 0, 6);
  const diff = date.getTime() - anchor.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const periodNum = Math.floor(days / 14);
  const periodStart = new Date(anchor);
  periodStart.setDate(anchor.getDate() + periodNum * 14);
  const periodEnd = new Date(periodStart);
  periodEnd.setDate(periodStart.getDate() + 13);
  return {
    start: periodStart.toISOString().split("T")[0],
    end: periodEnd.toISOString().split("T")[0],
  };
}

function formatPeriodDate(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return format(new Date(y, m - 1, d), "MMM d, yyyy");
}

function formatShortDate(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return format(new Date(y, m - 1, d), "EEE, MMM d");
}

export default function Payroll() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [periodOffset, setPeriodOffset] = useState(0);
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
  const [selectedEntryIds, setSelectedEntryIds] = useState<Set<number>>(new Set());

  const currentPeriod = useMemo(() => {
    const base = new Date();
    base.setDate(base.getDate() + periodOffset * 14);
    return getPayPeriod(base);
  }, [periodOffset]);

  const periodQueryKey = `/api/time-entries/period?startDate=${currentPeriod.start}&endDate=${currentPeriod.end}`;

  const { data: entries, isLoading: entriesLoading } = useQuery<TimeEntry[]>({
    queryKey: [periodQueryKey],
    enabled: user?.role === "admin",
  });

  const { data: users } = useQuery<UserInfo[]>({
    queryKey: ["/api/users"],
    enabled: user?.role === "admin",
  });

  const { data: projects } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    enabled: user?.role === "admin",
  });

  const projectMap = useMemo(
    () => new Map(projects?.map((p) => [p.id, p.name]) || []),
    [projects]
  );

  const approveMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      const res = await apiRequest("POST", "/api/time-entries/approve", { ids });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Approved", description: "Time entries have been approved." });
      queryClient.invalidateQueries({ queryKey: [periodQueryKey] });
      setSelectedEntryIds(new Set());
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const crewSummaries = useMemo(() => {
    if (!entries || !users) return [];
    const grouped = new Map<
      string,
      {
        userId: string;
        name: string;
        entries: TimeEntry[];
        totalHours: number;
        submitted: number;
        approved: number;
        draft: number;
      }
    >();
    entries.forEach((entry) => {
      if (!grouped.has(entry.userId)) {
        const u = users.find((usr) => usr.id === entry.userId);
        grouped.set(entry.userId, {
          userId: entry.userId,
          name: u
            ? `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email || "Unknown"
            : "Unknown",
          entries: [],
          totalHours: 0,
          submitted: 0,
          approved: 0,
          draft: 0,
        });
      }
      const summary = grouped.get(entry.userId)!;
      summary.entries.push(entry);
      summary.totalHours += parseFloat(entry.hours) || 0;
      if (entry.status === "submitted") summary.submitted++;
      else if (entry.status === "approved") summary.approved++;
      else summary.draft++;
    });
    return Array.from(grouped.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [entries, users]);

  const totalHours = entries?.reduce((s, e) => s + (parseFloat(e.hours) || 0), 0) || 0;
  const totalEntries = entries?.length || 0;
  const pendingCount = entries?.filter((e) => e.status === "submitted").length || 0;
  const approvedCount = entries?.filter((e) => e.status === "approved").length || 0;

  const allSubmittedIds = entries?.filter((e) => e.status === "submitted").map((e) => e.id) || [];

  const toggleExpand = (userId: string) => {
    setExpandedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const toggleEntrySelection = (id: number) => {
    setSelectedEntryIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleApproveSelected = () => {
    const ids = Array.from(selectedEntryIds);
    if (ids.length === 0) return;
    approveMutation.mutate(ids);
  };

  const handleApproveAll = () => {
    if (allSubmittedIds.length === 0) return;
    approveMutation.mutate(allSubmittedIds);
  };

  if (user?.role !== "admin") {
    return (
      <div className="min-h-screen bg-background" data-testid="page-payroll">
        <Navbar />
        <main className="container py-10 md:py-14 px-6 md:px-10 max-w-5xl mx-auto">
          <h1 className="font-serif text-3xl md:text-4xl font-bold text-foreground mb-6">
            Payroll Summary
          </h1>
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Users className="h-8 w-8 mx-auto mb-3 opacity-50" />
              <p className="text-sm">You do not have permission to view this page. Admin access required.</p>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" data-testid="page-payroll">
      <Navbar />

      <main className="container py-10 md:py-14 px-6 md:px-10 max-w-5xl mx-auto">
        <h1 className="font-serif text-3xl md:text-4xl font-bold text-foreground mb-6">
          Payroll Summary
        </h1>

        <Card className="mb-6">
          <CardContent className="py-4 flex items-center justify-between gap-3 flex-wrap">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setPeriodOffset((p) => p - 1)}
              data-testid="button-prev-period"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium text-foreground" data-testid="text-period-range">
              {formatPeriodDate(currentPeriod.start)} &mdash; {formatPeriodDate(currentPeriod.end)}
            </span>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setPeriodOffset((p) => p + 1)}
              data-testid="button-next-period"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card data-testid="card-total-hours">
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Hours</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{totalHours.toFixed(1)}</div>
            </CardContent>
          </Card>
          <Card data-testid="card-total-entries">
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Entries</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{totalEntries}</div>
            </CardContent>
          </Card>
          <Card data-testid="card-pending">
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Pending Approval</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{pendingCount}</div>
            </CardContent>
          </Card>
          <Card data-testid="card-approved">
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Approved</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{approvedCount}</div>
            </CardContent>
          </Card>
        </div>

        {pendingCount > 0 && (
          <div className="flex items-center gap-3 mb-6 flex-wrap">
            <Button
              onClick={handleApproveAll}
              disabled={approveMutation.isPending}
              data-testid="button-approve-all"
            >
              {approveMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              )}
              Approve All Submitted ({pendingCount})
            </Button>
            {selectedEntryIds.size > 0 && (
              <Button
                variant="outline"
                onClick={handleApproveSelected}
                disabled={approveMutation.isPending}
                data-testid="button-approve-selected"
              >
                Approve Selected ({selectedEntryIds.size})
              </Button>
            )}
          </div>
        )}

        {entriesLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : crewSummaries.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Clock className="h-8 w-8 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No time entries for this pay period.</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Crew Member</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                  <TableHead className="text-right">Entries</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {crewSummaries.map((crew) => {
                  const isExpanded = expandedUsers.has(crew.userId);
                  return (
                    <CrewSection
                      key={crew.userId}
                      crew={crew}
                      isExpanded={isExpanded}
                      onToggle={() => toggleExpand(crew.userId)}
                      projectMap={projectMap}
                      selectedEntryIds={selectedEntryIds}
                      onToggleEntry={toggleEntrySelection}
                    />
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        )}

        {crewSummaries.length > 0 && (
          <div className="mt-8 print:mt-4">
            <h2 className="font-serif text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Payroll Export Summary
            </h2>
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="text-right">Total Hours</TableHead>
                    <TableHead className="text-right">Submitted</TableHead>
                    <TableHead className="text-right">Approved</TableHead>
                    <TableHead className="text-right">Draft</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {crewSummaries.map((crew) => (
                    <TableRow key={crew.userId}>
                      <TableCell className="font-medium">{crew.name}</TableCell>
                      <TableCell className="text-right">{crew.totalHours.toFixed(1)}</TableCell>
                      <TableCell className="text-right">{crew.submitted}</TableCell>
                      <TableCell className="text-right">{crew.approved}</TableCell>
                      <TableCell className="text-right">{crew.draft}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-bold border-t-2">
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right">{totalHours.toFixed(1)}</TableCell>
                    <TableCell className="text-right">{pendingCount}</TableCell>
                    <TableCell className="text-right">{approvedCount}</TableCell>
                    <TableCell className="text-right">
                      {entries?.filter((e) => e.status === "draft").length || 0}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}

function CrewSection({
  crew,
  isExpanded,
  onToggle,
  projectMap,
  selectedEntryIds,
  onToggleEntry,
}: {
  crew: {
    userId: string;
    name: string;
    entries: TimeEntry[];
    totalHours: number;
    submitted: number;
    approved: number;
    draft: number;
  };
  isExpanded: boolean;
  onToggle: () => void;
  projectMap: Map<number, string>;
  selectedEntryIds: Set<number>;
  onToggleEntry: (id: number) => void;
}) {
  return (
    <>
      <TableRow
        className="cursor-pointer hover-elevate"
        onClick={onToggle}
        data-testid={`crew-row-${crew.userId}`}
      >
        <TableCell>
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </TableCell>
        <TableCell className="font-medium">{crew.name}</TableCell>
        <TableCell className="text-right font-semibold">{crew.totalHours.toFixed(1)}</TableCell>
        <TableCell className="text-right">{crew.entries.length}</TableCell>
        <TableCell>
          <div className="flex items-center gap-1 flex-wrap">
            {crew.draft > 0 && (
              <Badge variant="outline" className="no-default-hover-elevate no-default-active-elevate">
                {crew.draft} draft
              </Badge>
            )}
            {crew.submitted > 0 && (
              <Badge variant="default" className="no-default-hover-elevate no-default-active-elevate">
                {crew.submitted} submitted
              </Badge>
            )}
            {crew.approved > 0 && (
              <Badge variant="secondary" className="no-default-hover-elevate no-default-active-elevate bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                {crew.approved} approved
              </Badge>
            )}
          </div>
        </TableCell>
      </TableRow>
      {isExpanded &&
        crew.entries
          .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
          .map((entry) => (
            <TableRow
              key={entry.id}
              className="bg-muted/30"
              data-testid={`crew-detail-${entry.id}`}
            >
              <TableCell>
                {entry.status === "submitted" && (
                  <Checkbox
                    checked={selectedEntryIds.has(entry.id)}
                    onCheckedChange={() => onToggleEntry(entry.id)}
                    onClick={(e) => e.stopPropagation()}
                    data-testid={`checkbox-entry-${entry.id}`}
                  />
                )}
              </TableCell>
              <TableCell>
                <div className="flex flex-col">
                  <span className="text-sm">{entry.date ? formatShortDate(entry.date) : ""}</span>
                  <span className="text-xs text-muted-foreground">
                    {projectMap.get(entry.projectId) || "Unknown project"}
                  </span>
                </div>
              </TableCell>
              <TableCell className="text-right">{parseFloat(entry.hours || "0").toFixed(1)}</TableCell>
              <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                {entry.description || ""}
              </TableCell>
              <TableCell>
                <Badge
                  variant={
                    entry.status === "approved"
                      ? "secondary"
                      : entry.status === "submitted"
                        ? "default"
                        : "outline"
                  }
                  className={`no-default-hover-elevate no-default-active-elevate ${entry.status === "approved" ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" : ""}`}
                >
                  {entry.status === "approved" && <CheckCircle2 className="h-3 w-3 mr-1" />}
                  {entry.status.charAt(0).toUpperCase() + entry.status.slice(1)}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
    </>
  );
}
