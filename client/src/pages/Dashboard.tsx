import { useAuth } from "@/hooks/use-auth";
import { useProjects, useDeleteProject, useArchiveProject, useUsers } from "@/hooks/use-projects";
import { Navbar } from "@/components/layout/Navbar";
import { ProjectCard } from "@/components/project/ProjectCard";
import { Button } from "@/components/ui/button";
import { Plus, Loader2, Eye, EyeOff, Upload, X, UserPlus, Mail, ArrowRight, FolderOpen, Users, Briefcase } from "lucide-react";
import { Label } from "@/components/ui/label";
import { apiRequest, queryClient as qc } from "@/lib/queryClient";
import { motion } from "framer-motion";
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
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const { data: onlineUsers } = useOnlineUsers();

  const userMap = new Map(allUsers?.map((u) => [u.id, `${u.firstName || ""} ${u.lastName || ""}`.trim()]) || []);

  const filteredProjects = projects?.filter((p) =>
    showArchived ? true : p.status !== "archived"
  );

  const activeProjects = projects?.filter((p) => p.status !== "archived" && p.status !== "completed") || [];
  const completedProjects = projects?.filter((p) => p.status === "completed") || [];
  const onlineCrew = onlineUsers?.filter((u) => u.role === "crew" || u.role === "admin") || [];

  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "there";
  const isClient = user?.role === "client";
  const isAdmin = user?.role === "admin";
  const isCrew = user?.role === "crew";

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

  if (isCrew) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container py-12 px-6 md:px-10">
          <h1 className="font-serif text-3xl font-bold text-foreground mb-6" data-testid="text-crew-heading">
            Today's Schedule
          </h1>
          <div className="bg-card border border-card-border rounded-xl p-10 text-center text-muted-foreground" data-testid="text-crew-placeholder">
            Crew dashboard coming soon. Please check with your foreman.
          </div>
        </div>
      </div>
    );
  }

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
              {isClient && clientSingleProject
                ? `Your project is ${statusLabel[clientSingleProject.status]?.toLowerCase() || "active"}.`
                : isClient
                  ? `You have ${activeProjects.length} active ${activeProjects.length === 1 ? "project" : "projects"}.`
                  : isAdmin
                    ? `${activeProjects.length} active ${activeProjects.length === 1 ? "project" : "projects"}${completedProjects.length > 0 ? ` · ${completedProjects.length} completed` : ""}${onlineCrew.length > 0 ? ` · ${onlineCrew.length} team online` : ""}`
                    : "Here is an overview of your active projects."
              }
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {(isAdmin || isCrew) && filteredProjects && filteredProjects.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowArchived(!showArchived)}
                data-testid="button-toggle-archived"
              >
                {showArchived ? <EyeOff className="mr-2 h-3.5 w-3.5" /> : <Eye className="mr-2 h-3.5 w-3.5" />}
                {showArchived ? "Hide Archived" : "Show Archived"}
              </Button>
            )}
            {user?.role !== "client" && <CreateProjectDialog />}
          </div>
        </div>

        {isAdmin && activeProjects.length > 0 && (
          <div className="flex items-center gap-4 mb-6 flex-wrap" data-testid="admin-stats-strip">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted/50 border border-border/40">
              <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-foreground">{activeProjects.length} Active</span>
            </div>
            {completedProjects.length > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted/50 border border-border/40">
                <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-foreground">{completedProjects.length} Completed</span>
              </div>
            )}
            {onlineCrew.length > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted/50 border border-border/40">
                <div className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                </div>
                <span className="text-xs font-medium text-foreground">{onlineCrew.length} Team Online</span>
              </div>
            )}
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
        ) : filteredProjects && filteredProjects.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
            {user?.role !== "client" ? (
              <>
                <h3 className="font-serif text-xl font-semibold text-foreground mb-2">No projects yet</h3>
                <p className="text-muted-foreground mb-6">Create your first project to get started.</p>
                <CreateProjectDialog />
              </>
            ) : (
              <>
                <h3 className="font-serif text-xl font-semibold text-foreground mb-2">No projects yet</h3>
                <p className="text-muted-foreground mb-6">Your team will add you to a project soon.</p>
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

function CreateProjectDialog() {
  const [open, setOpen] = useState(false);
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
      <DialogTrigger asChild>
        <Button size="sm" data-testid="button-new-project">
          <Plus className="mr-2 h-4 w-4" />
          New Project
        </Button>
      </DialogTrigger>
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
