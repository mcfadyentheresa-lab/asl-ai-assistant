import { useEffect, useMemo, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Navbar } from "@/components/layout/Navbar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useProjects } from "@/hooks/use-projects";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Loader2, Sparkles, Shuffle, Copy, RefreshCw, ArrowLeft, X, ImageIcon,
  ChevronLeft, ChevronRight, Layers, Library, Trash2, Check, Edit3,
  CloudUpload, ArrowRightFromLine, Leaf, Star
} from "lucide-react";
import { Link } from "wouter";

const tones = ["Professional", "Warm", "Behind the scenes", "Polished", "Excited"] as const;

interface SocialPhoto {
  id: number;
  url: string;
  caption: string | null;
  tags: string[];
  isShowcase: boolean;
  isBeforeAfter: boolean;
}

interface SocialPost {
  id: number;
  projectId: number;
  title: string;
  copy: string;
  platform: string;
  tone: string | null;
  photoUrl: string | null;
  photoId: number | null;
  status: string;
  source: string | null;
  postedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SeasonalPrompt {
  id: string;
  title: string;
  description: string;
  icon: string;
  theme: string;
}

export default function SocialMediaGenerator() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { data: projects = [], isLoading: projectsLoading } = useProjects();

  const [activeTab, setActiveTab] = useState("generate");
  const [projectId, setProjectId] = useState<string>("");
  const [platform, setPlatform] = useState<"instagram" | "facebook">("instagram");
  const [tone, setTone] = useState<string>("Warm");
  const [focus, setFocus] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedPost, setGeneratedPost] = useState("");
  const [generatedTitle, setGeneratedTitle] = useState("");
  const [generatedPlatform, setGeneratedPlatform] = useState<string>("");
  const [photos, setPhotos] = useState<SocialPhoto[]>([]);
  const [selectedPhotoId, setSelectedPhotoId] = useState<number | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [batchCount, setBatchCount] = useState(3);
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);

  const [filterProject, setFilterProject] = useState<string>("all");
  const [filterPlatform, setFilterPlatform] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const [editingPost, setEditingPost] = useState<SocialPost | null>(null);
  const [editCopy, setEditCopy] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editPhotoId, setEditPhotoId] = useState<number | null>(null);
  const [editPhotoUrl, setEditPhotoUrl] = useState<string | null>(null);
  const [editPhotos, setEditPhotos] = useState<SocialPhoto[]>([]);

  const [exportingIds, setExportingIds] = useState<Set<number>>(new Set());

  const selectedProject = useMemo(() => projects.find((p) => String(p.id) === projectId), [projects, projectId]);

  const { data: projectPhotos = [] } = useQuery<SocialPhoto[]>({
    queryKey: ["/api/projects", projectId, "photos"],
    queryFn: async () => {
      if (!projectId) return [];
      const res = await fetch(`/api/projects/${projectId}/photos`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!projectId,
  });

  useEffect(() => {
    if (user && (user as any).role !== "admin") {
      navigate("/");
    }
  }, [user, navigate]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (lightboxIndex === null) return;
    if (e.key === "Escape") setLightboxIndex(null);
    if (e.key === "ArrowLeft" && lightboxIndex > 0) setLightboxIndex(lightboxIndex - 1);
    if (e.key === "ArrowRight" && lightboxIndex < photos.length - 1) setLightboxIndex(lightboxIndex + 1);
  }, [lightboxIndex, photos.length]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const libraryQueryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (filterProject !== "all") params.set("projectId", filterProject);
    if (filterPlatform !== "all") params.set("platform", filterPlatform);
    if (filterStatus !== "all") params.set("status", filterStatus);
    return params.toString();
  }, [filterProject, filterPlatform, filterStatus]);

  const { data: libraryPosts = [], isLoading: libraryLoading } = useQuery<SocialPost[]>({
    queryKey: ["/api/social-posts", libraryQueryParams],
    queryFn: async () => {
      const res = await fetch(`/api/social-posts?${libraryQueryParams}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: seasonalPrompts = [] } = useQuery<SeasonalPrompt[]>({
    queryKey: ["/api/social-media/seasonal-prompts"],
  });

  const newDraftCount = useMemo(() => {
    return libraryPosts.filter(p => p.status === "draft" && p.source === "milestone").length;
  }, [libraryPosts]);

  const updatePostMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: any }) => {
      const res = await apiRequest("PATCH", `/api/social-posts/${id}`, updates);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/social-posts"] });
      toast({ title: "Post updated" });
    },
  });

  const deletePostMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/social-posts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/social-posts"] });
      toast({ title: "Post deleted" });
    },
  });

  if (user && (user as any).role !== "admin") {
    return null;
  }

  async function generatePost(random = false) {
    const chosenProject = random ? projects[Math.floor(Math.random() * projects.length)] : selectedProject;
    if (!chosenProject) {
      toast({ title: "Select a project", description: "Choose a project before generating a post.", variant: "destructive" });
      return;
    }
    setIsGenerating(true);
    try {
      const res = await apiRequest("POST", "/api/social-media/generate", {
        projectId: chosenProject.id,
        platform: random ? (Math.random() > 0.5 ? "instagram" : "facebook") : platform,
        tone: random ? tones[Math.floor(Math.random() * tones.length)] : tone,
        focus: random ? "" : focus,
        random,
        photoId: selectedPhotoId || undefined,
      });
      const data = await res.json();
      setGeneratedTitle(data.title || `${chosenProject.name} post`);
      setGeneratedPost(data.copy || "");
      setGeneratedPlatform(data.platform || platform);
      setPhotos(data.photos || []);
      queryClient.invalidateQueries({ queryKey: ["/api/social-posts"] });
      toast({ title: "Post generated & saved", description: "Added to your content library as a draft." });
    } catch {
      toast({ title: "Generation failed", description: "Could not create a social post.", variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  }

  async function generateBatch() {
    if (!projectId) {
      toast({ title: "Select a project", variant: "destructive" });
      return;
    }
    setIsBatchGenerating(true);
    try {
      const res = await apiRequest("POST", "/api/social-media/batch-generate", {
        projectId: Number(projectId),
        count: batchCount,
      });
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/social-posts"] });
      toast({ title: `${data.posts?.length || 0} posts generated`, description: "All saved to your content library." });
      setActiveTab("library");
    } catch {
      toast({ title: "Batch generation failed", variant: "destructive" });
    } finally {
      setIsBatchGenerating(false);
    }
  }

  async function generateBeforeAfter() {
    if (!projectId) {
      toast({ title: "Select a project", variant: "destructive" });
      return;
    }
    setIsGenerating(true);
    try {
      const res = await apiRequest("POST", "/api/social-media/before-after", {
        projectId: Number(projectId),
        platform,
      });
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/social-posts"] });
      setGeneratedTitle(data.title || "Transformation Reveal");
      setGeneratedPost(data.copy || "");
      setGeneratedPlatform(data.platform || platform);
      toast({ title: "Before/after post generated", description: "Saved to your content library." });
    } catch (err: any) {
      const msg = await err?.response?.json?.().catch(() => null);
      toast({ title: "Generation failed", description: msg?.message || "Could not create before/after post.", variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  }

  async function generateSeasonal(prompt: SeasonalPrompt) {
    if (!projectId) {
      toast({ title: "Select a project first", variant: "destructive" });
      return;
    }
    setIsGenerating(true);
    try {
      const res = await apiRequest("POST", "/api/social-media/seasonal-generate", {
        projectId: Number(projectId),
        platform,
        seasonalTheme: prompt.theme,
        seasonalTitle: prompt.title,
      });
      await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/social-posts"] });
      toast({ title: "Seasonal post generated", description: "Saved to your content library." });
      setActiveTab("library");
    } catch {
      toast({ title: "Generation failed", variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  }

  async function exportToDrive(postIds: number[]) {
    setExportingIds(new Set(postIds));
    try {
      const res = await apiRequest("POST", "/api/social-posts/export-drive", { postIds });
      const data = await res.json();
      toast({
        title: "Exported to Google Drive",
        description: `${data.exported?.length || 0} post(s) saved to "${data.folderName}".`,
      });
    } catch {
      toast({ title: "Export failed", description: "Could not save to Google Drive.", variant: "destructive" });
    } finally {
      setExportingIds(new Set());
    }
  }

  async function copyPost() {
    if (!generatedPost) return;
    await navigator.clipboard.writeText(generatedPost);
    toast({ title: "Copied", description: "Post copy was copied to your clipboard." });
  }

  async function openEditDialog(post: SocialPost) {
    setEditingPost(post);
    setEditCopy(post.copy);
    setEditTitle(post.title);
    setEditPhotoId(post.photoId);
    setEditPhotoUrl(post.photoUrl);
    try {
      const res = await fetch(`/api/projects/${post.projectId}/photos`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setEditPhotos(data);
      }
    } catch {
      setEditPhotos([]);
    }
  }

  function getStatusColour(status: string) {
    switch (status) {
      case "draft": return "secondary";
      case "ready": return "default";
      case "posted": return "outline";
      default: return "secondary";
    }
  }

  function getProjectName(pId: number) {
    return projects.find(p => p.id === pId)?.name || "Unknown";
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto max-w-6xl px-4 py-6 space-y-6">
        <div className="space-y-2">
          <Link href="/">
            <Button variant="ghost" size="sm" className="mb-2" data-testid="button-back-social">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
            </Button>
          </Link>
          <h1 className="font-serif text-3xl uppercase tracking-wide text-foreground" data-testid="text-social-heading">
            Social Media Content
          </h1>
          <p className="text-muted-foreground">Generate, collect, and organise social content from your projects.</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="generate" data-testid="tab-generate">
              <Sparkles className="mr-2 h-4 w-4" /> Generate
            </TabsTrigger>
            <TabsTrigger value="library" data-testid="tab-library">
              <Library className="mr-2 h-4 w-4" /> Library
              {libraryPosts.length > 0 && (
                <Badge variant="secondary" className="ml-2 text-xs">{libraryPosts.length}</Badge>
              )}
              {newDraftCount > 0 && (
                <Badge variant="destructive" className="ml-1 text-xs" data-testid="badge-new-drafts">
                  {newDraftCount} new
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* =================== GENERATE TAB =================== */}
          <TabsContent value="generate" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-6">
                {/* Controlled generation */}
                <Card>
                  <CardHeader>
                    <CardTitle className="uppercase tracking-wide">Controlled</CardTitle>
                    <CardDescription>Pick the project, platform, tone, and what to highlight.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>Project</Label>
                      <Select value={projectId} onValueChange={setProjectId}>
                        <SelectTrigger data-testid="select-social-project">
                          <SelectValue placeholder={projectsLoading ? "Loading projects" : "Choose a project"} />
                        </SelectTrigger>
                        <SelectContent>
                          {projects.map((project) => (
                            <SelectItem key={project.id} value={String(project.id)}>{project.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Platform</Label>
                        <Select value={platform} onValueChange={(v) => setPlatform(v as "instagram" | "facebook")}>
                          <SelectTrigger data-testid="select-social-platform">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="instagram">Instagram</SelectItem>
                            <SelectItem value="facebook">Facebook</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Tone</Label>
                        <Select value={tone} onValueChange={setTone}>
                          <SelectTrigger data-testid="select-social-tone">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {tones.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Focus</Label>
                      <Textarea value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="Optional: mention a before/after, milestone, or design detail." data-testid="input-social-focus" />
                    </div>
                    {projectId && (
                      <div className="space-y-2">
                        <Label>Pair a Photo</Label>
                        {projectPhotos.length > 0 ? (
                          <div className="flex gap-2 overflow-x-auto pb-1" data-testid="generate-photo-picker">
                            <button
                              onClick={() => setSelectedPhotoId(null)}
                              className={`flex-shrink-0 rounded-lg border-2 p-2 text-xs text-muted-foreground ${!selectedPhotoId ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}`}
                              data-testid="generate-photo-auto"
                            >
                              Auto
                            </button>
                            {projectPhotos.map((photo) => (
                              <button
                                key={photo.id}
                                onClick={() => setSelectedPhotoId(photo.id)}
                                className={`relative flex-shrink-0 rounded-lg overflow-hidden border-2 transition-colors ${selectedPhotoId === photo.id ? "border-primary" : "border-border hover:border-primary/50"}`}
                                data-testid={`generate-photo-${photo.id}`}
                              >
                                <img src={photo.url} alt={photo.caption || "Photo"} className="h-14 w-14 object-cover" />
                                {selectedPhotoId === photo.id && (
                                  <div className="absolute top-0.5 left-0.5 bg-primary text-primary-foreground rounded-full p-0.5">
                                    <Check className="h-2.5 w-2.5" />
                                  </div>
                                )}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground" data-testid="text-no-project-photos">No photos uploaded for this project yet. A showcase photo will be paired automatically if available.</p>
                        )}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-3">
                      <Button onClick={() => generatePost(false)} disabled={isGenerating || !projectId} data-testid="button-generate-social">
                        {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                        Generate
                      </Button>
                      <Button variant="outline" onClick={() => generatePost(true)} disabled={isGenerating || projects.length === 0} data-testid="button-generate-random-social">
                        <Shuffle className="mr-2 h-4 w-4" /> Random
                      </Button>
                      <Button variant="outline" onClick={generateBeforeAfter} disabled={isGenerating || !projectId} data-testid="button-generate-before-after">
                        <ArrowRightFromLine className="mr-2 h-4 w-4" /> Before/After
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Batch generation */}
                <Card>
                  <CardHeader>
                    <CardTitle className="uppercase tracking-wide flex items-center gap-2">
                      <Layers className="h-5 w-5" /> Batch Generate
                    </CardTitle>
                    <CardDescription>Create multiple post ideas at once for a project.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-end gap-4">
                      <div className="space-y-2 flex-1">
                        <Label>Number of Posts</Label>
                        <Select value={String(batchCount)} onValueChange={(v) => setBatchCount(Number(v))}>
                          <SelectTrigger data-testid="select-batch-count">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {[2, 3, 4, 5].map((n) => (
                              <SelectItem key={n} value={String(n)}>{n} posts</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button onClick={generateBatch} disabled={isBatchGenerating || !projectId} data-testid="button-batch-generate">
                        {isBatchGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Layers className="mr-2 h-4 w-4" />}
                        Generate Batch
                      </Button>
                    </div>
                    {!projectId && <p className="text-xs text-muted-foreground">Select a project above first.</p>}
                  </CardContent>
                </Card>

                {/* Seasonal prompts */}
                {seasonalPrompts.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="uppercase tracking-wide flex items-center gap-2">
                        <Leaf className="h-5 w-5" /> Seasonal Ideas
                      </CardTitle>
                      <CardDescription>Timely content ideas for the current season.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid gap-3">
                        {seasonalPrompts.map((prompt) => (
                          <button
                            key={prompt.id}
                            onClick={() => generateSeasonal(prompt)}
                            disabled={isGenerating || !projectId}
                            className="flex items-start gap-3 rounded-lg border border-border p-3 text-left hover:bg-muted/50 transition-colors disabled:opacity-50"
                            data-testid={`seasonal-prompt-${prompt.id}`}
                          >
                            <span className="text-2xl">{prompt.icon}</span>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm">{prompt.title}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">{prompt.description}</p>
                            </div>
                            <Sparkles className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                          </button>
                        ))}
                      </div>
                      {!projectId && <p className="text-xs text-muted-foreground mt-3">Select a project above to generate seasonal content.</p>}
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Generated post preview */}
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="uppercase tracking-wide">Generated Post</CardTitle>
                    <CardDescription>Copy and paste this into Instagram or Facebook.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {generatedPost ? (
                      <>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" data-testid="badge-social-title">{generatedTitle}</Badge>
                          <Badge variant="outline" data-testid="badge-social-platform">{generatedPlatform.charAt(0).toUpperCase() + generatedPlatform.slice(1)}</Badge>
                        </div>
                        <div className="whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-4 text-sm leading-6" data-testid="text-generated-social-post">
                          {generatedPost}
                        </div>
                        <div className="flex gap-3">
                          <Button onClick={copyPost} variant="outline" data-testid="button-copy-social-post">
                            <Copy className="mr-2 h-4 w-4" /> Copy
                          </Button>
                          <Button onClick={() => generatePost(false)} variant="secondary" disabled={isGenerating || !projectId} data-testid="button-regenerate-social-post">
                            <RefreshCw className="mr-2 h-4 w-4" /> Regenerate
                          </Button>
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground" data-testid="text-social-placeholder">Your generated post will appear here. All posts are auto-saved to your library.</p>
                    )}
                  </CardContent>
                </Card>

                {generatedPost && photos.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="uppercase tracking-wide flex items-center gap-2">
                        <ImageIcon className="h-5 w-5" /> Project Photos
                      </CardTitle>
                      <CardDescription>Click a photo to select it for your post.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1" data-testid="gallery-social-photos">
                        {photos.map((photo, index) => (
                          <button
                            key={photo.id}
                            onClick={() => {
                              setSelectedPhotoId(photo.id);
                              setLightboxIndex(index);
                            }}
                            className={`group relative flex-shrink-0 rounded-lg overflow-hidden border-2 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 ${
                              selectedPhotoId === photo.id ? "border-primary" : "border-border hover:border-primary/50"
                            }`}
                            data-testid={`photo-thumbnail-${photo.id}`}
                          >
                            <img src={photo.url} alt={photo.caption || "Project photo"} className="h-24 w-24 object-cover" loading="lazy" />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                            {selectedPhotoId === photo.id && (
                              <div className="absolute top-1 left-1 bg-primary text-primary-foreground rounded-full p-0.5">
                                <Check className="h-3 w-3" />
                              </div>
                            )}
                            {photo.isShowcase && (
                              <span className="absolute top-1 right-1 bg-primary/90 text-primary-foreground text-[10px] px-1 rounded">Showcase</span>
                            )}
                            {photo.isBeforeAfter && (
                              <span className="absolute bottom-1 left-1 bg-orange-500/90 text-white text-[10px] px-1 rounded">B/A</span>
                            )}
                          </button>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {generatedPost && photos.length === 0 && (
                  <Card>
                    <CardContent className="py-6">
                      <p className="text-sm text-muted-foreground text-center" data-testid="text-no-photos">No photos uploaded for this project.</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </TabsContent>

          {/* =================== LIBRARY TAB =================== */}
          <TabsContent value="library" className="space-y-6">
            {newDraftCount > 0 && (
              <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3" data-testid="milestone-draft-notice">
                <Star className="h-5 w-5 text-primary flex-shrink-0" />
                <p className="text-sm">
                  <strong>{newDraftCount} milestone-triggered draft{newDraftCount > 1 ? "s" : ""}</strong> — Milestone completions auto-generated {newDraftCount > 1 ? "these posts" : "this post"}. Review and publish when ready.
                </p>
              </div>
            )}
            {/* Filters */}
            <div className="flex flex-wrap gap-4 items-end">
              <div className="space-y-1">
                <Label className="text-xs">Project</Label>
                <Select value={filterProject} onValueChange={setFilterProject}>
                  <SelectTrigger className="w-[200px]" data-testid="filter-project">
                    <SelectValue placeholder="All Projects" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Projects</SelectItem>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Platform</Label>
                <Select value={filterPlatform} onValueChange={setFilterPlatform}>
                  <SelectTrigger className="w-[150px]" data-testid="filter-platform">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="instagram">Instagram</SelectItem>
                    <SelectItem value="facebook">Facebook</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Status</Label>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-[150px]" data-testid="filter-status">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="ready">Ready</SelectItem>
                    <SelectItem value="posted">Posted</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={libraryPosts.length === 0 || exportingIds.size > 0}
                onClick={() => exportToDrive(libraryPosts.filter(p => p.status !== "posted").map(p => p.id))}
                data-testid="button-export-all-drive"
              >
                <CloudUpload className="mr-2 h-4 w-4" />
                {exportingIds.size > 0 ? "Exporting…" : "Export All to Drive"}
              </Button>
            </div>

            {libraryLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : libraryPosts.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Library className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                  <p className="text-muted-foreground">No posts in your library yet.</p>
                  <p className="text-sm text-muted-foreground mt-1">Generate some content on the Generate tab to get started.</p>
                  <Button variant="outline" className="mt-4" onClick={() => setActiveTab("generate")} data-testid="button-go-generate">
                    <Sparkles className="mr-2 h-4 w-4" /> Start Generating
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {libraryPosts.map((post) => (
                  <Card key={post.id} className={`relative transition-opacity ${post.status === "posted" ? "opacity-60" : ""}`} data-testid={`library-post-${post.id}`}>
                    {post.photoUrl && (
                      <div className="h-40 overflow-hidden rounded-t-lg">
                        <img src={post.photoUrl} alt={post.title} className="w-full h-full object-cover" />
                      </div>
                    )}
                    <CardContent className={`space-y-3 ${post.photoUrl ? "pt-3" : "pt-5"}`}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant={getStatusColour(post.status)} className="capitalize" data-testid={`status-${post.id}`}>
                          {post.status}
                        </Badge>
                        <Badge variant="outline" className="capitalize">{post.platform}</Badge>
                        {post.tone && <Badge variant="secondary" className="text-xs">{post.tone}</Badge>}
                      </div>
                      <h3 className="font-medium text-sm line-clamp-1">{post.title}</h3>
                      <p className="text-xs text-muted-foreground line-clamp-3 leading-5">{post.copy}</p>
                      <p className="text-xs text-muted-foreground">{getProjectName(post.projectId)}</p>
                      <div className="flex gap-2 flex-wrap pt-1">
                        <Button size="sm" variant="ghost" onClick={() => openEditDialog(post)} data-testid={`edit-post-${post.id}`}>
                          <Edit3 className="h-3.5 w-3.5 mr-1" /> Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            await navigator.clipboard.writeText(post.copy);
                            toast({ title: "Copied" });
                          }}
                          data-testid={`copy-post-${post.id}`}
                        >
                          <Copy className="h-3.5 w-3.5 mr-1" /> Copy
                        </Button>
                        {post.status === "draft" && (
                          <Button size="sm" variant="ghost" onClick={() => updatePostMutation.mutate({ id: post.id, updates: { status: "ready" } })} data-testid={`ready-post-${post.id}`}>
                            <Check className="h-3.5 w-3.5 mr-1" /> Ready
                          </Button>
                        )}
                        {post.status === "ready" && (
                          <Button size="sm" variant="ghost" onClick={() => updatePostMutation.mutate({ id: post.id, updates: { status: "posted" } })} data-testid={`posted-post-${post.id}`}>
                            <Check className="h-3.5 w-3.5 mr-1" /> Posted
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={exportingIds.has(post.id)}
                          onClick={() => exportToDrive([post.id])}
                          data-testid={`drive-post-${post.id}`}
                        >
                          <CloudUpload className="h-3.5 w-3.5 mr-1" /> Drive
                        </Button>
                        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => deletePostMutation.mutate(post.id)} data-testid={`delete-post-${post.id}`}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>

      {/* Edit dialog */}
      <Dialog open={!!editingPost} onOpenChange={(open) => !open && setEditingPost(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="uppercase tracking-wide">Edit Post</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} data-testid="input-edit-title" />
            </div>
            <div className="space-y-2">
              <Label>Caption</Label>
              <Textarea value={editCopy} onChange={(e) => setEditCopy(e.target.value)} rows={10} data-testid="input-edit-copy" />
            </div>
            {editingPost && (
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={editingPost.status}
                  onValueChange={(v) => setEditingPost({ ...editingPost, status: v })}
                >
                  <SelectTrigger data-testid="select-edit-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="ready">Ready</SelectItem>
                    <SelectItem value="posted">Posted</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Paired Photo</Label>
              {editPhotos.length > 0 ? (
                <div className="flex gap-2 overflow-x-auto pb-2" data-testid="edit-photo-gallery">
                  <button
                    onClick={() => { setEditPhotoId(null); setEditPhotoUrl(null); }}
                    className={`flex-shrink-0 rounded-lg border-2 p-2 text-xs text-muted-foreground ${!editPhotoId ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}`}
                    data-testid="edit-photo-none"
                  >
                    No Photo
                  </button>
                  {editPhotos.map((photo) => (
                    <button
                      key={photo.id}
                      onClick={() => { setEditPhotoId(photo.id); setEditPhotoUrl(photo.url); }}
                      className={`relative flex-shrink-0 rounded-lg overflow-hidden border-2 transition-colors ${editPhotoId === photo.id ? "border-primary" : "border-border hover:border-primary/50"}`}
                      data-testid={`edit-photo-${photo.id}`}
                    >
                      <img src={photo.url} alt={photo.caption || "Photo"} className="h-16 w-16 object-cover" />
                      {editPhotoId === photo.id && (
                        <div className="absolute top-0.5 left-0.5 bg-primary text-primary-foreground rounded-full p-0.5">
                          <Check className="h-2.5 w-2.5" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No photos available for this project.</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingPost(null)}>Cancel</Button>
            <Button onClick={() => {
              if (!editingPost) return;
              updatePostMutation.mutate({
                id: editingPost.id,
                updates: { title: editTitle, copy: editCopy, status: editingPost.status, photoId: editPhotoId, photoUrl: editPhotoUrl },
              });
              setEditingPost(null);
            }} data-testid="button-save-edit">
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lightbox */}
      {lightboxIndex !== null && photos[lightboxIndex] && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setLightboxIndex(null)} data-testid="lightbox-overlay">
          <div className="relative max-w-4xl max-h-[90vh] w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="absolute -top-12 right-0 text-white hover:bg-white/20" onClick={() => setLightboxIndex(null)} data-testid="button-lightbox-close">
              <X className="h-6 w-6" />
            </Button>
            {lightboxIndex > 0 && (
              <Button variant="ghost" size="icon" className="absolute left-2 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 z-10" onClick={() => setLightboxIndex(lightboxIndex - 1)} data-testid="button-lightbox-prev">
                <ChevronLeft className="h-8 w-8" />
              </Button>
            )}
            {lightboxIndex < photos.length - 1 && (
              <Button variant="ghost" size="icon" className="absolute right-2 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 z-10" onClick={() => setLightboxIndex(lightboxIndex + 1)} data-testid="button-lightbox-next">
                <ChevronRight className="h-8 w-8" />
              </Button>
            )}
            <img src={photos[lightboxIndex].url} alt={photos[lightboxIndex].caption || "Project photo"} className="w-full h-auto max-h-[80vh] object-contain rounded-lg" data-testid="img-lightbox-photo" />
            {(photos[lightboxIndex].caption || photos[lightboxIndex].tags.length > 0) && (
              <div className="mt-3 text-center">
                {photos[lightboxIndex].caption && <p className="text-white text-sm" data-testid="text-lightbox-caption">{photos[lightboxIndex].caption}</p>}
                {photos[lightboxIndex].tags.length > 0 && (
                  <div className="flex justify-center gap-1.5 mt-1.5 flex-wrap" data-testid="lightbox-tags">
                    {photos[lightboxIndex].tags.map((tag, idx) => (
                      <Badge key={`${tag}-${idx}`} variant="secondary" className="text-xs">{tag}</Badge>
                    ))}
                  </div>
                )}
              </div>
            )}
            <p className="text-white/60 text-xs text-center mt-2" data-testid="text-lightbox-counter">{lightboxIndex + 1} of {photos.length}</p>
          </div>
        </div>
      )}
    </div>
  );
}
