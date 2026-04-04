import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Navbar } from "@/components/layout/Navbar";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { Clock, Calendar, Briefcase, Send, Trash2, Plus, CheckCircle2, Loader2, User, Pencil, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";
import type { Project, Milestone, CalendarEvent, TimeEntry } from "@shared/schema";

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

export default function Timesheets() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const today = new Date();
  const period = getPayPeriod(today);
  const todayStr = today.toISOString().split("T")[0];

  const nowHour = today.getHours();
  const nowMin = today.getMinutes();
  const roundedMin = Math.round(nowMin / 15) * 15;
  const defaultTime = `${String(roundedMin >= 60 ? nowHour + 1 : nowHour).padStart(2, "0")}:${String(roundedMin % 60).padStart(2, "0")}`;

  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [startTime, setStartTime] = useState(defaultTime);
  const [endTime, setEndTime] = useState("");
  const [description, setDescription] = useState("");
  const [selectedMilestoneId, setSelectedMilestoneId] = useState("");
  const [selectedCalendarEventId, setSelectedCalendarEventId] = useState("");

  function calcHours(start: string, end: string): number {
    if (!start || !end) return 0;
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    let diff = (eh * 60 + em) - (sh * 60 + sm);
    if (diff <= 0) diff += 24 * 60;
    return Math.round((diff / 60) * 100) / 100;
  }

  const calculatedHours = calcHours(startTime, endTime);

  const entriesQueryKey = `/api/time-entries?startDate=${period.start}&endDate=${period.end}`;

  const { data: projects } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: entries, isLoading: entriesLoading } = useQuery<TimeEntry[]>({
    queryKey: [entriesQueryKey],
  });

  const projectIdNum = selectedProjectId ? parseInt(selectedProjectId) : 0;

  const { data: milestones } = useQuery<Milestone[]>({
    queryKey: [`/api/projects/${projectIdNum}/milestones`],
    enabled: !!projectIdNum,
  });

  const { data: calendarEvents } = useQuery<CalendarEvent[]>({
    queryKey: [`/api/projects/${projectIdNum}/calendar`],
    enabled: !!projectIdNum,
  });

  const createEntry = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/time-entries", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Entry added", description: "Time entry saved as draft." });
      queryClient.invalidateQueries({ queryKey: [entriesQueryKey] });
      setTimeout(() => {
        setStartTime("");
        setEndTime("");
        setDescription("");
        setSelectedMilestoneId("");
        setSelectedCalendarEventId("");
      }, 2000);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteEntry = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/time-entries/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Deleted", description: "Time entry removed." });
      queryClient.invalidateQueries({ queryKey: [entriesQueryKey] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateEntry = useMutation({
    mutationFn: async ({ id, ...data }: Record<string, unknown>) => {
      const res = await apiRequest("PATCH", `/api/time-entries/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Updated", description: "Time entry updated." });
      queryClient.invalidateQueries({ queryKey: [entriesQueryKey] });
      setEditingEntry(null);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null);
  const [editStartTime, setEditStartTime] = useState("");
  const [editEndTime, setEditEndTime] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editProjectId, setEditProjectId] = useState("");

  function openEditDialog(entry: TimeEntry) {
    setEditingEntry(entry);
    setEditDate(entry.date || "");
    setEditDescription(entry.description || "");
    setEditProjectId(String(entry.projectId));
    if (entry.startTime) {
      const st = new Date(entry.startTime);
      setEditStartTime(`${String(st.getHours()).padStart(2,"0")}:${String(st.getMinutes()).padStart(2,"0")}`);
    } else {
      setEditStartTime("");
    }
    if (entry.endTime) {
      const et = new Date(entry.endTime);
      setEditEndTime(`${String(et.getHours()).padStart(2,"0")}:${String(et.getMinutes()).padStart(2,"0")}`);
    } else {
      setEditEndTime("");
    }
  }

  const editCalcHours = calcHours(editStartTime, editEndTime);

  function handleSaveEdit() {
    if (!editingEntry || !editStartTime || !editEndTime || !editDescription.trim() || !editDate || !editProjectId) return;
    if (editCalcHours <= 0) return;
    updateEntry.mutate({
      id: editingEntry.id,
      projectId: parseInt(editProjectId),
      date: editDate,
      hours: editCalcHours.toFixed(2),
      startTime: new Date(`${editDate}T${editStartTime}:00`).toISOString(),
      endTime: new Date(`${editDate}T${editEndTime}:00`).toISOString(),
      description: editDescription.trim(),
    });
  }

  const isAdmin = user?.role === "admin";
  const canEditEntry = (entry: TimeEntry) => isAdmin || entry.status === "draft";
  const canDeleteEntry = (entry: TimeEntry) => isAdmin || entry.status === "draft";

  const submitDrafts = useMutation({
    mutationFn: async (ids: number[]) => {
      const res = await apiRequest("POST", "/api/time-entries/submit", { ids });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Submitted", description: "Draft entries submitted for approval." });
      queryClient.invalidateQueries({ queryKey: [entriesQueryKey] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleAddEntry = () => {
    if (!selectedProjectId || !startTime || !endTime || !selectedDate || !description.trim()) {
      toast({ title: "Missing fields", description: "Please fill in all required fields.", variant: "destructive" });
      return;
    }
    if (calculatedHours <= 0) {
      toast({ title: "Invalid times", description: "End time must be after start time.", variant: "destructive" });
      return;
    }
    const body: Record<string, unknown> = {
      projectId: parseInt(selectedProjectId),
      date: selectedDate,
      hours: calculatedHours.toFixed(2),
      startTime: new Date(`${selectedDate}T${startTime}:00`).toISOString(),
      endTime: new Date(`${selectedDate}T${endTime}:00`).toISOString(),
      description: description.trim(),
      status: "draft",
      payPeriodStart: period.start,
      payPeriodEnd: period.end,
    };
    if (selectedMilestoneId) body.milestoneId = parseInt(selectedMilestoneId);
    if (selectedCalendarEventId) body.calendarEventId = parseInt(selectedCalendarEventId);
    createEntry.mutate(body);
  };

  const draftEntries = entries?.filter((e) => e.status === "draft") || [];
  const submittedEntries = entries?.filter((e) => e.status === "submitted") || [];
  const approvedEntries = entries?.filter((e) => e.status === "approved") || [];

  const totalHours = entries?.reduce((sum, e) => sum + parseFloat(e.hours || "0"), 0) || 0;

  const projectMap = new Map(projects?.map((p) => [p.id, p.name]) || []);

  const handleSubmitAllDrafts = () => {
    const ids = draftEntries.map((e) => e.id);
    if (ids.length === 0) return;
    submitDrafts.mutate(ids);
  };

  return (
    <div className="min-h-screen bg-background" data-testid="page-timesheets">
      <Navbar />

      <main className="container py-10 md:py-14 px-6 md:px-10 max-w-3xl mx-auto">
        <h1 className="font-serif text-3xl md:text-4xl font-bold text-foreground mb-6" data-testid="text-timesheets-heading">
          Timesheets
        </h1>

        <Card className="mb-6">
          <CardContent className="py-4 flex items-center gap-3 flex-wrap">
            <User className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground" data-testid="text-crew-name">
              {user?.firstName || user?.lastName ? `${user?.firstName || ""} ${user?.lastName || ""}`.trim() : user?.email || "Unknown"}
            </span>
            <span className="text-xs text-muted-foreground">&middot;</span>
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Pay Period:</span>
            <span className="text-sm font-medium text-foreground">
              {formatPeriodDate(period.start)} &mdash; {formatPeriodDate(period.end)}
            </span>
          </CardContent>
        </Card>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="font-serif text-lg flex items-center gap-2">
              <Plus className="h-5 w-5" />
              New Time Entry
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="entry-date">Date <span className="text-destructive">*</span></Label>
              <Input
                id="entry-date"
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                data-testid="input-date"
                className="mt-1.5"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Time In <span className="text-destructive">*</span></Label>
                <TimePicker value={startTime} onChange={setStartTime} testId="start-time" />
              </div>
              <div>
                <Label>Time Out <span className="text-destructive">*</span></Label>
                <TimePicker value={endTime} onChange={setEndTime} testId="end-time" />
              </div>
            </div>
            {startTime && endTime && calculatedHours > 0 && (
              <div className="flex items-center justify-between px-3 py-2.5 rounded-md bg-primary/5 border border-primary/20">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium text-foreground">Total Hours</span>
                </div>
                <span className="text-lg font-bold text-foreground">{calculatedHours.toFixed(2)}h</span>
              </div>
            )}

            <div>
              <Label>Project <span className="text-destructive">*</span></Label>
              <Select value={selectedProjectId} onValueChange={(v) => {
                setSelectedProjectId(v);
                setSelectedMilestoneId("");
                setSelectedCalendarEventId("");
              }}>
                <SelectTrigger className="mt-1.5" data-testid="select-project">
                  <SelectValue placeholder="Select a project..." />
                </SelectTrigger>
                <SelectContent>
                  {projects?.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {projectIdNum > 0 && milestones && milestones.length > 0 && (
              <div>
                <Label>Milestone (optional)</Label>
                <Select value={selectedMilestoneId} onValueChange={setSelectedMilestoneId}>
                  <SelectTrigger className="mt-1.5" data-testid="select-milestone">
                    <SelectValue placeholder="Tag a milestone..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {milestones.map((m) => (
                      <SelectItem key={m.id} value={String(m.id)}>
                        {m.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {projectIdNum > 0 && calendarEvents && calendarEvents.length > 0 && (
              <div>
                <Label>Calendar Event (optional)</Label>
                <Select value={selectedCalendarEventId} onValueChange={setSelectedCalendarEventId}>
                  <SelectTrigger className="mt-1.5" data-testid="select-calendar-event">
                    <SelectValue placeholder="Tag an event..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {calendarEvents.map((e) => (
                      <SelectItem key={e.id} value={String(e.id)}>
                        {e.title} ({e.date})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label htmlFor="entry-details">Details <span className="text-destructive">*</span></Label>
              <Textarea
                id="entry-details"
                placeholder="What did you work on today?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1.5 resize-none"
                rows={3}
                data-testid="textarea-details"
              />
            </div>

            <div className="flex justify-end pt-2">
              <Button
                onClick={handleAddEntry}
                disabled={createEntry.isPending || !selectedProjectId || !startTime || !endTime || !selectedDate || !description.trim() || calculatedHours <= 0}
                data-testid="button-add-entry"
              >
                {createEntry.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-2 h-4 w-4" />
                )}
                Add Entry
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardContent className="py-4 flex items-center gap-6 flex-wrap">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Total Hours:</span>
              <span className="text-sm font-semibold text-foreground" data-testid="text-period-total">
                {totalHours.toFixed(1)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Entries:</span>
              <span className="text-sm font-semibold text-foreground">{entries?.length || 0}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Drafts:</span>
              <span className="text-sm font-semibold text-foreground">{draftEntries.length}</span>
            </div>
          </CardContent>
        </Card>

        {entriesLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6">
            {draftEntries.length > 0 && (
              <div>
                <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    Drafts
                  </h2>
                  <Button
                    variant="default"
                    onClick={handleSubmitAllDrafts}
                    disabled={submitDrafts.isPending}
                    data-testid="button-submit-drafts"
                  >
                    {submitDrafts.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="mr-2 h-4 w-4" />
                    )}
                    Submit All Drafts
                  </Button>
                </div>
                <div className="space-y-2">
                  {draftEntries.map((entry) => (
                    <EntryRow
                      key={entry.id}
                      entry={entry}
                      projectName={projectMap.get(entry.projectId) || "Unknown"}
                      onDelete={canDeleteEntry(entry) ? () => deleteEntry.mutate(entry.id) : undefined}
                      onEdit={canEditEntry(entry) ? () => openEditDialog(entry) : undefined}
                      deleting={deleteEntry.isPending}
                    />
                  ))}
                </div>
              </div>
            )}

            {submittedEntries.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                  Submitted
                </h2>
                <div className="space-y-2">
                  {submittedEntries.map((entry) => (
                    <EntryRow
                      key={entry.id}
                      entry={entry}
                      projectName={projectMap.get(entry.projectId) || "Unknown"}
                      onDelete={canDeleteEntry(entry) ? () => deleteEntry.mutate(entry.id) : undefined}
                      onEdit={canEditEntry(entry) ? () => openEditDialog(entry) : undefined}
                      deleting={deleteEntry.isPending}
                    />
                  ))}
                </div>
              </div>
            )}

            {approvedEntries.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                  Approved
                </h2>
                <div className="space-y-2">
                  {approvedEntries.map((entry) => (
                    <EntryRow
                      key={entry.id}
                      entry={entry}
                      projectName={projectMap.get(entry.projectId) || "Unknown"}
                      onDelete={canDeleteEntry(entry) ? () => deleteEntry.mutate(entry.id) : undefined}
                      onEdit={canEditEntry(entry) ? () => openEditDialog(entry) : undefined}
                      deleting={deleteEntry.isPending}
                    />
                  ))}
                </div>
              </div>
            )}

            {(!entries || entries.length === 0) && (
              <div className="text-center py-12 text-muted-foreground">
                <Clock className="h-8 w-8 mx-auto mb-3 opacity-50" />
                <p className="text-sm">No time entries for this pay period yet.</p>
              </div>
            )}
          </div>
        )}
        <Dialog open={!!editingEntry} onOpenChange={(open) => { if (!open) setEditingEntry(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Time Entry</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <Label>Date <span className="text-destructive">*</span></Label>
                <Input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} className="mt-1.5" data-testid="input-edit-date" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Time In <span className="text-destructive">*</span></Label>
                  <TimePicker value={editStartTime} onChange={setEditStartTime} testId="edit-start" />
                </div>
                <div>
                  <Label>Time Out <span className="text-destructive">*</span></Label>
                  <TimePicker value={editEndTime} onChange={setEditEndTime} testId="edit-end" />
                </div>
              </div>
              {editStartTime && editEndTime && editCalcHours > 0 && (
                <div className="flex items-center justify-between px-3 py-2.5 rounded-md bg-primary/5 border border-primary/20">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium text-foreground">Total Hours</span>
                  </div>
                  <span className="text-lg font-bold text-foreground">{editCalcHours.toFixed(2)}h</span>
                </div>
              )}
              <div>
                <Label>Project <span className="text-destructive">*</span></Label>
                <Select value={editProjectId} onValueChange={setEditProjectId}>
                  <SelectTrigger className="mt-1.5" data-testid="select-edit-project">
                    <SelectValue placeholder="Select a project..." />
                  </SelectTrigger>
                  <SelectContent>
                    {projects?.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Details <span className="text-destructive">*</span></Label>
                <Textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} className="mt-1.5 resize-none" rows={3} data-testid="textarea-edit-details" />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditingEntry(null)}>Cancel</Button>
                <Button
                  onClick={handleSaveEdit}
                  disabled={updateEntry.isPending || !editStartTime || !editEndTime || !editDescription.trim() || !editDate || !editProjectId || editCalcHours <= 0}
                  data-testid="button-save-edit"
                >
                  {updateEntry.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Save Changes
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}

function TimePicker({ value, onChange, testId }: { value: string; onChange: (v: string) => void; testId: string }) {
  const [h, m] = value ? value.split(":").map(Number) : [0, 0];
  const hour12 = value ? (h === 0 ? 12 : h > 12 ? h - 12 : h) : 0;
  const ampm = value ? (h >= 12 ? "PM" : "AM") : "AM";
  const minute = value ? m : 0;

  function update(newH12: number, newM: number, newAmpm: string) {
    let h24 = newH12;
    if (newAmpm === "AM") {
      h24 = newH12 === 12 ? 0 : newH12;
    } else {
      h24 = newH12 === 12 ? 12 : newH12 + 12;
    }
    onChange(`${String(h24).padStart(2, "0")}:${String(newM).padStart(2, "0")}`);
  }

  return (
    <div className="flex items-center gap-1.5 mt-1.5" data-testid={`timepicker-${testId}`}>
      <Select value={value ? String(hour12) : ""} onValueChange={(v) => update(parseInt(v), minute, ampm)}>
        <SelectTrigger className="w-[70px]" data-testid={`select-${testId}-hour`}>
          <SelectValue placeholder="Hr" />
        </SelectTrigger>
        <SelectContent>
          {[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((hr) => (
            <SelectItem key={hr} value={String(hr)}>{hr}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="text-muted-foreground font-bold">:</span>
      <Select value={value ? String(minute) : ""} onValueChange={(v) => update(hour12 || 12, parseInt(v), ampm)}>
        <SelectTrigger className="w-[70px]" data-testid={`select-${testId}-min`}>
          <SelectValue placeholder="Min" />
        </SelectTrigger>
        <SelectContent>
          {[0, 15, 30, 45].map((min) => (
            <SelectItem key={min} value={String(min)}>{String(min).padStart(2, "0")}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={value ? ampm : ""} onValueChange={(v) => update(hour12 || 12, minute, v)}>
        <SelectTrigger className="w-[72px]" data-testid={`select-${testId}-ampm`}>
          <SelectValue placeholder="AM" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="AM">AM</SelectItem>
          <SelectItem value="PM">PM</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function EntryRow({
  entry,
  projectName,
  onDelete,
  onEdit,
  deleting,
}: {
  entry: TimeEntry;
  projectName: string;
  onDelete?: () => void;
  onEdit?: () => void;
  deleting?: boolean;
}) {
  const statusVariant =
    entry.status === "approved"
      ? "default"
      : entry.status === "submitted"
        ? "secondary"
        : "outline";

  const statusLabel =
    entry.status === "approved"
      ? "Approved"
      : entry.status === "submitted"
        ? "Submitted"
        : "Draft";

  const [y, m, d] = (entry.date || "").split("-").map(Number);
  const dateLabel = entry.date ? format(new Date(y, m - 1, d), "EEE, MMM d") : "";

  const startLabel = entry.startTime ? new Date(entry.startTime).toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit", hour12: true }) : null;
  const endLabel = entry.endTime ? new Date(entry.endTime).toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit", hour12: true }) : null;

  return (
    <Card data-testid={`entry-row-${entry.id}`}>
      <CardContent className="py-3 flex items-center gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-foreground">{dateLabel}</span>
            <span className="text-xs text-muted-foreground">&middot;</span>
            <span className="text-sm text-muted-foreground">{projectName}</span>
          </div>
          {startLabel && endLabel && (
            <div className="flex items-center gap-1 mt-0.5">
              <Clock className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{startLabel} — {endLabel}</span>
            </div>
          )}
          {entry.description && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{entry.description}</p>
          )}
        </div>
        <span className="text-sm font-semibold text-foreground whitespace-nowrap">
          {parseFloat(entry.hours || "0").toFixed(1)}h
        </span>
        <Badge
          variant={statusVariant}
          className="no-default-hover-elevate no-default-active-elevate"
        >
          {statusLabel === "Approved" && <CheckCircle2 className="h-3 w-3 mr-1" />}
          {statusLabel}
        </Badge>
        {onEdit && (
          <Button
            size="icon"
            variant="ghost"
            onClick={onEdit}
            data-testid={`button-edit-${entry.id}`}
          >
            <Pencil className="h-4 w-4" />
          </Button>
        )}
        {onDelete && (
          <Button
            size="icon"
            variant="ghost"
            onClick={onDelete}
            disabled={deleting}
            data-testid={`button-delete-${entry.id}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
