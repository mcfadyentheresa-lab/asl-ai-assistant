import { useAuth } from "@/hooks/use-auth";
import { useProjects, useDeleteProject, useArchiveProject } from "@/hooks/use-projects";
import { Navbar } from "@/components/layout/Navbar";
import { ProjectCard } from "@/components/project/ProjectCard";
import { Button } from "@/components/ui/button";
import { Plus, Loader2, Eye, EyeOff, Upload, X } from "lucide-react";
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
import { useToast } from "@/hooks/use-toast";

export default function Dashboard() {
  const { user } = useAuth();
  const { data: projects, isLoading } = useProjects();
  const { mutate: deleteProject } = useDeleteProject();
  const { mutate: archiveProject } = useArchiveProject();
  const { toast } = useToast();
  const [showArchived, setShowArchived] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const filteredProjects = projects?.filter((p) =>
    showArchived ? true : p.status !== "archived"
  );

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

  if (user?.email?.includes("crew")) {
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

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="container py-10 md:py-14 px-6 md:px-10">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-10">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-1" data-testid="text-greeting">
              Welcome back, <span className="font-serif">{user?.firstName || "Client"}</span>.
            </h1>
            <p className="text-muted-foreground" data-testid="text-subtitle">
              Here is an overview of your active projects.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              onClick={() => setShowArchived(!showArchived)}
              data-testid="button-toggle-archived"
            >
              {showArchived ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
              {showArchived ? "Hide Archived" : "Show Archived"}
            </Button>
            {user?.role !== "client" && <CreateProjectDialog />}
          </div>
        </div>

        {filteredProjects && filteredProjects.length > 0 ? (
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
                  onArchive={handleArchive}
                  onDelete={(id) => setDeleteId(id)}
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
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

    mutate({ ...data, thumbnailUrl: thumbnailUrl || null }, {
      onSuccess: () => {
        toast({ title: "Success", description: "Project created successfully." });
        setOpen(false);
        form.reset();
        removeImage();
      },
      onError: (error) => {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) removeImage(); }}>
      <DialogTrigger asChild>
        <Button data-testid="button-new-project">
          <Plus className="mr-2" />
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

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} data-testid="button-cancel">
                Cancel
              </Button>
              <Button type="submit" disabled={isPending || uploading} data-testid="button-create">
                {(isPending || uploading) ? <Loader2 className="mr-2 animate-spin" /> : null}
                Create Project
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
