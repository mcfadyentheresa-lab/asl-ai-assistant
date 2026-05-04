import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Home,
  LayoutDashboard,
  FolderOpen,
  Palette,
  DollarSign,
  Users,
  Sparkles,
  Clock,
  CalendarDays,
  CheckSquare,
  MessageSquare,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import { useTenantBrand } from "@/hooks/use-tenant-brand";

interface Step {
  icon: React.ReactNode;
  title: string;
  description: string;
}

function getSteps(role: string, firstName: string | null | undefined, brandName: string): Step[] {
  const name = firstName ? `, ${firstName}` : "";

  if (role === "admin") {
    return [
      {
        icon: <Home className="h-12 w-12" />,
        title: `Welcome to ASL Connect${name}`,
        description:
          `Your all-in-one portal for managing ${brandName} projects. Everything your team and clients need — delivered from one place.`,
      },
      {
        icon: <LayoutDashboard className="h-12 w-12" />,
        title: "Your Dashboard",
        description:
          "See all active projects, team presence, and key stats at a glance. Use the view toggle in the top bar to preview exactly what your crew and clients see.",
      },
      {
        icon: <FolderOpen className="h-12 w-12" />,
        title: "Project Pages",
        description:
          "Each project has its own workspace with tabs for Overview, Progress, Planning Board, Furniture, Photos, Documents, and Messages. Everything for a project lives here.",
      },
      {
        icon: <Palette className="h-12 w-12" />,
        title: "Planning Board & Furniture",
        description:
          "Use the spatial Planning Board for design collaboration with your team. The Furniture tab lets you build detailed redesign concepts with dimensions, materials, and structural guidance.",
      },
      {
        icon: <DollarSign className="h-12 w-12" />,
        title: "Cost Estimator",
        description:
          "Build itemised estimates per project with material markup, market rate benchmarks, and an AI scope analyser. Open it from the Budget Snapshot card on any project's Overview tab.",
      },
      {
        icon: <Users className="h-12 w-12" />,
        title: "Crew & Trade",
        description:
          "Manage crew pay rates, your subcontractor directory, and market rate benchmarks all in one page. Find it under your profile menu.",
      },
      {
        icon: <Sparkles className="h-12 w-12" />,
        title: "Social Media & Tools",
        description:
          "Generate AI-powered captions for project photos, manage your content library, track approval status, and export posts directly to Google Drive — all under Social Media in your menu.",
      },
    ];
  }

  if (role === "crew") {
    return [
      {
        icon: <Home className="h-12 w-12" />,
        title: `Welcome to ASL Connect${name}`,
        description:
          `Your team portal for ${brandName} projects. See your daily assignments, log your hours, and stay in sync with the team from any device.`,
      },
      {
        icon: <CheckSquare className="h-12 w-12" />,
        title: "Your Day at a Glance",
        description:
          "Your dashboard shows today's tasks, all open assignments, and upcoming events. Update a task's status — To Do, In Progress, Done — directly from the list without opening the full project.",
      },
      {
        icon: <Clock className="h-12 w-12" />,
        title: "Log Hours",
        description:
          "Track your time under Timesheets. Enter hours per project, submit at the end of each pay period, and your admin will handle approval. Use the quick link on your dashboard or the menu.",
      },
      {
        icon: <FolderOpen className="h-12 w-12" />,
        title: "Project Tabs",
        description:
          "Inside each project: review Progress and milestones, collaborate on the Planning Board, upload or browse Photos, and send Messages directly to your team.",
      },
      {
        icon: <CalendarDays className="h-12 w-12" />,
        title: "Master Calendar",
        description:
          "See all scheduled milestones, tasks, and events across every project in one unified view. Great for planning your week and spotting upcoming deadlines early.",
      },
    ];
  }

  // client
  return [
    {
      icon: <Home className="h-12 w-12" />,
      title: `Welcome to your renovation portal${name}`,
      description:
        `${brandName} has set up this space just for your project. Five surfaces make up your portal: Plan, Updates, Design Board, Documents, and Messages — that's it.`,
    },
    {
      icon: <LayoutDashboard className="h-12 w-12" />,
      title: "Plan",
      description:
        "Your home page. A calm, vertical view of where your project is right now: current focus, milestones, recent decisions, selections in flight, and any change orders awaiting your approval.",
    },
    {
      icon: <BarChart3 className="h-12 w-12" />,
      title: "Updates",
      description:
        "The weekly editorial-style update from your team — what just happened on site, what it means, and what's coming next. This is why most clients open the portal.",
    },
    {
      icon: <Palette className="h-12 w-12" />,
      title: "Design Board",
      description:
        "A shared visual canvas your designer composes. Pin your own inspiration to the wishlist zone, comment on items, and watch finishes come together. Appears in your nav once you've been invited to a board.",
    },
    {
      icon: <FolderOpen className="h-12 w-12" />,
      title: "Documents",
      description:
        "Drawings, contracts, permits, warranties, and shared specs — all kept in one place so you never have to dig through email.",
    },
    {
      icon: <MessageSquare className="h-12 w-12" />,
      title: "Messages",
      description:
        `Send a note directly to your ${brandName} team. Photos and replies live with the project, so context never gets lost in a thread.`,
    },
  ];
}

interface WalkthroughModalProps {
  open: boolean;
  onClose: () => void;
  role: string;
  firstName?: string | null;
}

export function WalkthroughModal({ open, onClose, role, firstName }: WalkthroughModalProps) {
  const brand = useTenantBrand();
  const steps = getSteps(role, firstName, brand.brandName);
  const [current, setCurrent] = useState(0);

  const step = steps[current];
  const isFirst = current === 0;
  const isLast = current === steps.length - 1;

  const handleClose = () => {
    setCurrent(0);
    onClose();
  };

  const handleNext = () => {
    if (isLast) {
      handleClose();
    } else {
      setCurrent(c => c + 1);
    }
  };

  const handlePrev = () => {
    if (!isFirst) setCurrent(c => c - 1);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent
        className="w-[95vw] max-w-sm p-0 gap-0 overflow-hidden"
        onInteractOutside={(e) => e.preventDefault()}
        data-testid="walkthrough-modal"
      >
        {/* Icon area */}
        <div className="relative bg-primary/[0.06] dark:bg-primary/10 px-8 pt-10 pb-8 flex flex-col items-center gap-4">
          <button
            onClick={handleClose}
            className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
            data-testid="button-walkthrough-close"
            aria-label="Close tour"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="text-primary" data-testid="walkthrough-icon">
            {step.icon}
          </div>
          <span className="text-xs text-muted-foreground tracking-wide">
            Step {current + 1} of {steps.length}
          </span>
        </div>

        {/* Content */}
        <div className="px-7 pt-5 pb-3 space-y-2">
          <h2
            className="text-base font-semibold normal-case leading-snug"
            data-testid="walkthrough-title"
          >
            {step.title}
          </h2>
          <p
            className="text-sm text-muted-foreground leading-relaxed"
            data-testid="walkthrough-description"
          >
            {step.description}
          </p>
        </div>

        {/* Footer */}
        <div className="px-7 py-5 flex items-center justify-between gap-4">
          {/* Dot indicators */}
          <div className="flex items-center gap-1.5" aria-hidden>
            {steps.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrent(i)}
                className={`rounded-full transition-all ${
                  i === current
                    ? "w-4 h-2 bg-primary"
                    : "w-2 h-2 bg-primary/20 hover:bg-primary/40"
                }`}
                aria-label={`Go to step ${i + 1}`}
              />
            ))}
          </div>

          {/* Navigation buttons */}
          <div className="flex items-center gap-2 shrink-0">
            {!isFirst && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handlePrev}
                className="h-8 px-2"
                data-testid="button-walkthrough-prev"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            )}
            <Button
              size="sm"
              onClick={handleNext}
              className="h-8 px-4"
              data-testid="button-walkthrough-next"
            >
              {isLast ? "Done" : (
                <>
                  Next <ChevronRight className="h-4 w-4 ml-1" />
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
