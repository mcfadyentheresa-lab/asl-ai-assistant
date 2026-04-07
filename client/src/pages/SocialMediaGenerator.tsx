import { useEffect, useMemo, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { Navbar } from "@/components/layout/Navbar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useProjects } from "@/hooks/use-projects";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, Sparkles, Shuffle, Copy, RefreshCw, ArrowLeft, X, ImageIcon, ChevronLeft, ChevronRight } from "lucide-react";
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

export default function SocialMediaGenerator() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { data: projects = [], isLoading } = useProjects();
  const [projectId, setProjectId] = useState<string>("");
  const [platform, setPlatform] = useState<"instagram" | "facebook">("instagram");
  const [tone, setTone] = useState<string>("Warm");
  const [focus, setFocus] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedPost, setGeneratedPost] = useState("");
  const [generatedTitle, setGeneratedTitle] = useState("");
  const [generatedPlatform, setGeneratedPlatform] = useState<string>("");
  const [photos, setPhotos] = useState<SocialPhoto[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const selectedProject = useMemo(() => projects.find((p) => String(p.id) === projectId), [projects, projectId]);

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
      });
      const data = await res.json();
      setGeneratedTitle(data.title || `${chosenProject.name} post`);
      setGeneratedPost(data.copy || "");
      setGeneratedPlatform(data.platform || platform);
      setPhotos(data.photos || []);
    } catch {
      toast({ title: "Generation failed", description: "Could not create a social post.", variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  }

  async function copyPost() {
    if (!generatedPost) return;
    await navigator.clipboard.writeText(generatedPost);
    toast({ title: "Copied", description: "Post copy was copied to your clipboard." });
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
          <h1 className="font-serif text-3xl uppercase tracking-wide text-foreground" data-testid="text-social-heading">Social Media Generator</h1>
          <p className="text-muted-foreground">Generate Instagram and Facebook copy from project details.</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
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
                    <SelectValue placeholder={isLoading ? "Loading projects" : "Choose a project"} />
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
                  <Select value={platform} onValueChange={(value) => setPlatform(value as "instagram" | "facebook")}>
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
              <div className="flex gap-3">
                <Button onClick={() => generatePost(false)} disabled={isGenerating || !projectId} data-testid="button-generate-social">
                  {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                  Generate
                </Button>
                <Button variant="outline" onClick={() => generatePost(true)} disabled={isGenerating || projects.length === 0} data-testid="button-generate-random-social">
                  <Shuffle className="mr-2 h-4 w-4" />
                  Random
                </Button>
              </div>
            </CardContent>
          </Card>

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
                      <Badge variant="outline" data-testid="badge-social-platform">{generatedPlatform}</Badge>
                    </div>
                    <div className="whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-4 text-sm leading-6" data-testid="text-generated-social-post">
                      {generatedPost}
                    </div>
                    <div className="flex gap-3">
                      <Button onClick={copyPost} variant="outline" data-testid="button-copy-social-post">
                        <Copy className="mr-2 h-4 w-4" />
                        Copy
                      </Button>
                      <Button onClick={() => generatePost(false)} variant="secondary" disabled={isGenerating || !projectId} data-testid="button-regenerate-social-post">
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Regenerate
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground" data-testid="text-social-placeholder">Your generated post will appear here.</p>
                )}
              </CardContent>
            </Card>

            {generatedPost && (
              <Card>
                <CardHeader>
                  <CardTitle className="uppercase tracking-wide flex items-center gap-2">
                    <ImageIcon className="h-5 w-5" />
                    Project Photos
                  </CardTitle>
                  <CardDescription>Choose a photo to pair with your post.</CardDescription>
                </CardHeader>
                <CardContent>
                  {photos.length > 0 ? (
                    <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1" data-testid="gallery-social-photos">
                      {photos.map((photo, index) => (
                        <button
                          key={photo.id}
                          onClick={() => setLightboxIndex(index)}
                          className="group relative flex-shrink-0 rounded-lg overflow-hidden border border-border hover:border-primary/50 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50"
                          data-testid={`photo-thumbnail-${photo.id}`}
                        >
                          <img
                            src={photo.url}
                            alt={photo.caption || "Project photo"}
                            className="h-24 w-24 object-cover"
                            loading="lazy"
                          />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                          {photo.isShowcase && (
                            <span className="absolute top-1 right-1 bg-primary/90 text-primary-foreground text-[10px] px-1 rounded" data-testid={`badge-showcase-${photo.id}`}>
                              Showcase
                            </span>
                          )}
                          {photo.isBeforeAfter && (
                            <span className="absolute bottom-1 left-1 bg-orange-500/90 text-white text-[10px] px-1 rounded" data-testid={`badge-before-after-${photo.id}`}>
                              B/A
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground" data-testid="text-no-photos">
                      No photos uploaded for this project.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>

      {lightboxIndex !== null && photos[lightboxIndex] && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setLightboxIndex(null)}
          data-testid="lightbox-overlay"
        >
          <div className="relative max-w-4xl max-h-[90vh] w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="icon"
              className="absolute -top-12 right-0 text-white hover:bg-white/20"
              onClick={() => setLightboxIndex(null)}
              data-testid="button-lightbox-close"
            >
              <X className="h-6 w-6" />
            </Button>

            {lightboxIndex > 0 && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute left-2 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 z-10"
                onClick={() => setLightboxIndex(lightboxIndex - 1)}
                data-testid="button-lightbox-prev"
              >
                <ChevronLeft className="h-8 w-8" />
              </Button>
            )}

            {lightboxIndex < photos.length - 1 && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 z-10"
                onClick={() => setLightboxIndex(lightboxIndex + 1)}
                data-testid="button-lightbox-next"
              >
                <ChevronRight className="h-8 w-8" />
              </Button>
            )}

            <img
              src={photos[lightboxIndex].url}
              alt={photos[lightboxIndex].caption || "Project photo"}
              className="w-full h-auto max-h-[80vh] object-contain rounded-lg"
              data-testid="img-lightbox-photo"
            />

            {(photos[lightboxIndex].caption || photos[lightboxIndex].tags.length > 0) && (
              <div className="mt-3 text-center">
                {photos[lightboxIndex].caption && (
                  <p className="text-white text-sm" data-testid="text-lightbox-caption">{photos[lightboxIndex].caption}</p>
                )}
                {photos[lightboxIndex].tags.length > 0 && (
                  <div className="flex justify-center gap-1.5 mt-1.5 flex-wrap" data-testid="lightbox-tags">
                    {photos[lightboxIndex].tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs" data-testid={`badge-lightbox-tag-${tag}`}>{tag}</Badge>
                    ))}
                  </div>
                )}
              </div>
            )}

            <p className="text-white/60 text-xs text-center mt-2" data-testid="text-lightbox-counter">
              {lightboxIndex + 1} of {photos.length}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
