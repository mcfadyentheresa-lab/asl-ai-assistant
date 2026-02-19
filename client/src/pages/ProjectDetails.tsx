import { useParams, Link } from "wouter";
import {
  useProject, useMilestones, useTasks, useMessages, useSendMessage,
  useChecklistItems, useCreateChecklistItem, useUpdateChecklistItem, useDeleteChecklistItem,
  useBoardItems, useCreateBoardItem, useDeleteBoardItem,
  useCalendarEvents, useCreateCalendarEvent, useUpdateCalendarEvent, useDeleteCalendarEvent,
  useDocuments, useUploadDocument, useDeleteDocument,
  usePhotos, useCreatePhoto, useDeletePhoto, useUploadImage,
  useUsers, useUpdateProject, usePlanningBoards,
} from "@/hooks/use-projects";
import { Navbar } from "@/components/layout/Navbar";
import SpatialCanvas from "@/components/SpatialCanvas";
import { Loader2, Clock, FileText, ImageIcon, MessageSquare, ArrowLeft, Send, Trash2, CheckSquare, LayoutGrid, ExternalLink, Plus, ChevronDown, ChevronRight, Link2, StickyNote, Pencil, CalendarIcon, CalendarDays, ChevronLeft, Upload, Download, User, X, Paperclip, ZoomIn, Palette, Shield, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isSameDay, isSameMonth, parseISO } from "date-fns";
import type { ChecklistItem, BoardItem, CalendarEvent } from "@shared/schema";

export default function ProjectDetails() {
  const { id } = useParams();
  const projectId = Number(id);
  const { data: project, isLoading: loadingProject } = useProject(projectId);
  const { data: milestones } = useMilestones(projectId);
  const { data: tasks } = useTasks(projectId);
  const { user } = useAuth();
  const { data: users } = useUsers();
  const { mutate: updateProject } = useUpdateProject();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState("overview");
  const { data: planningBoards } = usePlanningBoards(projectId);
  const assignedClient = users?.find((u) => u.id === project?.clientId);

  const userRole = user?.role || "client";

  const isClientInvitedToBoard = userRole === "client" && Array.isArray(planningBoards) &&
    planningBoards.some((b: any) => (b.linkedUserIds || []).includes(user?.id));

  type TabConfig = {
    id: string;
    label: string;
    icon: any;
    roles: string[];
    clientRequiresInvite?: boolean;
  };

  const tabConfig: TabConfig[] = [
    { id: "overview", label: "Overview", icon: Clock, roles: ["admin", "crew", "client"] },
    { id: "checklist", label: "Checklist", icon: CheckSquare, roles: ["admin", "client"] },
    { id: "board", label: "Planning Board", icon: Palette, roles: ["admin", "crew", "client"], clientRequiresInvite: true },
    { id: "calendar", label: "Calendar", icon: CalendarDays, roles: ["admin", "crew", "client"] },
    { id: "photos", label: "Photos", icon: ImageIcon, roles: ["admin", "crew", "client"] },
    { id: "docs", label: "Documents", icon: FileText, roles: ["admin", "client"] },
    { id: "chat", label: "Messages", icon: MessageSquare, roles: ["admin", "crew", "client"] },
  ];

  const canViewTab = (tab: TabConfig) => {
    if (!tab.roles.includes(userRole)) return false;
    if (tab.clientRequiresInvite && userRole === "client" && !isClientInvitedToBoard) return false;
    return true;
  };

  const visibleTabs = tabConfig.filter(canViewTab);

  const safeActiveTab = visibleTabs.find(t => t.id === activeTab) ? activeTab : (visibleTabs[0]?.id || "overview");

  if (loadingProject) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" data-testid="loader-project" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
        <h1 className="font-serif text-2xl font-bold text-foreground" data-testid="text-not-found">Project not found</h1>
        <Link href="/">
          <Button data-testid="button-go-home">Go Home</Button>
        </Link>
      </div>
    );
  }

  const statusLabel: Record<string, string> = {
    planning: "Planning",
    in_progress: "In Progress",
    completed: "Completed",
    archived: "Archived",
  };

  return (
    <div className={`min-h-screen bg-background ${safeActiveTab === "board" ? "h-[100dvh] overflow-hidden" : "pb-20"}`}>
      <Navbar />

      <div className={`relative w-full overflow-hidden ${safeActiveTab === "board" ? "h-20 landscape:h-14" : "h-56 md:h-72"}`} data-testid="project-hero">
        {project.thumbnailUrl ? (
          <img
            src={project.thumbnailUrl}
            alt={project.name}
            className="h-full w-full object-cover"
            data-testid="img-project-hero"
          />
        ) : (
          <div className="h-full w-full bg-muted" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />

        <div className="absolute bottom-0 left-0 right-0 container px-6 md:px-10 pb-6">
          <Link href="/" className="inline-flex items-center text-sm text-muted-foreground mb-3 transition-colors" data-testid="link-back">
            <ArrowLeft className="mr-1 h-4 w-4" /> Back to Dashboard
          </Link>
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
            <div>
              <h1 className="font-serif text-3xl md:text-4xl font-bold text-foreground mb-1" data-testid="text-project-title">
                {project.name}
              </h1>
              <p className="text-muted-foreground max-w-2xl text-sm" data-testid="text-project-desc">
                {project.description}
              </p>
            </div>
            <Badge variant="secondary" data-testid="badge-project-status">
              {statusLabel[project.status] || project.status}
            </Badge>
          </div>
        </div>
      </div>

      <main className={`container px-6 md:px-10 ${safeActiveTab === "board" ? "mt-1 flex flex-col" : "mt-8"}`} style={safeActiveTab === "board" ? { height: "calc(100dvh - 10rem)" } : undefined}>
        <Tabs value={safeActiveTab} onValueChange={setActiveTab} className={safeActiveTab === "board" ? "space-y-2 flex flex-col flex-1 min-h-0" : "space-y-8"}>
          <div className="overflow-x-auto -mx-6 px-6 md:mx-0 md:px-0">
            <TabsList className="w-max md:w-auto" data-testid="tabs-list">
              {visibleTabs.map((tab) => (
                <TabsTrigger key={tab.id} value={tab.id} data-testid={`tab-${tab.id}`}>
                  <tab.icon className="h-4 w-4 md:mr-2" />
                  <span className="hidden md:inline">{tab.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <TabsContent value="overview" className="space-y-8">
            <div className="grid md:grid-cols-3 gap-8">
              <div className="md:col-span-2 space-y-6">
                <h3 className="font-serif text-xl font-bold text-foreground" data-testid="text-timeline-heading">
                  Project Timeline
                </h3>

                <div className="relative border-l-2 border-border ml-3 space-y-6 pb-2">
                  {milestones && milestones.length > 0 ? (
                    milestones.map((milestone) => (
                      <div key={milestone.id} className="relative pl-8" data-testid={`milestone-${milestone.id}`}>
                        <div
                          className={`absolute -left-[9px] top-1.5 h-4 w-4 rounded-full border-2 border-background ${
                            milestone.completed ? "bg-foreground" : "bg-muted-foreground/30"
                          }`}
                        />
                        <Card>
                          <CardHeader className="p-4 flex flex-row flex-wrap items-start justify-between gap-2">
                            <div>
                              <CardTitle className="text-base font-semibold" data-testid={`text-milestone-title-${milestone.id}`}>
                                {milestone.title}
                              </CardTitle>
                              <CardDescription>
                                {milestone.date && format(new Date(milestone.date), "MMMM d, yyyy")}
                              </CardDescription>
                            </div>
                            {milestone.completed && (
                              <Badge variant="outline" data-testid={`badge-milestone-complete-${milestone.id}`}>
                                Completed
                              </Badge>
                            )}
                          </CardHeader>
                        </Card>
                      </div>
                    ))
                  ) : (
                    <div className="pl-8 text-muted-foreground text-sm italic" data-testid="text-no-milestones">
                      No milestones set yet.
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="font-serif text-lg" data-testid="text-client-heading">
                      Assigned Client
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {user?.role !== "client" ? (
                      <Select
                        value={project.clientId || "none"}
                        onValueChange={(val) => {
                          const clientId = val === "none" ? null : val;
                          updateProject({ id: projectId, data: { clientId } }, {
                            onSuccess: () => toast({ title: "Client updated" }),
                          });
                        }}
                      >
                        <SelectTrigger data-testid="select-project-client">
                          <SelectValue placeholder="Select a client..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No client assigned</SelectItem>
                          {users?.map((u) => (
                            <SelectItem key={u.id} value={u.id}>
                              <div className="flex items-center gap-2">
                                <span>{u.firstName || ""} {u.lastName || ""}</span>
                                {u.email && <span className="text-muted-foreground text-xs">({u.email})</span>}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : assignedClient ? (
                      <div className="flex items-center gap-3" data-testid="text-assigned-client">
                        <Avatar>
                          <AvatarFallback>
                            {(assignedClient.firstName?.[0] || "") + (assignedClient.lastName?.[0] || "")}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium text-foreground text-sm">
                            {assignedClient.firstName || ""} {assignedClient.lastName || ""}
                          </p>
                          {assignedClient.email && (
                            <p className="text-muted-foreground text-xs">{assignedClient.email}</p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <p className="text-muted-foreground text-sm" data-testid="text-no-client">No client assigned</p>
                    )}
                  </CardContent>
                </Card>

                {userRole !== "client" && (() => {
                  const admins = users?.filter((u: any) => u.role === "admin") || [];
                  const crewMembers = users?.filter((u: any) => u.role === "crew") || [];
                  const clients = users?.filter((u: any) => u.role === "client" && u.id === project.clientId) || [];
                  const boardInvitedClients = Array.isArray(planningBoards) ? users?.filter((u: any) =>
                    u.role === "client" && u.id !== project.clientId &&
                    planningBoards.some((b: any) => (b.linkedUserIds || []).includes(u.id))
                  ) || [] : [];
                  const allClients = [...clients, ...boardInvitedClients];

                  return (
                    <Card>
                      <CardHeader>
                        <CardTitle className="font-serif text-lg flex items-center gap-2" data-testid="text-access-heading">
                          <Shield className="h-4 w-4 text-muted-foreground" />
                          Project Access
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div data-testid="access-group-admin">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Admins ({admins.length})</p>
                          <div className="space-y-1.5">
                            {admins.map((u: any) => (
                              <div key={u.id} className="flex items-center gap-2" data-testid={`access-user-${u.id}`}>
                                <Avatar className="h-6 w-6">
                                  <AvatarFallback className="text-[10px]">
                                    {(u.firstName?.[0] || "").toUpperCase()}{(u.lastName?.[0] || "").toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="text-sm truncate">{u.firstName} {u.lastName}</span>
                                <Badge variant="outline" className="ml-auto text-[10px]">Full access</Badge>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div data-testid="access-group-crew">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Crew ({crewMembers.length})</p>
                          <div className="space-y-1.5">
                            {crewMembers.length > 0 ? crewMembers.map((u: any) => (
                              <div key={u.id} className="flex items-center gap-2" data-testid={`access-user-${u.id}`}>
                                <Avatar className="h-6 w-6">
                                  <AvatarFallback className="text-[10px]">
                                    {(u.firstName?.[0] || "").toUpperCase()}{(u.lastName?.[0] || "").toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="text-sm truncate">{u.firstName} {u.lastName}</span>
                              </div>
                            )) : (
                              <p className="text-xs text-muted-foreground italic">No crew assigned</p>
                            )}
                          </div>
                        </div>
                        <div data-testid="access-group-client">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Clients ({allClients.length})</p>
                          <div className="space-y-1.5">
                            {allClients.length > 0 ? allClients.map((u: any) => (
                              <div key={u.id} className="flex items-center gap-2" data-testid={`access-user-${u.id}`}>
                                <Avatar className="h-6 w-6">
                                  <AvatarFallback className="text-[10px]">
                                    {(u.firstName?.[0] || "").toUpperCase()}{(u.lastName?.[0] || "").toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="text-sm truncate">{u.firstName} {u.lastName}</span>
                                {u.id === project.clientId ? (
                                  <Badge variant="outline" className="ml-auto text-[10px]">Project owner</Badge>
                                ) : (
                                  <Badge variant="outline" className="ml-auto text-[10px]">Board invited</Badge>
                                )}
                              </div>
                            )) : (
                              <p className="text-xs text-muted-foreground italic">No client assigned</p>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })()}

                <Card>
                  <CardHeader>
                    <CardTitle className="font-serif text-lg" data-testid="text-activity-heading">
                      Recent Activity
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {tasks?.slice(0, 5).map((task) => (
                        <div
                          key={task.id}
                          className="flex items-start gap-3 text-sm pb-3 border-b last:border-0 last:pb-0"
                          data-testid={`task-${task.id}`}
                        >
                          <div
                            className={`mt-1 h-2 w-2 rounded-full flex-shrink-0 ${
                              task.status === "done" ? "bg-green-600 dark:bg-green-400" : "bg-amber-500 dark:bg-amber-400"
                            }`}
                          />
                          <div>
                            <p className="font-medium text-foreground">{task.title}</p>
                            <p className="text-muted-foreground text-xs">
                              Status: {task.status}
                            </p>
                          </div>
                        </div>
                      ))}
                      {!tasks?.length && (
                        <p className="text-muted-foreground text-sm" data-testid="text-no-tasks">
                          No tasks tracked yet.
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="checklist">
            <ChecklistTab projectId={projectId} />
          </TabsContent>

          <TabsContent value="board" className="flex-1 min-h-0">
            <SpatialCanvas projectId={projectId} />
          </TabsContent>

          <TabsContent value="chat">
            <ChatTab projectId={projectId} />
          </TabsContent>

          <TabsContent value="photos">
            <PhotosTab projectId={projectId} />
          </TabsContent>

          <TabsContent value="calendar">
            <CalendarTab projectId={projectId} />
          </TabsContent>

          <TabsContent value="docs">
            <DocumentsTab projectId={projectId} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

const EDITED_TEXT_COLOR = "#b45309";

function ChecklistTab({ projectId }: { projectId: number }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: items, isLoading } = useChecklistItems(projectId);
  const { mutate: createItem, isPending: isCreating } = useCreateChecklistItem();
  const { mutate: updateItem } = useUpdateChecklistItem();
  const { mutate: deleteItem } = useDeleteChecklistItem();
  const { mutate: addToCalendar } = useCreateCalendarEvent();

  const [newTitle, setNewTitle] = useState("");
  const [newGroup, setNewGroup] = useState("General");
  const [customGroup, setCustomGroup] = useState("");
  const [newPriority, setNewPriority] = useState("normal");
  const [newStatus, setNewStatus] = useState("todo");
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [editItem, setEditItem] = useState<ChecklistItem | null>(null);
  const [editForm, setEditForm] = useState({ title: "", group: "", priority: "normal", status: "todo", notes: "", priceEstimate: "" });

  const isCrew = user?.email?.includes("crew") || user?.email?.includes("admin");

  const defaultGroups = ["Boathouse", "Cottage", "General"];
  const existingGroups = items
    ? Array.from(new Set(items.map((i: ChecklistItem) => i.group || "General")))
    : [];
  const allGroups = Array.from(new Set([...defaultGroups, ...existingGroups]));

  const groupedItems: Record<string, ChecklistItem[]> = {};
  if (items) {
    for (const item of items as ChecklistItem[]) {
      const g = item.group || "General";
      if (!groupedItems[g]) groupedItems[g] = [];
      groupedItems[g].push(item);
    }
  }

  const totalItems = items?.length || 0;
  const completedItems = items?.filter((i: ChecklistItem) => i.status === "done" || i.completed).length || 0;
  const nextYearItems = items?.filter((i: ChecklistItem) => i.status === "next_year").length || 0;
  const totalEstimate = items?.reduce((sum: number, i: ChecklistItem) => sum + (i.priceEstimate || 0), 0) || 0;

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    const groupValue = newGroup === "__custom__" ? customGroup.trim() || "General" : newGroup;
    createItem(
      { projectId, title: newTitle.trim(), priority: newPriority, group: groupValue, status: newStatus },
      {
        onSuccess: () => {
          toast({ title: "Success", description: "Checklist item added." });
          setNewTitle("");
          setNewPriority("normal");
          setNewStatus("todo");
          setNewGroup("General");
          setCustomGroup("");
        },
        onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
      }
    );
  };

  const handleToggle = (item: ChecklistItem) => {
    const newStatusValue = item.status === "done" ? "todo" : "done";
    updateItem(
      { id: item.id, completed: newStatusValue === "done", status: newStatusValue },
      { onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }) }
    );
  };

  const handleNotesChange = (item: ChecklistItem, notes: string) => {
    updateItem({ id: item.id, notes });
  };

  const handlePriceChange = (item: ChecklistItem, value: string) => {
    const priceEstimate = value ? parseInt(value, 10) : null;
    updateItem({ id: item.id, priceEstimate });
  };

  const handleDelete = (id: number) => {
    deleteItem(id, {
      onSuccess: () => toast({ title: "Success", description: "Item removed." }),
      onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
    });
  };

  const toggleGroup = (group: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [group]: !prev[group] }));
  };

  const openEditDialog = (item: ChecklistItem) => {
    setEditForm({
      title: item.title,
      group: item.group || "General",
      priority: item.priority || "normal",
      status: item.status || "todo",
      notes: item.notes || "",
      priceEstimate: item.priceEstimate != null ? String(item.priceEstimate) : "",
    });
    setEditItem(item);
  };

  const handleEditSave = () => {
    if (!editItem) return;
    updateItem(
      {
        id: editItem.id,
        title: editForm.title,
        group: editForm.group,
        priority: editForm.priority,
        status: editForm.status,
        completed: editForm.status === "done",
        notes: editForm.notes || null,
        priceEstimate: editForm.priceEstimate ? parseInt(editForm.priceEstimate, 10) : null,
        color: EDITED_TEXT_COLOR,
      },
      {
        onSuccess: () => {
          toast({ title: "Updated", description: "Checklist item updated." });
          setEditItem(null);
        },
        onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
      }
    );
  };

  const priorityVariant = (p: string | null) => {
    if (p === "high") return "destructive" as const;
    if (p === "low") return "outline" as const;
    return "secondary" as const;
  };

  const statusLabel: Record<string, string> = {
    todo: "To Do",
    in_progress: "In Progress",
    done: "Done",
    next_year: "Next Year",
  };

  const statusBadge = (status: string | null) => {
    const s = status || "todo";
    if (s === "done") return <Badge className="bg-green-600 dark:bg-green-500 text-white border-transparent no-default-hover-elevate" data-testid="badge-status-done">{statusLabel[s]}</Badge>;
    if (s === "in_progress") return <Badge className="bg-amber-500 dark:bg-amber-400 text-white border-transparent no-default-hover-elevate" data-testid="badge-status-in-progress">{statusLabel[s]}</Badge>;
    if (s === "next_year") return <Badge variant="outline" className="text-muted-foreground no-default-hover-elevate" data-testid="badge-status-next-year">{statusLabel[s]}</Badge>;
    return <Badge variant="secondary" className="no-default-hover-elevate" data-testid="badge-status-todo">{statusLabel[s]}</Badge>;
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="animate-spin text-muted-foreground" data-testid="loader-checklist" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground" data-testid="checklist-summary">
        <span data-testid="text-total-items">{totalItems} items total</span>
        <span className="text-border">·</span>
        <span data-testid="text-completed-items">{completedItems} completed</span>
        <span className="text-border">·</span>
        <span data-testid="text-next-year-items">{nextYearItems} next year</span>
        {totalEstimate > 0 && (
          <>
            <span className="text-border">·</span>
            <span className="font-medium text-foreground" data-testid="text-total-estimate">
              ${totalEstimate.toLocaleString()} estimated
            </span>
          </>
        )}
      </div>

      <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-3 flex-wrap" data-testid="form-add-checklist">
        <Input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Add a checklist item..."
          className="flex-1 min-w-[200px]"
          data-testid="input-checklist-title"
        />
        <Select value={newGroup} onValueChange={(v) => { setNewGroup(v); if (v !== "__custom__") setCustomGroup(""); }}>
          <SelectTrigger className="w-full sm:w-[160px]" data-testid="select-checklist-group">
            <SelectValue placeholder="Group" />
          </SelectTrigger>
          <SelectContent>
            {allGroups.map((g) => (
              <SelectItem key={g} value={g}>{g}</SelectItem>
            ))}
            <SelectItem value="__custom__">Custom...</SelectItem>
          </SelectContent>
        </Select>
        {newGroup === "__custom__" && (
          <Input
            value={customGroup}
            onChange={(e) => setCustomGroup(e.target.value)}
            placeholder="Custom group name..."
            className="w-full sm:w-[160px]"
            data-testid="input-custom-group"
          />
        )}
        <Select value={newPriority} onValueChange={setNewPriority}>
          <SelectTrigger className="w-full sm:w-[120px]" data-testid="select-checklist-priority">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="high">High</SelectItem>
          </SelectContent>
        </Select>
        <Select value={newStatus} onValueChange={setNewStatus}>
          <SelectTrigger className="w-full sm:w-[140px]" data-testid="select-checklist-status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todo">To Do</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="done">Done</SelectItem>
            <SelectItem value="next_year">Next Year</SelectItem>
          </SelectContent>
        </Select>
        <Button type="submit" disabled={isCreating || !newTitle.trim()} data-testid="button-add-checklist">
          {isCreating ? <Loader2 className="mr-2 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
          Add
        </Button>
      </form>

      {totalItems > 0 ? (
        <div className="space-y-4">
          {Object.entries(groupedItems).map(([group, groupItems]) => (
            <Card key={group} data-testid={`checklist-group-${group}`}>
              <div
                className="flex items-center gap-2 p-4 cursor-pointer select-none"
                onClick={() => toggleGroup(group)}
                data-testid={`button-toggle-group-${group}`}
              >
                {collapsedGroups[group] ? (
                  <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                )}
                <span className="font-serif font-semibold text-foreground" data-testid={`text-group-name-${group}`}>
                  {group}
                </span>
                <span className="text-xs text-muted-foreground" data-testid={`text-group-count-${group}`}>
                  ({groupItems.length})
                </span>
              </div>
              {!collapsedGroups[group] && (
                <div className="border-t" data-testid={`group-items-${group}`}>
                  {groupItems.map((item) => {
                    const isDone = item.status === "done" || !!item.completed;
                    const isNextYear = item.status === "next_year";
                    const itemColor = item.color || "";
                    return (
                      <div
                        key={item.id}
                        className={`relative flex items-start gap-3 px-4 py-3 border-b last:border-b-0 transition-opacity ${isDone ? "opacity-60" : ""} ${isNextYear ? "opacity-50" : ""}`}
                        data-testid={`checklist-item-${item.id}`}
                      >
                        <Checkbox
                          checked={isDone}
                          onCheckedChange={() => handleToggle(item)}
                          className="mt-0.5"
                          data-testid={`checkbox-checklist-${item.id}`}
                        />
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`font-medium text-sm ${isDone ? "line-through text-muted-foreground" : ""}`}
                              style={!isDone && itemColor ? { color: itemColor } : undefined}
                              data-testid={`text-checklist-title-${item.id}`}
                            >
                              {item.title}
                            </span>
                            <Badge variant={priorityVariant(item.priority)} className="no-default-hover-elevate" data-testid={`badge-priority-${item.id}`}>
                              {item.priority || "normal"}
                            </Badge>
                            {statusBadge(item.status)}
                            {item.priceEstimate != null && (
                              <span className="text-xs text-muted-foreground" data-testid={`text-price-${item.id}`}>
                                ${item.priceEstimate.toLocaleString()}
                              </span>
                            )}
                          </div>
                          {item.notes && (
                            <p className="text-xs text-muted-foreground" data-testid={`text-notes-${item.id}`}>
                              {item.notes}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 relative z-[1]">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => {
                              addToCalendar(
                                {
                                  projectId,
                                  title: item.title,
                                  description: item.notes || null,
                                  date: format(new Date(), "yyyy-MM-dd"),
                                  type: "event",
                                },
                                {
                                  onSuccess: () => toast({ title: "Added to Calendar", description: `"${item.title}" added to today's calendar.` }),
                                  onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
                                }
                              );
                            }}
                            data-testid={`button-calendar-checklist-${item.id}`}
                          >
                            <CalendarIcon className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => openEditDialog(item)}
                            data-testid={`button-edit-checklist-${item.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleDelete(item.id)}
                            data-testid={`button-delete-checklist-${item.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-16 text-muted-foreground text-sm" data-testid="text-empty-checklist">
          No checklist items yet. Add your first item above.
        </div>
      )}

      <Dialog open={!!editItem} onOpenChange={(open) => { if (!open) setEditItem(null); }}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl" data-testid="text-edit-dialog-title">Edit Item</DialogTitle>
            <DialogDescription>Update the checklist item details and color.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-sm font-medium mb-1 block">Title</label>
              <Input
                value={editForm.title}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                data-testid="input-edit-title"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">Group</label>
                <Select value={editForm.group} onValueChange={(v) => setEditForm({ ...editForm, group: v })}>
                  <SelectTrigger data-testid="select-edit-group">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {allGroups.map((g) => (
                      <SelectItem key={g} value={g}>{g}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Priority</label>
                <Select value={editForm.priority} onValueChange={(v) => setEditForm({ ...editForm, priority: v })}>
                  <SelectTrigger data-testid="select-edit-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Status</label>
              <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
                <SelectTrigger data-testid="select-edit-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todo">To Do</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="done">Done</SelectItem>
                  <SelectItem value="next_year">Next Year</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Notes</label>
              <Textarea
                value={editForm.notes}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                placeholder="Add notes..."
                className="resize-none"
                rows={2}
                data-testid="textarea-edit-notes"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Price Estimate ($)</label>
              <Input
                type="number"
                value={editForm.priceEstimate}
                onChange={(e) => setEditForm({ ...editForm, priceEstimate: e.target.value })}
                placeholder="0"
                data-testid="input-edit-price"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditItem(null)} data-testid="button-edit-cancel">Cancel</Button>
              <Button onClick={handleEditSave} disabled={!editForm.title.trim()} data-testid="button-edit-save">Save Changes</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BoardTab({ projectId }: { projectId: number }) {
  const { toast } = useToast();
  const { data: items, isLoading } = useBoardItems(projectId);
  const { mutate: createItem, isPending: isCreating } = useCreateBoardItem();
  const { mutate: deleteItem } = useDeleteBoardItem();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [boardForm, setBoardForm] = useState({ type: "note", title: "", content: "", imageUrl: "", linkUrl: "", color: "#ffffff" });
  const [brokenImages, setBrokenImages] = useState<Record<number, boolean>>({});

  const noteColors = [
    { value: "#fef9ef", label: "Warm Cream", dark: "#e8d9b0" },
    { value: "#e8ede5", label: "Sage Green", dark: "#b5c4ae" },
    { value: "#e8f0f8", label: "Soft Blue", dark: "#a8c4de" },
    { value: "#f0eaf8", label: "Lavender", dark: "#c4b0de" },
    { value: "#fceef0", label: "Blush Pink", dark: "#e8b0b8" },
    { value: "#ffffff", label: "White", dark: "#d4d4d4" },
  ];

  const getDarkerShade = (hex: string) => {
    const found = noteColors.find((c) => c.value === hex);
    return found ? found.dark : "#cccccc";
  };

  const getDomain = (url: string) => {
    try {
      return new URL(url).hostname.replace("www.", "");
    } catch {
      return url;
    }
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    createItem(
      {
        projectId,
        type: boardForm.type,
        title: boardForm.title || null,
        content: boardForm.content || null,
        imageUrl: boardForm.type === "image" ? boardForm.imageUrl || null : null,
        linkUrl: boardForm.type === "link" ? boardForm.linkUrl || null : null,
        color: boardForm.type === "note" ? boardForm.color : null,
      },
      {
        onSuccess: () => {
          toast({ title: "Success", description: "Item added to board." });
          setDialogOpen(false);
          setBoardForm({ type: "note", title: "", content: "", imageUrl: "", linkUrl: "", color: "#ffffff" });
        },
        onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
      }
    );
  };

  const handleDelete = (id: number) => {
    deleteItem(id, {
      onSuccess: () => toast({ title: "Success", description: "Item removed from board." }),
      onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
    });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="animate-spin text-muted-foreground" data-testid="loader-board" />
      </div>
    );
  }

  const renderNoteCard = (item: BoardItem) => {
    const bgColor = item.color || "#ffffff";
    const stripColor = getDarkerShade(bgColor);
    return (
      <div
        className="relative rounded-md overflow-visible hover-elevate transition-shadow bg-card dark:bg-card"
        data-testid={`board-item-${item.id}`}
      >
        <div
          className="absolute inset-0 rounded-md opacity-30 dark:opacity-15 pointer-events-none"
          style={{ backgroundColor: bgColor }}
        />
        <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-md" style={{ backgroundColor: stripColor }} />
        <div className="absolute top-2 right-2 z-10" style={{ visibility: "visible" }}>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => handleDelete(item.id)}
            data-testid={`button-delete-board-${item.id}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        <div className="relative p-4 pl-5">
          {item.title && (
            <h4 className="font-serif font-bold text-sm text-foreground" data-testid={`text-board-title-${item.id}`}>
              {item.title}
            </h4>
          )}
          {item.content && (
            <p className="text-xs mt-1.5 text-muted-foreground" data-testid={`text-board-content-${item.id}`}>
              {item.content}
            </p>
          )}
        </div>
      </div>
    );
  };

  const renderImageCard = (item: BoardItem) => {
    const isBroken = brokenImages[item.id];
    return (
      <div
        className="relative rounded-md overflow-visible hover-elevate transition-shadow"
        data-testid={`board-item-${item.id}`}
      >
        <div className="absolute top-2 right-2 z-10" style={{ visibility: "visible" }}>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => handleDelete(item.id)}
            data-testid={`button-delete-board-${item.id}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        {item.imageUrl && !isBroken ? (
          <div className="relative">
            <img
              src={item.imageUrl}
              alt={item.title || "Board image"}
              className="w-full object-cover rounded-md"
              style={{ maxHeight: "300px" }}
              onError={() => setBrokenImages((prev) => ({ ...prev, [item.id]: true }))}
              data-testid={`img-board-${item.id}`}
            />
            {item.title && (
              <div className="absolute bottom-0 left-0 right-0 p-3 rounded-b-md" style={{ background: "linear-gradient(transparent, rgba(0,0,0,0.7))" }}>
                <h4 className="font-serif font-bold text-sm text-white" data-testid={`text-board-title-${item.id}`}>
                  {item.title}
                </h4>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 rounded-md bg-muted">
            <ImageIcon className="h-10 w-10 text-muted-foreground opacity-40" />
            {item.title && (
              <p className="text-xs text-muted-foreground mt-2" data-testid={`text-board-title-${item.id}`}>{item.title}</p>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderLinkCard = (item: BoardItem) => {
    return (
      <a
        href={item.linkUrl || "#"}
        target="_blank"
        rel="noopener noreferrer"
        className="relative block rounded-md bg-card border border-border overflow-visible hover-elevate transition-shadow"
        data-testid={`board-item-${item.id}`}
      >
        <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-md" style={{ backgroundColor: "hsl(var(--accent))" }} />
        <div className="absolute top-2 right-2 z-10" style={{ visibility: "visible" }}>
          <Button
            size="icon"
            variant="ghost"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(item.id); }}
            data-testid={`button-delete-board-${item.id}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        <div className="p-4 pl-5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            <Link2 className="h-3.5 w-3.5" />
            <span data-testid={`text-board-domain-${item.id}`}>{item.linkUrl ? getDomain(item.linkUrl) : "Link"}</span>
          </div>
          {item.title && (
            <h4 className="font-serif font-bold text-sm text-foreground" data-testid={`text-board-title-${item.id}`}>
              {item.title}
            </h4>
          )}
          {item.content && (
            <p className="text-xs text-muted-foreground mt-1.5" data-testid={`text-board-content-${item.id}`}>
              {item.content}
            </p>
          )}
        </div>
      </a>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-board">
              <Plus className="mr-2 h-4 w-4" />
              Add to Board
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
              <DialogTitle className="font-serif text-xl" data-testid="text-board-dialog-title">Add to Board</DialogTitle>
              <DialogDescription>Pin a note, image, or link to your inspiration board.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAdd} className="space-y-4 pt-2" data-testid="form-add-board">
              <div>
                <label className="text-sm font-medium mb-2 block">Type</label>
                <div className="flex gap-2" data-testid="board-type-selector">
                  {[
                    { value: "note", label: "Note", icon: <StickyNote className="h-4 w-4" /> },
                    { value: "image", label: "Image", icon: <ImageIcon className="h-4 w-4" /> },
                    { value: "link", label: "Link", icon: <Link2 className="h-4 w-4" /> },
                  ].map((opt) => (
                    <Button
                      key={opt.value}
                      type="button"
                      variant={boardForm.type === opt.value ? "default" : "outline"}
                      onClick={() => setBoardForm({ ...boardForm, type: opt.value })}
                      data-testid={`button-board-type-${opt.value}`}
                    >
                      {opt.icon}
                      <span className="ml-1.5">{opt.label}</span>
                    </Button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Title</label>
                <Input
                  value={boardForm.title}
                  onChange={(e) => setBoardForm({ ...boardForm, title: e.target.value })}
                  placeholder="Item title"
                  data-testid="input-board-title"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Content / Description</label>
                <Textarea
                  value={boardForm.content}
                  onChange={(e) => setBoardForm({ ...boardForm, content: e.target.value })}
                  placeholder="Description or content..."
                  className="resize-none"
                  rows={3}
                  data-testid="input-board-content"
                />
              </div>
              {boardForm.type === "image" && (
                <div>
                  <label className="text-sm font-medium mb-1 block">Image URL</label>
                  <Input
                    value={boardForm.imageUrl}
                    onChange={(e) => setBoardForm({ ...boardForm, imageUrl: e.target.value })}
                    placeholder="https://example.com/image.jpg"
                    data-testid="input-board-image"
                  />
                </div>
              )}
              {boardForm.type === "link" && (
                <div>
                  <label className="text-sm font-medium mb-1 block">Link URL</label>
                  <Input
                    value={boardForm.linkUrl}
                    onChange={(e) => setBoardForm({ ...boardForm, linkUrl: e.target.value })}
                    placeholder="https://example.com"
                    data-testid="input-board-link"
                  />
                </div>
              )}
              {boardForm.type === "note" && (
                <div>
                  <label className="text-sm font-medium mb-2 block">Color</label>
                  <div className="flex gap-2 flex-wrap" data-testid="board-color-picker">
                    {noteColors.map((c) => (
                      <div
                        key={c.value}
                        className="h-8 w-8 rounded-full cursor-pointer transition-transform flex-shrink-0"
                        style={{
                          backgroundColor: c.value,
                          border: boardForm.color === c.value ? `2px solid ${c.dark}` : "2px solid transparent",
                          boxShadow: boardForm.color === c.value ? `0 0 0 2px ${c.dark}` : "none",
                        }}
                        title={c.label}
                        onClick={() => setBoardForm({ ...boardForm, color: c.value })}
                        data-testid={`color-swatch-${c.label.toLowerCase().replace(/\s/g, "-")}`}
                      />
                    ))}
                  </div>
                </div>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} data-testid="button-cancel-board">
                  Cancel
                </Button>
                <Button type="submit" disabled={isCreating} data-testid="button-submit-board">
                  {isCreating ? <Loader2 className="mr-2 animate-spin" /> : null}
                  Add Item
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {items && items.length > 0 ? (
        <div
          style={{ columnGap: "1rem" }}
          className="[column-count:1] sm:[column-count:2] lg:[column-count:3]"
          data-testid="board-masonry"
        >
          {items.map((item: BoardItem) => (
            <div key={item.id} className="mb-4" style={{ breakInside: "avoid" }}>
              {item.type === "image" ? renderImageCard(item) :
               item.type === "link" ? renderLinkCard(item) :
               renderNoteCard(item)}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-16 text-muted-foreground text-sm" data-testid="text-empty-board">
          Pin images, notes, and inspiration to your board.
        </div>
      )}
    </div>
  );
}

function PhotosTab({ projectId }: { projectId: number }) {
  const { data: photos, isLoading } = usePhotos(projectId);
  const { mutate: createPhoto } = useCreatePhoto();
  const { mutate: deletePhoto } = useDeletePhoto();
  const { mutateAsync: uploadImage, isPending: isUploading } = useUploadImage();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [lightboxPhoto, setLightboxPhoto] = useState<{ url: string; caption?: string | null } | null>(null);
  const [caption, setCaption] = useState("");

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (const file of Array.from(files)) {
      try {
        const { url } = await uploadImage(file);
        createPhoto(
          { projectId, url, caption: caption || file.name },
          {
            onSuccess: () => {
              toast({ title: "Uploaded", description: `${file.name} added to gallery.` });
            },
            onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
          }
        );
      } catch (err: any) {
        toast({ title: "Upload failed", description: err.message, variant: "destructive" });
      }
    }

    setCaption("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDelete = (id: number) => {
    deletePhoto(
      { id, projectId },
      {
        onSuccess: () => toast({ title: "Deleted", description: "Photo removed." }),
        onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
      }
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" data-testid="loader-photos" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h3 className="font-serif text-lg font-semibold" data-testid="text-photos-heading">Progress Photos</h3>
        <div className="flex items-center gap-2 flex-wrap">
          <Input
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Caption (optional)"
            className="w-48"
            data-testid="input-photo-caption"
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            data-testid="button-upload-photo"
          >
            {isUploading ? <Loader2 className="mr-2 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Upload Photos
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            className="hidden"
            onChange={handleFileSelect}
            multiple
            data-testid="input-photo-file"
          />
        </div>
      </div>

      {!photos || photos.length === 0 ? (
        <div className="text-center py-16">
          <ImageIcon className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground text-sm" data-testid="text-photos-empty">
            No photos yet. Upload progress photos to share with your team.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4" data-testid="photo-grid">
          {photos.map((photo) => (
            <div
              key={photo.id}
              className="group relative aspect-square rounded-md overflow-visible"
              data-testid={`photo-item-${photo.id}`}
            >
              <img
                src={photo.url}
                alt={photo.caption || "Project photo"}
                className="h-full w-full object-cover rounded-md cursor-pointer transition-transform"
                onClick={() => setLightboxPhoto({ url: photo.url, caption: photo.caption })}
                data-testid={`img-photo-${photo.id}`}
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors rounded-md pointer-events-none" />
              <div className="absolute top-2 right-2 flex gap-1 invisible group-hover:visible">
                <Button
                  size="icon"
                  variant="secondary"
                  className="h-7 w-7"
                  onClick={() => setLightboxPhoto({ url: photo.url, caption: photo.caption })}
                  data-testid={`button-zoom-photo-${photo.id}`}
                >
                  <ZoomIn className="h-3 w-3" />
                </Button>
                <Button
                  size="icon"
                  variant="secondary"
                  className="h-7 w-7"
                  onClick={() => handleDelete(photo.id)}
                  data-testid={`button-delete-photo-${photo.id}`}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
              {photo.caption && (
                <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/60 to-transparent rounded-b-md">
                  <p className="text-white text-xs truncate" data-testid={`text-photo-caption-${photo.id}`}>
                    {photo.caption}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {lightboxPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightboxPhoto(null)}
          data-testid="photo-lightbox"
        >
          <Button
            size="icon"
            variant="ghost"
            className="absolute top-4 right-4 text-white"
            onClick={() => setLightboxPhoto(null)}
            data-testid="button-close-lightbox"
          >
            <X className="h-6 w-6" />
          </Button>
          <div className="max-w-4xl max-h-[85vh] flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
            <img
              src={lightboxPhoto.url}
              alt={lightboxPhoto.caption || "Photo"}
              className="max-h-[80vh] max-w-full object-contain rounded-md"
              data-testid="img-lightbox"
            />
            {lightboxPhoto.caption && (
              <p className="text-white text-sm mt-3 text-center" data-testid="text-lightbox-caption">
                {lightboxPhoto.caption}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ChatTab({ projectId }: { projectId: number }) {
  const { user } = useAuth();
  const { data: messages, isLoading } = useMessages(projectId);
  const { mutate: sendMessage, isPending } = useSendMessage();
  const { mutateAsync: uploadImage, isPending: isUploadingImage } = useUploadImage();
  const { toast } = useToast();
  const [content, setContent] = useState("");
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const previewUrl = URL.createObjectURL(file);
    setImagePreview(previewUrl);

    try {
      const { url } = await uploadImage(file);
      setAttachedImage(url);
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
      setImagePreview(null);
      setAttachedImage(null);
    }
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  const removeAttachment = () => {
    setAttachedImage(null);
    setImagePreview(null);
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if ((!content.trim() && !attachedImage) || !user) return;

    sendMessage(
      {
        projectId,
        content: content.trim() || (attachedImage ? "Shared a photo" : ""),
        senderId: user.id || "unknown",
        imageUrl: attachedImage,
      },
      {
        onSuccess: () => {
          setContent("");
          setAttachedImage(null);
          setImagePreview(null);
        },
      }
    );
  };

  return (
    <Card className="h-[600px] flex flex-col" data-testid="chat-container">
      <CardHeader className="border-b">
        <CardTitle className="font-serif text-lg" data-testid="text-chat-heading">
          Project Communication
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 p-0 flex flex-col overflow-hidden">
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4" ref={scrollRef}>
            {isLoading ? (
              <div className="flex justify-center p-4">
                <Loader2 className="animate-spin text-muted-foreground" />
              </div>
            ) : messages?.length === 0 ? (
              <p className="text-center text-muted-foreground py-10 text-sm" data-testid="text-no-messages">
                No messages yet. Start the conversation!
              </p>
            ) : (
              messages?.map((msg: any) => {
                const isMe = msg.senderId === user?.id;
                const sender = msg.sender;
                const senderFirst = sender?.firstName || sender?.email?.split("@")[0] || "User";
                const senderInitials = sender?.firstName
                  ? (sender.firstName[0] + (sender.lastName?.[0] || "")).toUpperCase()
                  : "?";
                return (
                  <div
                    key={msg.id}
                    className={`flex ${isMe ? "justify-end" : "justify-start"}`}
                    data-testid={`message-${msg.id}`}
                  >
                    {!isMe && (
                      <Avatar className="h-7 w-7 mr-2 mt-1 flex-shrink-0">
                        <AvatarFallback className="text-[10px]" data-testid={`avatar-sender-${msg.id}`}>{senderInitials}</AvatarFallback>
                      </Avatar>
                    )}
                    <div
                      className={`max-w-[75%] rounded-xl px-4 py-2.5 text-sm ${
                        isMe
                          ? "bg-foreground text-background"
                          : "bg-muted text-foreground"
                      }`}
                    >
                      <span
                        className="text-[10px] font-semibold block mb-0.5 opacity-70"
                        data-testid={`text-sender-name-${msg.id}`}
                      >
                        {isMe ? "You" : senderFirst}
                      </span>
                      {msg.imageUrl && (
                        <img
                          src={msg.imageUrl}
                          alt="Attached"
                          className="rounded-md max-w-full max-h-48 object-cover mb-1.5 cursor-pointer"
                          onClick={() => window.open(msg.imageUrl, "_blank")}
                          data-testid={`img-message-${msg.id}`}
                        />
                      )}
                      {msg.content && msg.content !== "Shared a photo" && (
                        <p>{msg.content}</p>
                      )}
                      {msg.content === "Shared a photo" && !msg.imageUrl && (
                        <p>{msg.content}</p>
                      )}
                      <span className="text-[10px] opacity-60 block mt-1 text-right">
                        {msg.createdAt && format(new Date(msg.createdAt), "h:mm a")}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>

        <div className="border-t bg-background">
          {imagePreview && (
            <div className="px-4 pt-3 flex items-center gap-2" data-testid="chat-image-preview">
              <div className="relative">
                <img
                  src={imagePreview}
                  alt="Attachment preview"
                  className="h-16 w-16 object-cover rounded-md border"
                  data-testid="img-chat-preview"
                />
                {isUploadingImage && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-md">
                    <Loader2 className="h-4 w-4 animate-spin text-white" />
                  </div>
                )}
                <Button
                  size="icon"
                  variant="secondary"
                  className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full"
                  onClick={removeAttachment}
                  data-testid="button-remove-attachment"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )}
          <div className="p-4">
            <form onSubmit={handleSend} className="flex gap-2" data-testid="form-chat">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => imageInputRef.current?.click()}
                disabled={isUploadingImage}
                data-testid="button-attach-image"
              >
                <Paperclip className="h-4 w-4" />
              </Button>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="hidden"
                onChange={handleImageSelect}
                data-testid="input-chat-image"
              />
              <Input
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Type a message..."
                className="flex-1"
                data-testid="input-chat-message"
              />
              <Button
                type="submit"
                disabled={isPending || isUploadingImage || (!content.trim() && !attachedImage)}
                data-testid="button-send-message"
              >
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const eventTypeColors: Record<string, string> = {
  event: "#4f46e5",
  milestone: "#059669",
  deadline: "#dc2626",
  meeting: "#d97706",
  inspection: "#7c3aed",
};

function CalendarTab({ projectId }: { projectId: number }) {
  const { toast } = useToast();
  const { data: events, isLoading } = useCalendarEvents(projectId);
  const { mutate: createEvent, isPending: isCreating } = useCreateCalendarEvent();
  const { mutate: updateEvent } = useUpdateCalendarEvent();
  const { mutate: deleteEvent } = useDeleteCalendarEvent();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [eventForm, setEventForm] = useState({ title: "", description: "", type: "event" });
  const [draggedEventId, setDraggedEventId] = useState<number | null>(null);
  const [moveEvent, setMoveEvent] = useState<{ id: number; title: string } | null>(null);
  const [moveDate, setMoveDate] = useState("");

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDayOfWeek = getDay(monthStart);

  const getEventsForDate = (date: Date) => {
    if (!events) return [];
    return (events as CalendarEvent[]).filter((e) => {
      const eventDate = parseISO(e.date);
      return isSameDay(eventDate, date);
    });
  };

  const selectedDateEvents = selectedDate ? getEventsForDate(selectedDate) : [];

  const handleAddEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventForm.title.trim() || !selectedDate) return;
    createEvent(
      {
        projectId,
        title: eventForm.title.trim(),
        description: eventForm.description.trim() || null,
        date: format(selectedDate, "yyyy-MM-dd"),
        type: eventForm.type,
      },
      {
        onSuccess: () => {
          toast({ title: "Added", description: "Event added to calendar." });
          setAddDialogOpen(false);
          setEventForm({ title: "", description: "", type: "event" });
        },
        onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
      }
    );
  };

  const handleDeleteEvent = (id: number) => {
    deleteEvent(id, {
      onSuccess: () => toast({ title: "Removed", description: "Event deleted." }),
      onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
    });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="animate-spin text-muted-foreground" data-testid="loader-calendar" />
      </div>
    );
  }

  const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            data-testid="button-prev-month"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h3 className="font-serif text-xl font-bold text-foreground min-w-[180px] text-center" data-testid="text-current-month">
            {format(currentMonth, "MMMM yyyy")}
          </h3>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            data-testid="button-next-month"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Button
          onClick={() => {
            setSelectedDate(selectedDate || new Date());
            setAddDialogOpen(true);
          }}
          data-testid="button-add-event"
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Event
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-px bg-border rounded-md overflow-hidden" data-testid="calendar-grid">
        {weekDays.map((day) => (
          <div
            key={day}
            className="bg-muted text-center py-2 text-xs font-medium text-muted-foreground"
          >
            {day}
          </div>
        ))}
        {Array.from({ length: startDayOfWeek }).map((_, i) => (
          <div key={`empty-${i}`} className="bg-card min-h-[80px]" />
        ))}
        {daysInMonth.map((day) => {
          const dayEvents = getEventsForDate(day);
          const isSelected = selectedDate && isSameDay(day, selectedDate);
          const isToday = isSameDay(day, new Date());
          const dateStr = format(day, "yyyy-MM-dd");
          return (
            <div
              key={day.toISOString()}
              className={`bg-card min-h-[80px] p-1.5 cursor-pointer transition-colors hover-elevate ${isSelected ? "ring-2 ring-primary ring-inset" : ""} ${draggedEventId ? "ring-1 ring-inset ring-transparent hover:ring-primary/40" : ""}`}
              onClick={() => setSelectedDate(day)}
              onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("ring-primary/40"); }}
              onDragLeave={(e) => { e.currentTarget.classList.remove("ring-primary/40"); }}
              onDrop={(e) => {
                e.preventDefault();
                e.currentTarget.classList.remove("ring-primary/40");
                const evId = parseInt(e.dataTransfer.getData("text/plain"), 10);
                if (!evId) return;
                updateEvent(
                  { id: evId, date: dateStr },
                  {
                    onSuccess: () => {
                      toast({ title: "Moved", description: `Event moved to ${format(day, "MMM d")}.` });
                      setSelectedDate(day);
                    },
                    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
                  }
                );
                setDraggedEventId(null);
              }}
              data-testid={`calendar-day-${dateStr}`}
            >
              <span
                className={`text-xs font-medium inline-flex items-center justify-center w-6 h-6 rounded-full ${isToday ? "bg-primary text-primary-foreground" : "text-foreground"}`}
              >
                {format(day, "d")}
              </span>
              <div className="mt-0.5 space-y-0.5">
                {dayEvents.slice(0, 3).map((ev) => (
                  <div
                    key={ev.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", String(ev.id));
                      e.dataTransfer.effectAllowed = "move";
                      setDraggedEventId(ev.id);
                    }}
                    onDragEnd={() => setDraggedEventId(null)}
                    className="text-[10px] leading-tight truncate rounded px-1 py-0.5 text-white cursor-grab active:cursor-grabbing"
                    style={{ backgroundColor: eventTypeColors[ev.type || "event"] || eventTypeColors.event }}
                    data-testid={`calendar-event-dot-${ev.id}`}
                  >
                    {ev.title}
                  </div>
                ))}
                {dayEvents.length > 3 && (
                  <span className="text-[10px] text-muted-foreground">+{dayEvents.length - 3} more</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {selectedDate && (
        <Card data-testid="selected-date-panel">
          <CardHeader className="pb-3">
            <CardTitle className="font-serif text-lg flex items-center gap-2" data-testid="text-selected-date">
              <CalendarIcon className="h-5 w-5 text-muted-foreground" />
              {format(selectedDate, "EEEE, MMMM d, yyyy")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {selectedDateEvents.length > 0 ? (
              selectedDateEvents.map((ev) => (
                <div
                  key={ev.id}
                  className="flex items-start justify-between gap-3 p-3 rounded-md bg-muted"
                  data-testid={`calendar-event-${ev.id}`}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                      style={{ backgroundColor: eventTypeColors[ev.type || "event"] || eventTypeColors.event }}
                    />
                    <div className="min-w-0">
                      <p className="font-medium text-sm text-foreground" data-testid={`text-event-title-${ev.id}`}>
                        {ev.title}
                      </p>
                      {ev.description && (
                        <p className="text-xs text-muted-foreground mt-0.5" data-testid={`text-event-desc-${ev.id}`}>
                          {ev.description}
                        </p>
                      )}
                      <Badge variant="outline" className="mt-1 text-[10px] no-default-hover-elevate" data-testid={`badge-event-type-${ev.id}`}>
                        {ev.type || "event"}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        setMoveEvent({ id: ev.id, title: ev.title });
                        setMoveDate("");
                      }}
                      data-testid={`button-move-event-${ev.id}`}
                    >
                      <CalendarDays className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleDeleteEvent(ev.id)}
                      data-testid={`button-delete-event-${ev.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-events">
                No events on this date.
              </p>
            )}
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setAddDialogOpen(true)}
              data-testid="button-add-event-for-date"
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Event for {format(selectedDate, "MMM d")}
            </Button>
          </CardContent>
        </Card>
      )}

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl" data-testid="text-add-event-title">
              Add Event
            </DialogTitle>
            <DialogDescription>
              {selectedDate ? `Add an event for ${format(selectedDate, "MMMM d, yyyy")}` : "Select a date and add an event."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddEvent} className="space-y-4 pt-2" data-testid="form-add-event">
            <div>
              <label className="text-sm font-medium mb-1 block">Title</label>
              <Input
                value={eventForm.title}
                onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })}
                placeholder="Event title..."
                data-testid="input-event-title"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Description</label>
              <Textarea
                value={eventForm.description}
                onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })}
                placeholder="Optional description..."
                className="resize-none"
                rows={2}
                data-testid="textarea-event-description"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Type</label>
              <Select value={eventForm.type} onValueChange={(v) => setEventForm({ ...eventForm, type: v })}>
                <SelectTrigger data-testid="select-event-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="event">Event</SelectItem>
                  <SelectItem value="milestone">Milestone</SelectItem>
                  <SelectItem value="deadline">Deadline</SelectItem>
                  <SelectItem value="meeting">Meeting</SelectItem>
                  <SelectItem value="inspection">Inspection</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Date</label>
              <Input
                type="date"
                value={selectedDate ? format(selectedDate, "yyyy-MM-dd") : ""}
                onChange={(e) => setSelectedDate(e.target.value ? parseISO(e.target.value) : null)}
                data-testid="input-event-date"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setAddDialogOpen(false)} data-testid="button-cancel-event">
                Cancel
              </Button>
              <Button type="submit" disabled={isCreating || !eventForm.title.trim() || !selectedDate} data-testid="button-save-event">
                {isCreating ? <Loader2 className="mr-2 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                Add Event
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={moveEvent !== null} onOpenChange={(open) => { if (!open) setMoveEvent(null); }}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl" data-testid="text-move-event-title">
              Move Event
            </DialogTitle>
            <DialogDescription>
              Pick a new date for "{moveEvent?.title}".
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-sm font-medium mb-1 block">New Date</label>
              <Input
                type="date"
                value={moveDate}
                onChange={(e) => setMoveDate(e.target.value)}
                data-testid="input-move-date"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setMoveEvent(null)} data-testid="button-cancel-move">
                Cancel
              </Button>
              <Button
                disabled={!moveDate}
                onClick={() => {
                  if (!moveEvent || !moveDate) return;
                  const newDate = parseISO(moveDate);
                  updateEvent(
                    { id: moveEvent.id, date: moveDate },
                    {
                      onSuccess: () => {
                        toast({ title: "Moved", description: `"${moveEvent.title}" moved to ${format(newDate, "MMMM d, yyyy")}.` });
                        setCurrentMonth(newDate);
                        setSelectedDate(newDate);
                        setMoveEvent(null);
                      },
                      onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
                    }
                  );
                }}
                data-testid="button-confirm-move"
              >
                <CalendarDays className="mr-2 h-4 w-4" />
                Move Event
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const docTypeLabels: Record<string, string> = {
  contract: "Contract",
  invoice: "Invoice",
  plan: "Plan",
  change_order: "Change Order",
  permit: "Permit",
  other: "Other",
};

function DocumentsTab({ projectId }: { projectId: number }) {
  const { data: documents, isLoading } = useDocuments(projectId);
  const { mutate: uploadDoc, isPending: isUploading } = useUploadDocument();
  const { mutate: deleteDoc } = useDeleteDocument();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [docType, setDocType] = useState("other");

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      uploadDoc(
        { projectId, file, title: file.name, type: docType },
        {
          onSuccess: () => {
            toast({ title: "Uploaded", description: `${file.name} uploaded successfully.` });
          },
          onError: (err) => {
            toast({ title: "Error", description: err.message, variant: "destructive" });
          },
        }
      );
    });

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDownload = (url: string, title: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = title;
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h3 className="font-serif text-lg font-semibold" data-testid="text-docs-heading">Documents</h3>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={docType} onValueChange={setDocType}>
            <SelectTrigger className="w-36" data-testid="select-doc-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="contract">Contract</SelectItem>
              <SelectItem value="invoice">Invoice</SelectItem>
              <SelectItem value="plan">Plan</SelectItem>
              <SelectItem value="change_order">Change Order</SelectItem>
              <SelectItem value="permit">Permit</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            data-testid="button-upload-doc"
          >
            {isUploading ? <Loader2 className="mr-2 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Upload
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.jpg,.jpeg,.png,.gif,.webp"
            className="hidden"
            onChange={handleFileSelect}
            multiple
            data-testid="input-doc-file"
          />
        </div>
      </div>

      {!documents || documents.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm" data-testid="text-docs-empty">
          No documents yet. Upload files to share with your team.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {documents.map((doc) => (
            <Card key={doc.id} className="flex items-center justify-between gap-3 p-4" data-testid={`doc-item-${doc.id}`}>
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate" data-testid={`text-doc-title-${doc.id}`}>{doc.title}</p>
                  <Badge variant="secondary" className="text-xs mt-1" data-testid={`badge-doc-type-${doc.id}`}>
                    {docTypeLabels[doc.type] || doc.type}
                  </Badge>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {doc.url && doc.url !== "#" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDownload(doc.url, doc.title)}
                    data-testid={`button-download-${doc.id}`}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    deleteDoc(doc.id, {
                      onSuccess: () => toast({ title: "Deleted", description: "Document removed." }),
                      onError: () => toast({ title: "Error", description: "Failed to delete document.", variant: "destructive" }),
                    });
                  }}
                  data-testid={`button-delete-doc-${doc.id}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
