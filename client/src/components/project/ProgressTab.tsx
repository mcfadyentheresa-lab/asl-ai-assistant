import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import GanttChart from "@/components/GanttChart";
import CalendarPanel from "@/components/CalendarPanel";
import { useAuth } from "@/hooks/use-auth";
import { useViewMode } from "@/hooks/use-view-mode";

interface ProgressTabProps {
  projectId: number;
  milestones: any[];
  sections: any[];
  tasks: any[];
  userRole: string;
  subTab: "gantt" | "calendar";
  onSubTabChange: (v: "gantt" | "calendar") => void;
}

export function ProgressTab({ projectId, milestones, sections, tasks, userRole, subTab, onSubTabChange }: ProgressTabProps) {
  const { user } = useAuth();
  const { viewMode } = useViewMode();
  const actualRole = user?.role || "client";
  const effectiveRole = actualRole === "admin" ? viewMode : actualRole;

  return (
    <div className="space-y-4" data-testid="progress-tab">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="space-y-0.5">
          <h2 className="font-serif text-lg font-semibold uppercase tracking-wide text-foreground" data-testid="text-progress-heading">
            Progress
          </h2>
        </div>
        <div>
          <Select value={subTab} onValueChange={(value) => onSubTabChange(value as "gantt" | "calendar")}>
            <SelectTrigger className="h-8 w-full sm:w-32" data-testid="select-progress-view">
              <SelectValue placeholder="Select view" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="gantt">Timeline</SelectItem>
              <SelectItem value="calendar">Calendar</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {subTab === "gantt" && (
        <GanttChart projectId={projectId} milestones={milestones} sections={sections || []} tasks={tasks} userRole={userRole} />
      )}
      {subTab === "calendar" && (
        <CalendarPanel projectId={projectId} effectiveRole={effectiveRole} />
      )}
    </div>
  );
}
