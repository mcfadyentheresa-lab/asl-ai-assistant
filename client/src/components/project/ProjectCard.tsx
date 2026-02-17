import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { MapPin } from "lucide-react";
import { Link } from "wouter";
import type { Project } from "@shared/schema";

interface ProjectCardProps {
  project: Project;
}

const statusLabel: Record<string, string> = {
  planning: "Planning",
  in_progress: "In Progress",
  completed: "Completed",
};

export function ProjectCard({ project }: ProjectCardProps) {
  const budget = project.totalBudget || 0;
  const used = project.budgetUsed || 0;
  const pct = budget > 0 ? Math.round((used / budget) * 100) : 0;

  return (
    <Link href={`/project/${project.id}`} data-testid={`link-project-${project.id}`}>
      <Card
        className="overflow-visible cursor-pointer hover-elevate transition-shadow"
        data-testid={`card-project-${project.id}`}
      >
        <div className="relative h-44 overflow-hidden rounded-t-xl">
          {project.thumbnailUrl ? (
            <img
              src={project.thumbnailUrl}
              alt={project.name}
              className="h-full w-full object-cover"
              data-testid={`img-project-${project.id}`}
            />
          ) : (
            <div className="h-full w-full bg-muted" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
          <div className="absolute bottom-3 left-3">
            <Badge variant="secondary" data-testid={`badge-status-${project.id}`}>
              {statusLabel[project.status] || project.status}
            </Badge>
          </div>
        </div>

        <CardContent className="p-5 space-y-3">
          <h3 className="font-serif text-lg font-semibold text-foreground leading-tight" data-testid={`text-project-name-${project.id}`}>
            {project.name}
          </h3>

          {project.address && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3 flex-shrink-0" />
              <span data-testid={`text-address-${project.id}`}>{project.address}</span>
            </div>
          )}

          {budget > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Budget</span>
                <span data-testid={`text-budget-${project.id}`}>
                  ${used.toLocaleString()} / ${budget.toLocaleString()}
                </span>
              </div>
              <Progress value={pct} className="h-1.5" data-testid={`progress-budget-${project.id}`} />
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
