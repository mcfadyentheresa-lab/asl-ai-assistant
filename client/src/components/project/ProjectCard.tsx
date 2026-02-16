import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ArrowRight, Calendar, CheckCircle2 } from "lucide-react";
import { Link } from "wouter";
import type { Project } from "@shared/schema";
import { format } from "date-fns";

interface ProjectCardProps {
  project: Project;
}

export function ProjectCard({ project }: ProjectCardProps) {
  // Mock progress calculation
  const progress = project.status === "completed" ? 100 : project.status === "in_progress" ? 45 : 10;

  return (
    <Card className="group overflow-hidden border-border/50 bg-card transition-all duration-300 hover:shadow-xl hover:shadow-primary/5 hover:-translate-y-1">
      <div className="relative h-48 w-full overflow-hidden bg-secondary">
        {project.thumbnailUrl ? (
          <img 
            src={project.thumbnailUrl} 
            alt={project.name}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-secondary/50">
            {/* abstract architectural pattern or simple color block */}
            <div className="h-full w-full bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-secondary via-background to-secondary" />
          </div>
        )}
        <div className="absolute top-4 right-4">
          <Badge 
            variant="secondary" 
            className="backdrop-blur-md bg-white/90 text-primary shadow-sm font-medium tracking-wide uppercase text-[10px]"
          >
            {project.status.replace("_", " ")}
          </Badge>
        </div>
      </div>

      <CardHeader className="pt-6">
        <h3 className="font-display text-2xl font-semibold text-primary">{project.name}</h3>
        <p className="line-clamp-2 text-sm text-muted-foreground">
          {project.description || "A custom residential project by Aster & Spruce."}
        </p>
      </CardHeader>

      <CardContent>
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-medium text-muted-foreground">
              <span>Progress</span>
              <span>{progress}%</span>
            </div>
            <Progress value={progress} className="h-1.5" />
          </div>

          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            {project.startDate && (
              <div className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                <span>Started {format(new Date(project.startDate), "MMM d, yyyy")}</span>
              </div>
            )}
            {project.status === "completed" && (
              <div className="flex items-center gap-1.5 text-primary">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Completed</span>
              </div>
            )}
          </div>
        </div>
      </CardContent>

      <CardFooter className="pt-2">
        <Link href={`/project/${project.id}`} className="w-full">
          <Button className="w-full group-hover:bg-primary/90">
            View Project Hub
            <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Button>
        </Link>
      </CardFooter>
    </Card>
  );
}
