import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { MapPin, MoreVertical, Archive, Trash2, User, Palette } from "lucide-react";
import { Link } from "wouter";
import type { Project } from "@shared/schema";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ColorPalettePicker, ColorTagDot } from "@/components/ColorPalettePicker";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ProjectCardProps {
  project: Project;
  onArchive?: (id: number) => void;
  onDelete?: (id: number) => void;
  clientName?: string | null;
}

const statusLabel: Record<string, string> = {
  planning: "Planning",
  in_progress: "In Progress",
  completed: "Completed",
  archived: "Archived",
};

export function ProjectCard({ project, onArchive, onDelete, clientName }: ProjectCardProps) {
  const { toast } = useToast();
  const budget = project.totalBudget || 0;
  const used = project.budgetUsed || 0;
  const pct = budget > 0 ? Math.round((used / budget) * 100) : 0;

  const handleColorTag = async (colorId: number | null) => {
    try {
      await fetch(`/api/projects/${project.id}/color-tag`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ colorTagId: colorId }),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({ title: colorId ? "Color tag set" : "Color tag removed" });
    } catch {
      toast({ title: "Error", description: "Failed to update color tag", variant: "destructive" });
    }
  };

  return (
    <div className="relative group">
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
            <div className="absolute bottom-3 left-3 flex items-center gap-2">
              <Badge variant="secondary" data-testid={`badge-status-${project.id}`}>
                {statusLabel[project.status] || project.status}
              </Badge>
              {project.colorTagId && (
                <ColorTagDot colorTagId={project.colorTagId} size="md" />
              )}
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

            {clientName && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <User className="h-3 w-3 flex-shrink-0" />
                <span data-testid={`text-client-${project.id}`}>{clientName}</span>
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

      <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
        <div onClick={(e) => e.preventDefault()}>
          <ColorPalettePicker
            selectedColorId={project.colorTagId ?? null}
            onSelect={(colorId) => handleColorTag(colorId)}
            trigger={
              <Button
                size="icon"
                variant="secondary"
                className="opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 transition-opacity"
                data-testid={`button-color-tag-${project.id}`}
              >
                {project.colorTagId ? (
                  <ColorTagDot colorTagId={project.colorTagId} size="md" />
                ) : (
                  <Palette className="h-4 w-4" />
                )}
              </Button>
            }
          />
        </div>
        {(onArchive || onDelete) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="secondary"
                className="opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 transition-opacity"
                onClick={(e) => e.preventDefault()}
                data-testid={`button-project-menu-${project.id}`}
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onArchive && project.status !== "archived" && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onArchive(project.id);
                  }}
                  data-testid={`button-archive-${project.id}`}
                >
                  <Archive className="mr-2 h-4 w-4" />
                  Archive
                </DropdownMenuItem>
              )}
              {onDelete && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onDelete(project.id);
                  }}
                  className="text-destructive"
                  data-testid={`button-delete-${project.id}`}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}
