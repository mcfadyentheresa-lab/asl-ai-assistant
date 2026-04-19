import { motion } from "framer-motion";
import { ProjectCard } from "@/components/project/ProjectCard";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { FolderOpen, Briefcase } from "lucide-react";
import type { Project } from "@shared/schema";

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

export function AdminDashboardView({
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
