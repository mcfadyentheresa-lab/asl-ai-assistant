import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronRight, Activity } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface RecentActivityCardProps {
  user: any;
  activityLog: any[];
  seenLocally: Set<number>;
  setActiveTab: (tab: string) => void;
}

const typeStyles: Record<string, { dot: string; tab: string | null; label: string }> = {
  milestone_created: { dot: "bg-blue-500", tab: "checklist", label: "View Progress" },
  photo_uploaded: { dot: "bg-emerald-500", tab: "photos", label: "View Photos" },
  document_uploaded: { dot: "bg-amber-500", tab: "docs", label: "View Documents" },
  notification_sent: { dot: "bg-purple-500", tab: null, label: "" },
  message_sent: { dot: "bg-sky-500", tab: "chat", label: "View Chat" },
  calendar_event_created: { dot: "bg-rose-500", tab: "calendar", label: "View Calendar" },
  task_created: { dot: "bg-teal-500", tab: "checklist", label: "View Progress" },
};

export function RecentActivityCard({ user, activityLog, seenLocally, setActiveTab }: RecentActivityCardProps) {
  const [showAll, setShowAll] = useState(false);

  const missedEntries = activityLog?.filter((e: any) =>
    e.userId !== user?.id && !e.views?.some((v: any) => v.userId === user?.id) && !seenLocally.has(e.id)
  ) || [];
  const seenEntries = activityLog?.filter((e: any) =>
    e.userId === user?.id || e.views?.some((v: any) => v.userId === user?.id) || seenLocally.has(e.id)
  ) || [];

  const allEntries = [...missedEntries, ...seenEntries];
  const visibleCount = showAll ? allEntries.length : 3;
  const visibleEntries = allEntries.slice(0, visibleCount);
  const hasMore = allEntries.length > 3;

  if (allEntries.length === 0) {
    return (
      <Card data-testid="card-recent-activity">
        <CardHeader className="p-5 pb-3">
          <CardTitle className="font-sans text-base font-semibold flex items-center gap-2" data-testid="text-activity-heading">
            <Activity className="h-4 w-4 text-muted-foreground" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent className="p-5 pt-0">
          <p className="text-muted-foreground text-sm" data-testid="text-no-activity">No recent activity</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-recent-activity">
      <CardHeader className="p-5 pb-3">
        <CardTitle className="font-sans text-base font-semibold flex items-center gap-2 flex-wrap" data-testid="text-activity-heading">
          <Activity className="h-4 w-4 text-muted-foreground" />
          Recent Activity
          {missedEntries.length > 0 && (
            <Badge variant="destructive" className="text-[10px] ml-1" data-testid="badge-missed-count">
              {missedEntries.length} new
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-5 pt-0">
        <div className="space-y-3">
          {visibleEntries.map((entry: any) => {
            const style = typeStyles[entry.type] || { dot: "bg-muted-foreground", tab: null, label: "" };
            const timeAgo = entry.createdAt ? formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true }) : "";
            const isMissed = entry.userId !== user?.id && !entry.views?.some((v: any) => v.userId === user?.id) && !seenLocally.has(entry.id);
            const isClickable = !!style.tab;
            return (
              <div
                key={entry.id}
                className={`flex items-start gap-3 text-sm pb-3 border-b border-border/60 last:border-0 last:pb-0 ${isClickable ? "cursor-pointer rounded-sm -mx-1 px-1 hover-elevate" : ""}`}
                data-testid={`activity-${isMissed ? "missed" : "seen"}-${entry.id}`}
                onClick={isClickable ? () => setActiveTab(style.tab!) : undefined}
                role={isClickable ? "button" : undefined}
                tabIndex={isClickable ? 0 : undefined}
              >
                <div className="relative mt-1.5 flex-shrink-0">
                  <div className={`h-2 w-2 rounded-full ${style.dot}`} />
                  {isMissed && <span className="absolute -top-1 -right-1 h-1.5 w-1.5 rounded-full bg-destructive" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className={`truncate ${isMissed ? "font-semibold text-foreground" : "text-foreground"}`}>{entry.title}</p>
                    {isMissed && <Badge variant="outline" className="text-[9px] py-0 px-1 border-destructive/40 text-destructive" data-testid={`badge-new-${entry.id}`}>NEW</Badge>}
                  </div>
                  {entry.description && (
                    <p className="text-muted-foreground text-xs truncate">{entry.description}</p>
                  )}
                  <span className="text-muted-foreground text-[11px] font-mono">{timeAgo}</span>
                </div>
                {isClickable && <ChevronRight className="h-3.5 w-3.5 mt-1 text-muted-foreground flex-shrink-0" />}
              </div>
            );
          })}
        </div>
        {hasMore && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="mt-3 text-xs text-primary hover:underline flex items-center gap-1 h-11 -mb-2"
            data-testid="button-toggle-activity-all"
          >
            {showAll ? "Show fewer" : `View all (${allEntries.length}) →`}
          </button>
        )}
      </CardContent>
    </Card>
  );
}
