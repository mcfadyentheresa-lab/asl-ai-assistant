import { useAuth } from "@/hooks/use-auth";
import { useProjects, useDeleteProject, useArchiveProject, useUsers, useCreateProject } from "@/hooks/use-projects";
import { Navbar } from "@/components/layout/Navbar";
import { AdminDashboardView } from "@/components/dashboard/AdminDashboardView";
import { CrewDashboardView } from "@/components/dashboard/CrewDashboardView";
import { ClientDashboardView } from "@/components/dashboard/ClientDashboardView";
import { Button } from "@/components/ui/button";
import { Plus, Loader2, Eye, EyeOff, X, UserPlus, MoreHorizontal, Upload, Home } from "lucide-react";
import { Label } from "@/components/ui/label";
import { apiRequest, queryClient as qc } from "@/lib/queryClient";
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
import { useToast } from "@/hooks/use-toast";
import { useOnlineUsers } from "@/hooks/use-presence";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useViewMode } from "@/hooks/use-view-mode";

type TaskWithProject = Task & { projectName: string };
type EventWithProject = CalendarEvent & { projectName: string };

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

  const isAdmin = user?.role === "admin";
  const _isClient = user?.role === "client";
  const effectiveRole = isAdmin ? viewMode : (user?.role || "client");
  const isCrewView = effectiveRole === "crew";
  const isClientView = effectiveRole === "client";
  const isAdminView = effectiveRole === "admin";

  const userMap = new Map(
    allUsers?.map((u) => [u.id, `${u.firstName || ""} ${u.lastName || ""}`.trim()]) || []
  );

  const filteredProjects = projects?.filter((p) =>
    showArchived ? true : p.status !== "archived"
  );
  const activeProjects = projects?.filter((p) => p.status !== "archived" && p.status !== "completed") || [];
  const completedProjects = projects?.filter((p) => p.status === "completed") || [];
  const onlineCrew = onlineUsers?.filter((u) => u.role === "crew" || u.role === "admin") || [];

  const { data: myTasks } = useQuery<TaskWithProject[]>({
    queryKey: ["/api/my-tasks"],
    enabled: isCrewView || user?.role === "crew",
  });

  const { data: upcomingEvents } = useQuery<EventWithProject[]>({
    queryKey: ["/api/upcoming-events?days=7"],
    enabled: isCrewView || user?.role === "crew",
  });

  const updateTaskStatus = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await apiRequest("PUT", `/api/tasks/${id}`, { status });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/my-tasks"] });
    },
  });

  const handleToggleTaskStatus = (id: number, currentStatus: string) => {
    const nextStatus =
      currentStatus === "todo" ? "in_progress" :
      currentStatus === "in_progress" ? "done" : "todo";
    updateTaskStatus.mutate({ id, status: nextStatus });
  };

  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "there";
  const hour = new Date().getHours();
  const timeGreeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  // Active client project selection. Lives at top of component so the hook
  // order is stable across renders even when `isLoading` flips below.
  const [selectedClientProjectId, setSelectedClientProjectId] = useState<number | null>(null);

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
  // All non-archived projects this client belongs to. Most clients have one,
  // but some have multiple (main reno + secondary suite, or two homes under
  // one renovation contract). Pick the first as the default selection but
  // let the user switch via chips in the dashboard or links in the sidebar.
  const clientProjectsList = isClientView
    ? (filteredProjects?.filter((p) => p.status !== "archived") || [])
    : [];
  const clientProject = isClientView
    ? (selectedClientProjectId
        ? clientProjectsList.find((p) => p.id === selectedClientProjectId) ?? clientProjectsList[0] ?? null
        : clientProjectsList[0] ?? null)
    : null;

  const todayTaskCount = myTasks?.filter(
    (t) => {
      const todayStr = new Date().toISOString().split("T")[0];
      return t.status !== "done" && (t.dueDate === todayStr || (!t.dueDate && t.status === "in_progress"));
    }
  ).length ?? 0;
  const overdueTaskCount = myTasks?.filter(
    (t) => {
      const todayStr = new Date().toISOString().split("T")[0];
      return t.status !== "done" && t.dueDate && t.dueDate < todayStr;
    }
  ).length ?? 0;

  const subtitle = isCrewView
    ? `${todayTaskCount > 0 ? `${todayTaskCount} ${todayTaskCount === 1 ? "task" : "tasks"} due today` : "No tasks due today"}${overdueTaskCount > 0 ? ` · ${overdueTaskCount} overdue` : ""}.`
    : isClientView && !isAdmin
      ? clientProject ? `Your ${clientProject.name}` : "Your project will appear here once you're invited."
      : isClientView && isAdmin
        ? "Client view — this is what clients see when they log in."
        : `${activeProjects.length} active ${activeProjects.length === 1 ? "project" : "projects"}${completedProjects.length > 0 ? ` · ${completedProjects.length} completed` : ""}${onlineCrew.length > 0 ? ` · ${onlineCrew.length} online` : ""}`;

  // Client view gets a flush, edge-to-edge layout — no container, no greeting block.
  // The ClientDashboardView component handles its own padding and structure.
  if (isClientView && clientProject) {
    return (
      <div className="min-h-screen bg-background" data-role="client">
        <Navbar />
        <main>
          <ClientDashboardView
            project={clientProject}
            isAdminPreview={isAdmin}
            allProjects={clientProjectsList.map((p) => ({ id: p.id, name: p.name }))}
            onSelectProject={setSelectedClientProjectId}
          />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="container py-8 md:py-12 px-6 md:px-10">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div>
            <h1 className="normal-case mb-0.5" data-testid="text-greeting">
              <span className="block text-xs tracking-widest text-muted-foreground font-sans font-normal uppercase mb-1">
                {timeGreeting}
              </span>
              <span className="block font-serif text-2xl md:text-3xl font-normal text-foreground">
                {user?.firstName || fullName}
              </span>
            </h1>
            <p className="text-sm text-muted-foreground" data-testid="text-subtitle">
              {subtitle}
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
            {!isClientView && (
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

        {isCrewView && (
          <CrewDashboardView
            myTasks={myTasks}
            upcomingEvents={upcomingEvents}
            onToggleTaskStatus={handleToggleTaskStatus}
            isPending={updateTaskStatus.isPending}
            projects={projects}
          />
        )}

        {isClientView && clientProject && (
          <ClientDashboardView
            project={clientProject}
            isAdminPreview={isAdmin}
          />
        )}

        {isClientView && !clientProject && (
          <div className="flex flex-col items-center justify-center py-20 bg-secondary/30 rounded-xl border-2 border-dashed border-border" data-testid="empty-state">
            <div className="bg-background p-4 rounded-full shadow-sm mb-4">
              {/* Home (not Plus) — clients can't create projects, so a "+"
                  icon implied an action they can't take. */}
              <Home className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="font-serif text-xl font-semibold text-foreground mb-2 text-center">
              {isAdmin ? "No active project to preview" : "Your project will appear here"}
            </h3>
            <p className="text-muted-foreground text-center max-w-xs">
              {isAdmin
                ? "Switch to Admin view to manage projects, or invite a client to a project."
                : "Once you've been invited to a project, it will show up here."}
            </p>
          </div>
        )}

        {(isAdminView || (!isCrewView && !isClientView)) && (
          <AdminDashboardView
            projects={projects}
            filteredProjects={filteredProjects}
            activeProjects={activeProjects}
            completedProjects={completedProjects}
            onlineCrew={onlineCrew}
            userMap={userMap}
            onArchive={handleArchive}
            onDeleteRequest={(id) => setDeleteId(id)}
            onNewProject={() => setOpenCreateProject(true)}
            canCreateProjects={canCreateProjects}
            showArchived={showArchived}
          />
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
    defaultValues: { name: "", description: "", status: "planning" },
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
        const res = await fetch("/api/upload", { method: "POST", body: formData, credentials: "include" });
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
        toast({ title: "Incomplete invite details", description: `Please fill in: ${missingFields.join(", ")}. Or collapse the invite form to skip.`, variant: "destructive" });
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
      onError: (error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
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
          <DialogDescription>Enter the details for your new construction project.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5 pt-2">
            <div>
              <FormLabel>Project Image</FormLabel>
              <div className="mt-2">
                {imagePreview ? (
                  <div className="relative rounded-md overflow-hidden">
                    <img src={imagePreview} alt="Preview" className="w-full h-40 object-cover rounded-md" data-testid="img-project-preview" />
                    <Button type="button" size="icon" variant="secondary" className="absolute top-2 right-2" onClick={removeImage} data-testid="button-remove-image">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div role="button" tabIndex={0} onClick={() => fileInputRef.current?.click()} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click(); }} className="w-full py-10 border-2 border-dashed border-border rounded-md flex flex-col items-center justify-center gap-2 text-muted-foreground cursor-pointer transition-colors hover-elevate" data-testid="button-upload-image">
                    <Upload className="h-8 w-8" />
                    <span className="text-sm">Click to upload a project image</span>
                    <span className="text-xs">JPG, PNG, GIF, WebP up to 10MB</span>
                  </div>
                )}
                <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="hidden" onChange={handleImageSelect} data-testid="input-project-image" />
              </div>
            </div>
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem>
                <FormLabel>Project Name</FormLabel>
                <FormControl><Input placeholder="e.g. Muskoka Lake House" {...field} data-testid="input-project-name" /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl><Textarea placeholder="Brief description of the project scope..." className="resize-none" {...field} value={field.value || ""} data-testid="input-project-description" /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <div>
              <FormLabel>Assign Client</FormLabel>
              <Select value={selectedClient} onValueChange={setSelectedClient}>
                <SelectTrigger className="mt-2" data-testid="select-client"><SelectValue placeholder="Select a client..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No client assigned</SelectItem>
                  {users?.map((u) => (
                    <SelectItem key={u.id} value={u.id} data-testid={`option-client-${u.id}`}>
                      <span>{u.firstName || ""} {u.lastName || ""}</span>
                      {u.email && <span className="text-muted-foreground text-xs ml-1">({u.email})</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="border-t pt-4">
              <button type="button" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors" onClick={() => setShowInviteForm(!showInviteForm)} data-testid="button-toggle-invite-form">
                <UserPlus className="h-4 w-4" />
                {showInviteForm ? "Hide invite form" : "Invite a new client by email"}
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
                  <p className="text-[11px] text-muted-foreground">Client will receive an email with a link to access their portal after the project is created.</p>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} data-testid="button-cancel">Cancel</Button>
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
