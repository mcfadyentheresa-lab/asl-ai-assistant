import { motion } from "framer-motion";
import { ProjectCard } from "@/components/project/ProjectCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, History, ArrowRight, Image } from "lucide-react";
import { FolderOpen, Briefcase } from "lucide-react";
import { Link } from "wouter";
import type { Project } from "@shared/schema";
import { useRecentProjects } from "@/hooks/use-recent-projects";

interface AdminDashboardViewProps {
  projects: Project[] | undefined;
  filteredProjects: Project[] | undefined;
  activeProjects: Project[];
  completedProjects: Project[];
  onlineCrew: { userId: string; role?: string | null }[];
  userMap: Map<string, string>;
  onArchive: (id: number) => void;
  onDeleteRequest: (id: number) => void;
  onNewProject: () => void;
  canCreateProjects: boolean;
  showArchived: boolean;
}

const statusLabel: Record<string, string> = {
  planning: "Planning",
  in_progress: "In Progress",
  completed: "Completed",
  archived: "Archived",
};

const statusVariant: Record<string, "secondary" | "outline" | "default"> = {
  planning: "secondary",
  in_progress: "default",
  completed: "secondary",
  archived: "outline",
};

export function AdminDashboardView({
  projects,
  filteredProjects,
  activeProjects,
  completedProjects,
  onlineCrew,
  userMap,
  onArchive,
  onDeleteRequest,
  onNewProject,
  canCreateProjects,
  showArchived,
}: AdminDashboardViewProps) {
  const { recentProjects } = useRecentProjects();

  const recentWithData = recentProjects
    .map((r) => projects?.find((p) => p.id === r.id))
    .filter((p): p is Project => p !== undefined)
    .slice(0, 3);

  return (
    <div data-testid="admin-dashboard-view">
      <div className="grid grid-cols-3 gap-1.5 sm:gap-2 mb-5" data-testid="admin-stats-strip">
        <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-2.5 py-1.5 rounded-md bg-muted/40 border border-border/40 min-w-0">
          <FolderOpen className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-[11px] sm:text-xs font-medium text-foreground truncate">{activeProjects.length} Active</span>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-2.5 py-1.5 rounded-md bg-muted/40 border border-border/40 min-w-0">
          <Briefcase className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-[11px] sm:text-xs font-medium text-foreground truncate">{completedProjects.length} Done</span>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-2.5 py-1.5 rounded-md bg-muted/40 border border-border/40 min-w-0">
          {onlineCrew.length > 0 ? (
            <div className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </div>
          ) : (
            <div className="h-2 w-2 rounded-full bg-muted-foreground/30 shrink-0" />
          )}
          <span className="text-[11px] sm:text-xs font-medium text-foreground truncate">{onlineCrew.length} Online</span>
        </div>
      </div>

      {recentWithData.length > 0 && (
        <div className="mb-8" data-testid="jump-back-in-section">
          <div className="flex items-center gap-2 mb-3">
            <History className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium tracking-widest uppercase text-muted-foreground">Jump back in</span>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
            {recentWithData.map((project, idx) => (
              <motion.div
                key={project.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.06 }}
                className="flex-shrink-0 w-56"
              >
                <Link href={`/project/${project.id}`} data-testid={`link-recent-project-${project.id}`}>
                  <div
                    className="group flex flex-col rounded-xl border border-border/60 bg-card hover:bg-muted/30 hover:border-border transition-colors cursor-pointer overflow-hidden"
                    data-testid={`card-recent-project-${project.id}`}
                  >
                    {project.thumbnailUrl ? (
                      <img
                        src={project.thumbnailUrl}
                        alt={project.name}
                        className="w-full h-24 object-cover"
                        data-testid={`img-recent-thumbnail-${project.id}`}
                      />
                    ) : (
                      <div
                        className="w-full h-24 bg-muted/40 flex items-center justify-center"
                        data-testid={`placeholder-recent-thumbnail-${project.id}`}
                      >
                        <Image className="h-6 w-6 text-muted-foreground/30" />
                      </div>
                    )}
                    <div className="flex flex-col gap-2 p-3.5">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-medium text-foreground leading-snug line-clamp-2" data-testid={`text-recent-project-name-${project.id}`}>
                          {project.name}
                        </span>
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <Badge
                        variant={statusVariant[project.status] ?? "secondary"}
                        className="w-fit text-[10px] px-1.5 py-0 h-5 no-default-hover-elevate"
                        data-testid={`badge-recent-status-${project.id}`}
                      >
                        {statusLabel[project.status] || project.status}
                      </Badge>
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {filteredProjects && filteredProjects.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {filteredProjects.map((project, idx) => (
            <motion.div
              key={project.id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.07 }}
            >
              <ProjectCard
                project={project}
                onArchive={onArchive}
                onDelete={onDeleteRequest}
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
              <h3 className="font-serif text-xl font-semibold text-foreground mb-2 text-center">No projects yet</h3>
              <p className="text-muted-foreground mb-6 text-center max-w-xs">Create your first project to get started.</p>
              <Button onClick={onNewProject} data-testid="button-create-first-project">
                <Plus className="mr-2 h-4 w-4" />
                New Project
              </Button>
            </>
          ) : (
            <>
              <h3 className="font-serif text-xl font-semibold text-foreground mb-2 text-center">No projects yet</h3>
              <p className="text-muted-foreground text-center max-w-xs">Your team will add you to a project soon.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
