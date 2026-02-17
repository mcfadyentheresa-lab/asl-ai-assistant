import { useParams, Link } from "wouter";
import {
  useProject, useMilestones, useTasks, useMessages, useSendMessage,
  useChecklistItems, useCreateChecklistItem, useUpdateChecklistItem, useDeleteChecklistItem,
  useBoardItems, useCreateBoardItem, useDeleteBoardItem,
} from "@/hooks/use-projects";
import { Navbar } from "@/components/layout/Navbar";
import { Loader2, Clock, FileText, ImageIcon, MessageSquare, ArrowLeft, Send, Trash2, CheckSquare, LayoutGrid, ExternalLink, Plus } from "lucide-react";
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
  const [newPriority, setNewPriority] = useState("normal");

  const isCrew = user?.email?.includes("crew") || user?.email?.includes("admin");

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    createItem(
      { projectId, title: newTitle.trim(), priority: newPriority },
      {
        onSuccess: () => {
          toast({ title: "Success", description: "Checklist item added." });
          setNewTitle("");
          setNewPriority("normal");
        },
        onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
      }
    );
  };

  const handleToggle = (item: ChecklistItem) => {
    updateItem(
      { id: item.id, completed: !item.completed },
      {
        onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
      }
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

  const priorityVariant = (p: string | null) => {
    if (p === "high") return "destructive" as const;
    if (p === "low") return "outline" as const;
    return "secondary" as const;
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
      <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-3" data-testid="form-add-checklist">
        <Input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Add a checklist item..."
          className="flex-1"
          data-testid="input-checklist-title"
        />
        <Select value={newPriority} onValueChange={setNewPriority}>
          <SelectTrigger className="w-full sm:w-[140px]" data-testid="select-checklist-priority">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="high">High</SelectItem>
          </SelectContent>
        </Select>
        <Button type="submit" disabled={isCreating || !newTitle.trim()} data-testid="button-add-checklist">
          {isCreating ? <Loader2 className="mr-2 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
          Add
        </Button>
      </form>

      {items && items.length > 0 ? (
        <div className="space-y-3">
          {items.map((item: ChecklistItem) => (
            <Card key={item.id} data-testid={`checklist-item-${item.id}`}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <Checkbox
                    checked={!!item.completed}
                    onCheckedChange={() => handleToggle(item)}
                    className="mt-0.5"
                    data-testid={`checkbox-checklist-${item.id}`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`font-medium text-sm ${item.completed ? "line-through text-muted-foreground" : "text-foreground"}`}
                        data-testid={`text-checklist-title-${item.id}`}
                      >
                        {item.title}
                      </span>
                      <Badge variant={priorityVariant(item.priority)} data-testid={`badge-priority-${item.id}`}>
                        {item.priority || "normal"}
                      </Badge>
                      {item.priceEstimate != null && (
                        <span className="text-xs text-muted-foreground" data-testid={`text-price-${item.id}`}>
                          ${item.priceEstimate.toLocaleString()}
                        </span>
                      )}
                    </div>
                    {item.notes && !isCrew && (
                      <p className="text-xs text-muted-foreground mt-1" data-testid={`text-notes-${item.id}`}>
                        {item.notes}
                      </p>
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

                {isCrew && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-7">
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
              </CardContent>
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
  const [boardForm, setBoardForm] = useState({ type: "note", title: "", content: "", imageUrl: "", linkUrl: "" });

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    createItem(
      {
        projectId,
        type: boardForm.type,
        title: boardForm.title || null,
        content: boardForm.content || null,
        imageUrl: boardForm.imageUrl || null,
        linkUrl: boardForm.linkUrl || null,
      },
      {
        onSuccess: () => {
          toast({ title: "Success", description: "Item added to board." });
          setDialogOpen(false);
          setBoardForm({ type: "note", title: "", content: "", imageUrl: "", linkUrl: "" });
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
            </DialogHeader>
            <form onSubmit={handleAdd} className="space-y-4 pt-2" data-testid="form-add-board">
              <div>
                <label className="text-sm font-medium mb-1 block">Type</label>
                <Select value={boardForm.type} onValueChange={(v) => setBoardForm({ ...boardForm, type: v })}>
                  <SelectTrigger data-testid="select-board-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="note">Note</SelectItem>
                    <SelectItem value="image">Image</SelectItem>
                    <SelectItem value="link">Link</SelectItem>
                  </SelectContent>
                </Select>
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
              <div>
                <label className="text-sm font-medium mb-1 block">Image URL</label>
                <Input
                  value={boardForm.imageUrl}
                  onChange={(e) => setBoardForm({ ...boardForm, imageUrl: e.target.value })}
                  placeholder="https://example.com/image.jpg"
                  data-testid="input-board-image"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Link URL</label>
                <Input
                  value={boardForm.linkUrl}
                  onChange={(e) => setBoardForm({ ...boardForm, linkUrl: e.target.value })}
                  placeholder="https://example.com"
                  data-testid="input-board-link"
                />
              </div>
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" style={{ gridAutoRows: "auto" }}>
          {items.map((item: BoardItem) => (
            <Card key={item.id} className="overflow-visible" data-testid={`board-item-${item.id}`}>
              {item.imageUrl && (
                <div className="overflow-hidden rounded-t-xl">
                  <img
                    src={item.imageUrl}
                    alt={item.title || "Board image"}
                    className="w-full h-48 object-cover"
                    data-testid={`img-board-${item.id}`}
                  />
                </div>
              )}
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    {item.title && (
                      <h4 className="font-serif font-semibold text-sm text-foreground" data-testid={`text-board-title-${item.id}`}>
                        {item.title}
                      </h4>
                    )}
                    {item.content && (
                      <p className="text-xs text-muted-foreground mt-1" data-testid={`text-board-content-${item.id}`}>
                        {item.content}
                      </p>
                    )}
                    {item.linkUrl && (
                      <a
                        href={item.linkUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary mt-2"
                        data-testid={`link-board-${item.id}`}
                      >
                        <ExternalLink className="h-3 w-3" />
                        View Link
                      </a>
                    )}
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleDelete(item.id)}
                    data-testid={`button-delete-board-${item.id}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-16 text-muted-foreground text-sm" data-testid="text-empty-board">
          Your moodboard is empty. Pin images, notes, and inspiration to share.
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
