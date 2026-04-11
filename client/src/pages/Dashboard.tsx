import { useAuth } from "@/hooks/use-auth";
import { useProjects, useDeleteProject, useArchiveProject, useUsers } from "@/hooks/use-projects";
import { Navbar } from "@/components/layout/Navbar";
import { ProjectCard } from "@/components/project/ProjectCard";
import { Button } from "@/components/ui/button";
import { Plus, Loader2, Eye, EyeOff, Upload, X, UserPlus, ArrowRight, FolderOpen, Briefcase, Clock, CalendarDays, CheckCircle2, Circle, PlayCircle, Calendar, MoreHorizontal } from "lucide-react";
import { Label } from "@/components/ui/label";
import { apiRequest, queryClient as qc } from "@/lib/queryClient";
import { motion } from "framer-motion";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { Task, CalendarEvent } from "@shared/schema";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useCreateProject } from "@/hooks/use-projects";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertProjectSchema, type InsertProject } from "@shared/schema";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { useOnlineUsers } from "@/hooks/use-presence";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Link } from "wouter";
import { useViewMode } from "@/hooks/use-view-mode";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const statusLabel: Record<string, string> = {
  planning: "Planning",
  in_progress: "In Progress",
  completed: "Completed",
  archived: "Archived",
};

export default function Dashboard() {
  const { user } = useAuth();
  const { data: projects, isLoading } = useProjects();
  const { data: allUsers } = useUsers();
  const { mutate: deleteProject } = useDeleteProject();
  const { mutate: archiveProject } = useArchiveProject();
  const { toast } = useToast();
  const [showArchived, setShowArchived] = useState(false);
  const [openCreateProject, setOpenCreateProject] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const { viewMode, setViewMode } = useViewMode();
  const { data: onlineUsers } = useOnlineUsers();

  const userMap = new Map(allUsers?.map((u) => [u.id, `${u.firstName || ""} ${u.lastName || ""}`.trim()]) || []);

  const filteredProjects = projects?.filter((p) =>
    showArchived ? true : p.status !== "archived"
  );

  const activeProjects = projects?.filter((p) => p.status !== "archived" && p.status !== "completed") || [];
  const completedProjects = projects?.filter((p) => p.status === "completed") || [];
  const onlineCrew = onlineUsers?.filter((u) => u.role === "crew" || u.role === "admin") || [];

  const isAdmin = user?.role === "admin";
  const isClient = user?.role === "client";
  const effectiveRole = isAdmin ? viewMode : (user?.role || "client");
  const isCrewView = effectiveRole === "crew";

  type TaskWithProject = Task & { projectName: string };
  type EventWithProject = CalendarEvent & { projectName: string };

  const { data: myTasks } = useQuery<TaskWithProject[]>({
    queryKey: ["/api/my-tasks"],
    enabled: isCrewView || user?.role === "crew",
  });

  const { data: upcomingEvents } = useQuery<EventWithProject[]>({
    queryKey: ["/api/upcoming-events?days=7"],
    enabled: isCrewView || user?.role === "crew",
  });

  const todayStr = new Date().toISOString().split("T")[0];
  const todayTasks = myTasks?.filter(
    (t) => t.status !== "done" && (t.dueDate === todayStr || (!t.dueDate && t.status === "in_progress"))
  ) || [];
  const overdueTasks = myTasks?.filter(
    (t) => t.status !== "done" && t.dueDate && t.dueDate < todayStr
  ) || [];
  const allOpenTasks = myTasks?.filter(t => t.status !== "done") || [];

  const updateTaskStatus = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await apiRequest("PUT", `/api/tasks/${id}`, { status });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/my-tasks"] });
    },
  });

  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "there";
  const isAdminView = effectiveRole === "admin";
  const isClientView = effectiveRole === "client";

  const handleArchive = (id: number) => {
    archiveProject(id, {
      onSuccess: () => toast({ title: "Success", description: "Project archived." }),
      onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
    });
  };

  const handleDeleteConfirm = () => {
    if (deleteId === null) return;
    deleteProject(deleteId, {
      onSuccess: () => {
        toast({ title: "Success", description: "Project deleted." });
        setDeleteId(null);
      },
      onError: (err) => {
        toast({ title: "Error", description: err.message, variant: "destructive" });
        setDeleteId(null);
      },
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" data-testid="loader-dashboard" />
      </div>
    );
  }

  const canCreateProjects = isAdmin;
  const clientSingleProject = isClient && filteredProjects && filteredProjects.length === 1 ? filteredProjects[0] : null;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="container py-8 md:py-12 px-6 md:px-10">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-0.5" data-testid="text-greeting">
              Welcome back, <span className="font-serif">{fullName}</span>
            </h1>
            <p className="text-sm text-muted-foreground" data-testid="text-subtitle">
              {isCrewView
                ? `Here's your day at a glance. ${todayTasks.length} ${todayTasks.length === 1 ? "task" : "tasks"} for today${overdueTasks.length > 0 ? `, ${overdueTasks.length} overdue` : ""}.`
                : isClientView && clientSingleProject
                  ? `Your project is ${statusLabel[clientSingleProject.status]?.toLowerCase() || "active"}.`
                  : isClientView && !isClient
                    ? "Client view — this is what clients see once they've been invited to a project."
                  : isClientView
                    ? `You have ${activeProjects.length} active ${activeProjects.length === 1 ? "project" : "projects"}.`
                    : isAdminView
                      ? `${activeProjects.length} active ${activeProjects.length === 1 ? "project" : "projects"}${completedProjects.length > 0 ? ` · ${completedProjects.length} completed` : ""}${onlineCrew.length > 0 ? ` · ${onlineCrew.length} team online` : ""}`
                      : "Here is an overview of your active projects."
              }
            </p>
          </div>

          <div className="flex items-center gap-2">
            {isAdmin && (
              <div className="inline-flex items-center border border-border/70 rounded-md overflow-hidden bg-muted/20" data-testid="view-mode-toggle">
                {(["admin", "crew", "client"] as const).map((role) => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => setViewMode(role)}
                    data-testid={`button-view-${role}`}
                    className={[
                      "h-8 px-3 text-xs font-medium transition-colors",
                      viewMode === role
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/40",
                    ].join(" ")}
                  >
                    {role.charAt(0).toUpperCase() + role.slice(1)}
                  </button>
                ))}
              </div>
            )}
            {effectiveRole !== "client" && (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 w-8 p-0" data-testid="button-dashboard-actions">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    {canCreateProjects && (
                      <>
                        <DropdownMenuItem
                          data-testid="dropdown-new-project"
                          onSelect={() => setOpenCreateProject(true)}
                        >
                          <Plus className="mr-2 h-3.5 w-3.5" />
                          New Project
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                      </>
                    )}
                    <DropdownMenuItem
                      data-testid="dropdown-toggle-archived"
                      onSelect={() => setShowArchived(!showArchived)}
                    >
                      {showArchived ? (
                        <EyeOff className="mr-2 h-3.5 w-3.5" />
                      ) : (
                        <Eye className="mr-2 h-3.5 w-3.5" />
                      )}
                      {showArchived ? "Hide Archived" : "Show Archived"}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                {canCreateProjects && (
                  <CreateProjectDialog
                    externalOpen={openCreateProject}
                    onExternalChange={setOpenCreateProject}
                  />
                )}
              </>
            )}
          </div>
        </div>

        {isAdmin && !isClientView && (
          <div className="grid grid-cols-3 gap-2 mb-5" data-testid="admin-stats-strip">
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-muted/40 border border-border/40">
              <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-foreground whitespace-nowrap">{activeProjects.length} Active</span>
            </div>
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-muted/40 border border-border/40">
              <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-foreground whitespace-nowrap">{completedProjects.length} Completed</span>
            </div>
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-muted/40 border border-border/40">
              {onlineCrew.length > 0 ? (
                <div className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                </div>
              ) : (
                <div className="h-2 w-2 rounded-full bg-muted-foreground/30" />
              )}
              <span className="text-xs font-medium text-foreground whitespace-nowrap">{onlineCrew.length} Online</span>
            </div>
          </div>
        )}

        {isCrewView && (
          <div className="space-y-4 mb-8" data-testid="crew-my-day">
            <div className="flex items-center gap-3 flex-wrap">
              <Link href="/timesheets">
                <Button variant="default" size="sm" data-testid="button-crew-timesheets">
                  <Clock className="mr-2 h-4 w-4" />
                  Log Hours
                </Button>
              </Link>
              <Link href="/master-calendar">
                <Button variant="outline" size="sm" data-testid="button-crew-calendar">
                  <CalendarDays className="mr-2 h-4 w-4" />
                  Master Calendar
                </Button>
              </Link>
            </div>

            <Card>
              <CardContent className="py-4">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3" data-testid="text-todays-tasks">
                  Your Tasks for Today
                </h2>
                {todayTasks.length > 0 ? (
                  <div className="space-y-2">
                    {Object.entries(
                      todayTasks.reduce((groups: Record<string, TaskWithProject[]>, task) => {
                        const key = task.projectName || "Unknown Project";
                        if (!groups[key]) groups[key] = [];
                        groups[key].push(task);
                        return groups;
                      }, {} as Record<string, TaskWithProject[]>)
                    ).map(([projectName, projectTasks]) => (
                      <div key={projectName}>
                        <p className="text-xs font-medium text-muted-foreground mb-1.5">{projectName}</p>
                        <div className="space-y-1">
                          {projectTasks.map((task) => (
                            <div
                              key={task.id}
                              className="flex items-center gap-2 px-3 py-2 rounded-md border border-border/40 bg-muted/20"
                              data-testid={`crew-task-${task.id}`}
                            >
                              <button
                                onClick={() => {
                                  const nextStatus = task.status === "todo" ? "in_progress" : task.status === "in_progress" ? "done" : "todo";
                                  updateTaskStatus.mutate({ id: task.id, status: nextStatus });
                                }}
                                className="shrink-0"
                                data-testid={`button-toggle-task-${task.id}`}
                              >
                                {task.status === "done" ? (
                                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                                ) : task.status === "in_progress" ? (
                                  <PlayCircle className="h-4 w-4 text-blue-500" />
                                ) : (
                                  <Circle className="h-4 w-4 text-muted-foreground" />
                                )}
                              </button>
                              <span className={`text-sm flex-1 ${task.status === "done" ? "line-through text-muted-foreground" : "text-foreground"}`}>
                                {task.title}
                              </span>
                              <Badge
                                variant={task.status === "done" ? "default" : task.status === "in_progress" ? "secondary" : "outline"}
                                className="text-xs no-default-hover-elevate no-default-active-elevate"
                              >
                                {task.status === "done" ? "Done" : task.status === "in_progress" ? "In Progress" : "To Do"}
                              </Badge>
                              {task.dueDate && (
                                <span className="text-xs text-muted-foreground whitespace-nowrap">{task.dueDate}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No tasks due today. You're all caught up!</p>
                )}
              </CardContent>
            </Card>

            {allOpenTasks.length > todayTasks.length && (
              <Card>
                <CardContent className="py-4">
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3" data-testid="text-all-assignments">
                    Your Assignments
                  </h2>
                  <div className="space-y-2">
                    {Object.entries(
                      allOpenTasks.reduce((groups: Record<string, TaskWithProject[]>, task) => {
                        const key = task.projectName || "Unknown Project";
                        if (!groups[key]) groups[key] = [];
                        groups[key].push(task);
                        return groups;
                      }, {} as Record<string, TaskWithProject[]>)
                    ).map(([projectName, projectTasks]) => (
                      <div key={projectName}>
                        <p className="text-xs font-medium text-muted-foreground mb-1.5">{projectName}</p>
                        <div className="space-y-1">
                          {projectTasks.map((task) => (
                            <div
                              key={task.id}
                              className="flex items-center gap-2 px-3 py-2 rounded-md border border-border/40 bg-muted/20"
                              data-testid={`crew-all-task-${task.id}`}
                            >
                              <button
                                onClick={() => {
                                  const nextStatus = task.status === "todo" ? "in_progress" : task.status === "in_progress" ? "done" : "todo";
                                  updateTaskStatus.mutate({ id: task.id, status: nextStatus });
                                }}
                                className="shrink-0"
                                data-testid={`button-toggle-all-task-${task.id}`}
                              >
                                {task.status === "in_progress" ? (
                                  <PlayCircle className="h-4 w-4 text-blue-500" />
                                ) : (
                                  <Circle className="h-4 w-4 text-muted-foreground" />
                                )}
                              </button>
                              <span className="text-sm flex-1 text-foreground">{task.title}</span>
                              <Badge
                                variant={task.status === "in_progress" ? "secondary" : "outline"}
                                className="text-xs no-default-hover-elevate no-default-active-elevate"
                              >
                                {task.status === "in_progress" ? "In Progress" : "To Do"}
                              </Badge>
                              {task.dueDate && (
                                <span className="text-xs text-muted-foreground whitespace-nowrap">{task.dueDate}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardContent className="py-4">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3" data-testid="text-upcoming-events">
                  Upcoming Events (Next 7 Days)
                </h2>
                {upcomingEvents && upcomingEvents.length > 0 ? (
                  <div className="space-y-1.5">
                    {upcomingEvents.map((event) => (
                      <div
                        key={event.id}
                        className="flex items-center gap-3 px-3 py-2 rounded-md border border-border/40 bg-muted/20"
                        data-testid={`crew-event-${event.id}`}
                      >
                        <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{event.title}</p>
                          <p className="text-xs text-muted-foreground">{event.projectName}</p>
                        </div>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {event.date === todayStr ? "Today" : new Date(event.date + "T00:00:00").toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric" })}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No upcoming events this week.</p>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {clientSingleProject ? (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Link href={`/project/${clientSingleProject.id}`} data-testid={`link-project-${clientSingleProject.id}`}>
              <Card className="overflow-hidden cursor-pointer hover-elevate transition-shadow max-w-3xl" data-testid={`card-project-hero-${clientSingleProject.id}`}>
                <div className="md:flex">
                  <div className="relative h-52 md:h-auto md:w-80 flex-shrink-0 overflow-hidden">
                    {clientSingleProject.thumbnailUrl ? (
                      <img
                        src={clientSingleProject.thumbnailUrl}
                        alt={clientSingleProject.name}
                        className="h-full w-full object-cover"
                        data-testid={`img-project-hero-${clientSingleProject.id}`}
                      />
                    ) : (
                      <div className="h-full w-full bg-muted min-h-[13rem]" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent to-background/20 hidden md:block" />
                  </div>
                  <CardContent className="flex-1 p-6 md:p-8 flex flex-col justify-center">
                    <Badge variant="secondary" className="w-fit mb-3" data-testid={`badge-status-${clientSingleProject.id}`}>
                      {statusLabel[clientSingleProject.status] || clientSingleProject.status}
                    </Badge>
                    <h2 className="font-serif text-xl md:text-2xl font-bold text-foreground mb-1" data-testid={`text-project-name-${clientSingleProject.id}`}>
                      {clientSingleProject.name}
                    </h2>
                    {clientSingleProject.description && (
                      <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{clientSingleProject.description}</p>
                    )}
                    {clientSingleProject.address && (
                      <p className="text-xs text-muted-foreground mb-4">{clientSingleProject.address}</p>
                    )}
                    {(clientSingleProject.totalBudget || 0) > 0 && (
                      <div className="space-y-1.5 mb-4">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>Budget</span>
                          <span>${(clientSingleProject.budgetUsed || 0).toLocaleString()} / ${(clientSingleProject.totalBudget || 0).toLocaleString()}</span>
                        </div>
                        <Progress value={Math.round(((clientSingleProject.budgetUsed || 0) / (clientSingleProject.totalBudget || 1)) * 100)} className="h-1.5" />
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-sm font-medium text-primary">
                      View Your Project <ArrowRight className="h-4 w-4" />
                    </div>
                  </CardContent>
                </div>
              </Card>
            </Link>
          </motion.div>
        ) : !(isAdmin && isClientView) && filteredProjects && filteredProjects.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {filteredProjects.map((project, idx) => (
              <motion.div
                key={project.id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.08 }}
              >
                <ProjectCard
                  project={project}
                  onArchive={isAdmin ? handleArchive : undefined}
                  onDelete={isAdmin ? ((id) => setDeleteId(id)) : undefined}
                  clientName={project.clientId ? userMap.get(project.clientId) || null : null}
                />
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 bg-secondary/30 rounded-xl border-2 border-dashed border-border" data-testid="empty-state">
            <div className="bg-background p-4 rounded-full shadow-sm mb-4">
              <Plus className="h-6 w-6 text-muted-foreground" />
            </div>
            {canCreateProjects ? (
              <>
                <h3 className="font-serif text-xl font-semibold text-foreground mb-2">No projects yet</h3>
                <p className="text-muted-foreground mb-6">Create your first project to get started.</p>
                <CreateProjectDialog />
              </>
            ) : (
              <>
                <h3 className="font-serif text-xl font-semibold text-foreground mb-2">
                  {isClientView ? "Your project will appear here" : "No projects yet"}
                </h3>
                <p className="text-muted-foreground mb-6">
                  {isClientView
                    ? "Once you've been invited to a project, it will show up here."
                    : isCrewView
                      ? "Your crew lead will assign you to a project soon."
                      : "Your team will add you to a project soon."}
                </p>
              </>
            )}
          </div>
        )}
      </main>

      <AlertDialog open={deleteId !== null} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif" data-testid="text-delete-title">Delete Project</AlertDialogTitle>
            <AlertDialogDescription data-testid="text-delete-description">
              This action cannot be undone. This will permanently delete the project and all associated data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} data-testid="button-confirm-delete">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CreateProjectDialog({ externalOpen, onExternalChange }: { externalOpen?: boolean; onExternalChange?: (v: boolean) => void } = {}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = externalOpen !== undefined ? externalOpen : internalOpen;
  const setOpen = (v: boolean) => {
    if (onExternalChange) onExternalChange(v);
    else setInternalOpen(v);
  };
  const { mutate, isPending } = useCreateProject();
  const { toast } = useToast();
  const { data: users } = useUsers();
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedClient, setSelectedClient] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteForm, setInviteForm] = useState({ firstName: "", lastName: "", email: "", phone: "" });
  const [sendingInvite, setSendingInvite] = useState(false);

  const form = useForm<InsertProject>({
    resolver: zodResolver(insertProjectSchema),
    defaultValues: {
      name: "",
      description: "",
      status: "planning",
    },
  });

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const onSubmit = async (data: InsertProject) => {
    let thumbnailUrl: string | undefined;

    if (imageFile) {
      setUploading(true);
      try {
        const formData = new FormData();
        formData.append("image", imageFile);
        const res = await fetch("/api/upload", {
          method: "POST",
          body: formData,
          credentials: "include",
        });
        if (!res.ok) throw new Error("Upload failed");
        const result = await res.json();
        thumbnailUrl = result.url;
      } catch {
        toast({ title: "Error", description: "Failed to upload image", variant: "destructive" });
        setUploading(false);
        return;
      }
      setUploading(false);
    }

    const clientId = selectedClient && selectedClient !== "none" ? selectedClient : null;

    if (showInviteForm) {
      const missingFields: string[] = [];
      if (!inviteForm.firstName.trim()) missingFields.push("First Name");
      if (!inviteForm.lastName.trim()) missingFields.push("Last Name");
      if (!inviteForm.email.trim()) missingFields.push("Email");
      if (!inviteForm.phone.trim()) missingFields.push("Phone");

      if (missingFields.length > 0) {
        toast({
          title: "Incomplete invite details",
          description: `Please fill in: ${missingFields.join(", ")}. Or collapse the invite form to skip.`,
          variant: "destructive",
        });
        return;
      }
    }

    mutate({ ...data, thumbnailUrl: thumbnailUrl || null, clientId }, {
      onSuccess: async (newProject: { id: number }) => {
        if (showInviteForm && inviteForm.firstName && inviteForm.lastName && inviteForm.email && inviteForm.phone) {
          try {
            setSendingInvite(true);
            await apiRequest("POST", `/api/projects/${newProject.id}/invite-client`, inviteForm);
            toast({ title: "Success", description: "Project created and invite sent!" });
          } catch {
            toast({ title: "Project created", description: "But invite failed to send. You can invite the client from the project page." });
          } finally {
            setSendingInvite(false);
          }
        } else {
          toast({ title: "Success", description: "Project created successfully." });
        }
        setOpen(false);
        form.reset();
        removeImage();
        setSelectedClient("");
        setShowInviteForm(false);
        setInviteForm({ firstName: "", lastName: "", email: "", phone: "" });
      },
      onError: (error) => {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) removeImage(); }}>
      {!onExternalChange && (
        <DialogTrigger asChild>
          <Button size="sm" data-testid="button-new-project">
            <Plus className="mr-2 h-4 w-4" />
            New Project
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl" data-testid="text-dialog-title">Create New Project</DialogTitle>
          <DialogDescription>
            Enter the details for your new construction project.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5 pt-2">
            <div>
              <FormLabel>Project Image</FormLabel>
              <div className="mt-2">
                {imagePreview ? (
                  <div className="relative rounded-md overflow-hidden">
                    <img
                      src={imagePreview}
                      alt="Preview"
                      className="w-full h-40 object-cover rounded-md"
                      data-testid="img-project-preview"
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="secondary"
                      className="absolute top-2 right-2"
                      onClick={removeImage}
                      data-testid="button-remove-image"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => fileInputRef.current?.click()}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click(); }}
                    className="w-full py-10 border-2 border-dashed border-border rounded-md flex flex-col items-center justify-center gap-2 text-muted-foreground cursor-pointer transition-colors hover-elevate"
                    data-testid="button-upload-image"
                  >
                    <Upload className="h-8 w-8" />
                    <span className="text-sm">Click to upload a project image</span>
                    <span className="text-xs">JPG, PNG, GIF, WebP up to 10MB</span>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  className="hidden"
                  onChange={handleImageSelect}
                  data-testid="input-project-image"
                />
              </div>
            </div>

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Project Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Muskoka Lake House" {...field} data-testid="input-project-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Brief description of the project scope..."
                      className="resize-none"
                      {...field}
                      value={field.value || ""}
                      data-testid="input-project-description"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div>
              <FormLabel>Assign Client</FormLabel>
              <Select value={selectedClient} onValueChange={setSelectedClient}>
                <SelectTrigger className="mt-2" data-testid="select-client">
                  <SelectValue placeholder="Select a client..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No client assigned</SelectItem>
                  {users?.map((u) => (
                    <SelectItem key={u.id} value={u.id} data-testid={`option-client-${u.id}`}>
                      <div className="flex items-center gap-2">
                        <span>{u.firstName || ""} {u.lastName || ""}</span>
                        {u.email && <span className="text-muted-foreground text-xs">({u.email})</span>}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="border-t pt-4">
              <button
                type="button"
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setShowInviteForm(!showInviteForm)}
                data-testid="button-toggle-invite-form"
              >
                <UserPlus className="h-4 w-4" />
                {showInviteForm ? "Hide invite form" : "Invite a new client via SMS"}
              </button>
              {showInviteForm && (
                <div className="mt-3 space-y-3 p-3 bg-muted/30 rounded-lg border">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="create-invite-first" className="text-xs">First Name</Label>
                      <Input id="create-invite-first" value={inviteForm.firstName} onChange={(e) => setInviteForm(f => ({ ...f, firstName: e.target.value }))} placeholder="First name" data-testid="input-create-invite-first" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="create-invite-last" className="text-xs">Last Name</Label>
                      <Input id="create-invite-last" value={inviteForm.lastName} onChange={(e) => setInviteForm(f => ({ ...f, lastName: e.target.value }))} placeholder="Last name" data-testid="input-create-invite-last" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="create-invite-email" className="text-xs">Email</Label>
                    <Input id="create-invite-email" type="email" value={inviteForm.email} onChange={(e) => setInviteForm(f => ({ ...f, email: e.target.value }))} placeholder="client@example.com" data-testid="input-create-invite-email" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="create-invite-phone" className="text-xs">Phone</Label>
                    <Input id="create-invite-phone" value={inviteForm.phone} onChange={(e) => setInviteForm(f => ({ ...f, phone: e.target.value }))} placeholder="(705) 555-0123" data-testid="input-create-invite-phone" />
                  </div>
                  <p className="text-[11px] text-muted-foreground">Client will receive an SMS with a link to access their portal after the project is created.</p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} data-testid="button-cancel">
                Cancel
              </Button>
              <Button type="submit" disabled={isPending || uploading || sendingInvite} data-testid="button-create">
                {(isPending || uploading || sendingInvite) ? <Loader2 className="mr-2 animate-spin" /> : null}
                {sendingInvite ? "Sending Invite..." : "Create Project"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
