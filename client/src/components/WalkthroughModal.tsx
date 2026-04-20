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
  ImageIcon,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";

interface Step {
  icon: React.ReactNode;
  title: string;
  description: string;
}

function getSteps(role: string, firstName?: string | null): Step[] {
  const name = firstName ? `, ${firstName}` : "";

  if (role === "admin") {
    return [
      {
        icon: <Home className="h-12 w-12" />,
        title: `Welcome to ASL Connect${name}`,
        description:
          "Your all-in-one portal for managing Aster & Spruce projects. Everything your team and clients need — delivered from one place.",
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
          "Your team portal for Aster & Spruce projects. See your daily assignments, log your hours, and stay in sync with the team from any device.",
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
        "Aster & Spruce has set up this space just for your project. Track progress, view the latest updates, and stay connected with your team — all in one place.",
    },
    {
      icon: <BarChart3 className="h-12 w-12" />,
      title: "Your Project Overview",
      description:
        "The Overview tab shows your project's current phase, key milestones, and a high-level snapshot of where things stand — including the budget summary when your team shares it.",
    },
    {
      icon: <CheckSquare className="h-12 w-12" />,
      title: "Progress & Milestones",
      description:
        "The Progress tab breaks your renovation into phases and tasks. Watch each step move from To Do to Done as your team works — so you always know what's happening on site.",
    },
    {
      icon: <ImageIcon className="h-12 w-12" />,
      title: "Photos & Documents",
      description:
        "View site photos as your project progresses and access shared documents — contracts, specs, and reports — all in one place, any time.",
    },
    {
      icon: <MessageSquare className="h-12 w-12" />,
      title: "Stay in Touch",
      description:
        "Use Messages to chat directly with your Aster & Spruce team. Ask questions, share feedback, and stay informed every step of the way.",
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
  const steps = getSteps(role, firstName);
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
