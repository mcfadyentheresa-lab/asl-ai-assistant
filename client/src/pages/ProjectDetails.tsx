import { useParams, Link } from "wouter";
import {
  useProject, useMilestones, useTasks, useMessages, useSendMessage,
  useChecklistItems, useCreateChecklistItem, useUpdateChecklistItem, useDeleteChecklistItem,
  useBoardItems, useCreateBoardItem, useDeleteBoardItem,
} from "@/hooks/use-projects";
import { Navbar } from "@/components/layout/Navbar";
import { Loader2, Clock, FileText, ImageIcon, MessageSquare, ArrowLeft, Send, Trash2, CheckSquare, LayoutGrid, ExternalLink, Plus, ChevronDown, ChevronRight, Link2, StickyNote } from "lucide-react";
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
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import type { ChecklistItem, BoardItem } from "@shared/schema";

export default function ProjectDetails() {
  const { id } = useParams();
  const projectId = Number(id);
  const { data: project, isLoading: loadingProject } = useProject(projectId);
  const { data: milestones } = useMilestones(projectId);
  const { data: tasks } = useTasks(projectId);

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
    <div className="min-h-screen bg-background pb-20">
      <Navbar />

      <div className="relative h-56 md:h-72 w-full overflow-hidden" data-testid="project-hero">
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

      <main className="container px-6 md:px-10 mt-8">
        <Tabs defaultValue="overview" className="space-y-8">
          <TabsList data-testid="tabs-list">
            <TabsTrigger value="overview" data-testid="tab-overview">
              <Clock className="mr-2 h-4 w-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="checklist" data-testid="tab-checklist">
              <CheckSquare className="mr-2 h-4 w-4" />
              Checklist
            </TabsTrigger>
            <TabsTrigger value="board" data-testid="tab-board">
              <LayoutGrid className="mr-2 h-4 w-4" />
              Board
            </TabsTrigger>
            <TabsTrigger value="photos" data-testid="tab-photos">
              <ImageIcon className="mr-2 h-4 w-4" />
              Photos
            </TabsTrigger>
            <TabsTrigger value="docs" data-testid="tab-docs">
              <FileText className="mr-2 h-4 w-4" />
              Documents
            </TabsTrigger>
            <TabsTrigger value="chat" data-testid="tab-chat">
              <MessageSquare className="mr-2 h-4 w-4" />
              Messages
            </TabsTrigger>
          </TabsList>

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

          <TabsContent value="board">
            <BoardTab projectId={projectId} />
          </TabsContent>

          <TabsContent value="chat">
            <ChatTab projectId={projectId} />
          </TabsContent>

          <TabsContent value="photos">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="aspect-square bg-muted rounded-xl flex items-center justify-center text-muted-foreground"
                  data-testid={`photo-placeholder-${i}`}
                >
                  <ImageIcon className="h-8 w-8 opacity-40" />
                </div>
              ))}
              <div className="col-span-full text-center py-10 text-muted-foreground text-sm" data-testid="text-photos-soon">
                Photos feature coming soon.
              </div>
            </div>
          </TabsContent>

          <TabsContent value="docs">
            <div className="flex flex-col gap-2">
              <Card className="flex items-center justify-between p-4" data-testid="doc-contract">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <span className="font-medium text-sm">Contract.pdf</span>
                </div>
                <Button variant="ghost" size="sm" data-testid="button-download-contract">
                  Download
                </Button>
              </Card>
              <div className="text-center py-10 text-muted-foreground text-sm" data-testid="text-docs-placeholder">
                More documents will appear here as the project progresses.
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function ChecklistTab({ projectId }: { projectId: number }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: items, isLoading } = useChecklistItems(projectId);
  const { mutate: createItem, isPending: isCreating } = useCreateChecklistItem();
  const { mutate: updateItem } = useUpdateChecklistItem();
  const { mutate: deleteItem } = useDeleteChecklistItem();

  const [newTitle, setNewTitle] = useState("");
  const [newGroup, setNewGroup] = useState("General");
  const [customGroup, setCustomGroup] = useState("");
  const [newPriority, setNewPriority] = useState("normal");
  const [newStatus, setNewStatus] = useState("todo");
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

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
                    return (
                      <div
                        key={item.id}
                        className={`flex items-start gap-3 px-4 py-3 border-b last:border-b-0 transition-opacity ${isDone ? "opacity-60" : ""} ${isNextYear ? "opacity-50" : ""}`}
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
                              className={`font-medium text-sm ${isDone ? "line-through text-muted-foreground" : "text-foreground"}`}
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
                          {item.notes && !isCrew && (
                            <p className="text-xs text-muted-foreground" data-testid={`text-notes-${item.id}`}>
                              {item.notes}
                            </p>
                          )}
                          {isCrew && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                              <div>
                                <label className="text-xs text-muted-foreground mb-1 block">Notes</label>
                                <Textarea
                                  defaultValue={item.notes || ""}
                                  onBlur={(e) => handleNotesChange(item, e.target.value)}
                                  placeholder="Add notes..."
                                  className="resize-none text-sm"
                                  rows={2}
                                  data-testid={`textarea-notes-${item.id}`}
                                />
                              </div>
                              <div>
                                <label className="text-xs text-muted-foreground mb-1 block">Price Estimate ($)</label>
                                <Input
                                  type="number"
                                  defaultValue={item.priceEstimate ?? ""}
                                  onBlur={(e) => handlePriceChange(item, e.target.value)}
                                  placeholder="0"
                                  data-testid={`input-price-${item.id}`}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleDelete(item.id)}
                          data-testid={`button-delete-checklist-${item.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
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

function ChatTab({ projectId }: { projectId: number }) {
  const { user } = useAuth();
  const { data: messages, isLoading } = useMessages(projectId);
  const { mutate: sendMessage, isPending } = useSendMessage();
  const [content, setContent] = useState("");

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || !user) return;

    sendMessage(
      { projectId, content, senderId: user.id || "unknown" },
      { onSuccess: () => setContent("") }
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
          <div className="space-y-4">
            {isLoading ? (
              <div className="flex justify-center p-4">
                <Loader2 className="animate-spin text-muted-foreground" />
              </div>
            ) : messages?.length === 0 ? (
              <p className="text-center text-muted-foreground py-10 text-sm" data-testid="text-no-messages">
                No messages yet. Start the conversation!
              </p>
            ) : (
              messages?.map((msg) => {
                const isMe = msg.senderId === user?.id;
                return (
                  <div
                    key={msg.id}
                    className={`flex ${isMe ? "justify-end" : "justify-start"}`}
                    data-testid={`message-${msg.id}`}
                  >
                    {!isMe && (
                      <Avatar className="h-7 w-7 mr-2 mt-1 flex-shrink-0">
                        <AvatarFallback className="text-[10px]">AS</AvatarFallback>
                      </Avatar>
                    )}
                    <div
                      className={`max-w-[75%] rounded-xl px-4 py-2.5 text-sm ${
                        isMe
                          ? "bg-foreground text-background"
                          : "bg-muted text-foreground"
                      }`}
                    >
                      <p>{msg.content}</p>
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
        <div className="p-4 border-t bg-background">
          <form onSubmit={handleSend} className="flex gap-2" data-testid="form-chat">
            <Input
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Type a message..."
              className="flex-1"
              data-testid="input-chat-message"
            />
            <Button type="submit" disabled={isPending || !content.trim()} data-testid="button-send-message">
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}
