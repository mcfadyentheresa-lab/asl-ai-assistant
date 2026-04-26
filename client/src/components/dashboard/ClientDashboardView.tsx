import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { PropertyPhotoBand } from "@/components/client/PropertyPhotoBand";
import { ProjectHeaderStrip } from "@/components/client/ProjectHeaderStrip";
import { ThisWeekCard } from "@/components/client/ThisWeekCard";
import { MilestoneStrip } from "@/components/client/MilestoneStrip";
import { ReferenceCardGrid } from "@/components/client/ReferenceCardGrid";

interface Project {
  id: number;
  name: string;
  status: string;
  thumbnailUrl?: string | null;
  heroFocalX?: number | null;
  heroFocalY?: number | null;
  heroZoom?: number | null;
  totalBudget?: number | null;
  budgetUsed?: number | null;
  description?: string | null;
  address?: string | null;
  city?: string | null;
  code?: string | null;
  phase?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  currentFocusText?: string | null;
  currentFocusPhotoId?: number | null;
}

interface Milestone {
  id: number;
  title: string;
  completed: boolean | null;
  date?: string | null;
  endDate?: string | null;
  order?: number | null;
}

interface Photo {
  id: number;
  url: string;
  caption?: string | null;
  isShowcase?: boolean | null;
  createdAt?: string | null;
}

interface CalendarEvent {
  id: number;
  title?: string | null;
  startTime?: string | null;
  type?: string | null;
}

interface ClientDashboardViewProps {
  project: Project;
  isAdminPreview?: boolean;
}

export function ClientDashboardView({ project, isAdminPreview = false }: ClientDashboardViewProps) {
  const { data: milestones } = useQuery<Milestone[]>({
    queryKey: [api.milestones.list.path, project.id],
    queryFn: async () => {
      const url = buildUrl(api.milestones.list.path, { projectId: project.id });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!project.id,
  });

  const { data: photos } = useQuery<Photo[]>({
    queryKey: ["client-photos", project.id],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${project.id}/photos`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!project.id,
  });

  const { data: events } = useQuery<CalendarEvent[]>({
    queryKey: ["client-events", project.id],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${project.id}/calendar-events`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!project.id,
  });

  // Photo band: project.thumbnailUrl > most recent showcase photo > most recent photo
  const sortedPhotos = [...(photos || [])].sort((a, b) => {
    const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bt - at;
  });
  const showcasePhoto = sortedPhotos.find((p) => p.isShowcase);
  const heroSrc = project.thumbnailUrl || showcasePhoto?.url || sortedPhotos[0]?.url || null;

  // This week photo: project.currentFocusPhotoId > most recent photo (excluding hero)
  const focusPhoto = project.currentFocusPhotoId
    ? sortedPhotos.find((p) => p.id === project.currentFocusPhotoId)
    : sortedPhotos.find((p) => p.url !== heroSrc);
  const focusPhotoUrl = focusPhoto?.url || null;

  // Phase fallback: project.phase > current incomplete milestone title > "Planning"
  const sortedMilestones = [...(milestones || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const activeMilestone = sortedMilestones.find((m) => !m.completed);
  const phase = project.phase || activeMilestone?.title || "Planning";

  // Last visit / next walkthrough: derive from calendar events of type "walkthrough" or "site_visit"
  const now = new Date();
  const visitEvents = (events || [])
    .filter((e) => {
      const t = (e.type || "").toLowerCase();
      return t.includes("walkthrough") || t.includes("visit") || t.includes("site");
    })
    .filter((e) => !!e.startTime)
    .sort((a, b) => new Date(a.startTime!).getTime() - new Date(b.startTime!).getTime());
  const lastVisit = visitEvents.filter((e) => new Date(e.startTime!) <= now).pop()?.startTime || null;
  const nextWalkthrough = visitEvents.find((e) => new Date(e.startTime!) > now)?.startTime || null;

  // "This week" updated date — use the focus photo's createdAt or the most recent photo
  const updatedAt = focusPhoto?.createdAt || sortedPhotos[0]?.createdAt || null;

  // Reference cards — link to existing project tabs
  const referenceCards = [
    {
      label: "Design",
      caption: "Inspiration, selections, and finishes for your home.",
      href: `/project/${project.id}?tab=board`,
      testId: "ref-card-design",
    },
    {
      label: "Documents",
      caption: "Drawings, contracts, permits, and warranties.",
      href: `/project/${project.id}?tab=documents`,
      testId: "ref-card-documents",
    },
    {
      label: "Messages",
      caption: "Talk with the Aster & Spruce team.",
      href: `/project/${project.id}?tab=messages`,
      testId: "ref-card-messages",
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="w-full"
      data-testid="client-dashboard-view"
      data-role="client"
    >
      {isAdminPreview && (
        <p
          className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase px-4 md:px-8 lg:px-12 pt-3"
          data-testid="text-client-preview-notice"
        >
          Client view preview — this is what your client sees.
        </p>
      )}

      <PropertyPhotoBand
        src={heroSrc}
        projectName={project.name}
        city={project.city || project.address}
      />

      <ProjectHeaderStrip
        code={project.code}
        status={project.status}
        name={project.name}
        phase={phase}
        startDate={project.startDate}
        endDate={project.endDate}
        lastVisit={lastVisit}
        nextWalkthrough={nextWalkthrough}
      />

      <ThisWeekCard
        focusText={project.currentFocusText}
        focusPhotoUrl={focusPhotoUrl}
        updatedAt={updatedAt}
        fallbackText={
          activeMilestone
            ? `Currently working on ${activeMilestone.title.toLowerCase()}.`
            : undefined
        }
      />

      {sortedMilestones.length > 0 && <MilestoneStrip milestones={sortedMilestones} />}

      <ReferenceCardGrid cards={referenceCards} />

      <footer className="px-4 md:px-8 lg:px-12 py-6 border-t border-border/60">
        <p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
          Aster &amp; Spruce Living · West Vancouver
        </p>
      </footer>
    </motion.div>
  );
}
