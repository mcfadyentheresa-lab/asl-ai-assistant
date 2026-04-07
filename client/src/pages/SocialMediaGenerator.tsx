import { useEffect, useMemo, useState } from "react";
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
import { Loader2, Sparkles, Shuffle, Copy, RefreshCw, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

const tones = ["Professional", "Warm", "Behind the scenes", "Polished", "Excited"] as const;

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

  const selectedProject = useMemo(() => projects.find((p) => String(p.id) === projectId), [projects, projectId]);

  useEffect(() => {
    if (user && (user as any).role !== "admin") {
      navigate("/");
    }
  }, [user, navigate]);

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

          <Card>
            <CardHeader>
              <CardTitle className="uppercase tracking-wide">Generated Post</CardTitle>
              <CardDescription>Copy and paste this into Instagram or Facebook.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {generatedPost ? (
                <>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{generatedTitle}</Badge>
                    <Badge variant="outline">{platform}</Badge>
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
                <p className="text-sm text-muted-foreground">Your generated post will appear here.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
