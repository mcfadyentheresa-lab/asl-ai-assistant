import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ClientProjectFooterProps {
  projectName: string;
  projectCode: string;
}

function deriveProjectCode(id: number): string {
  return `ASL-${String(id).padStart(3, "0")}`;
}

export { deriveProjectCode };

export function ClientProjectFooter({ projectName, projectCode }: ClientProjectFooterProps) {
  const [openDoc, setOpenDoc] = useState<null | "privacy" | "terms">(null);
  const year = new Date().getFullYear();

  return (
    <>
      <footer
        className="mt-12 border-t border-border/60 bg-background"
        data-testid="client-project-footer"
      >
        {/* Spruce accent thin line */}
        <div
          className="h-px w-full bg-primary/30"
          aria-hidden="true"
          data-testid="client-footer-accent"
        />
        <div className="container px-5 md:px-8 py-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-4 items-start">
            {/* Left: wordmark + studio credit */}
            <div className="space-y-2">
              <div
                className="font-serif text-base font-semibold tracking-tight text-foreground"
                data-testid="text-footer-wordmark"
              >
                <span className="font-bold">ASTER</span>
                <span className="mx-1.5 text-muted-foreground">&amp;</span>
                <span className="font-bold">SPRUCE</span>
              </div>
              <div
                className="text-xs text-muted-foreground"
                data-testid="text-footer-credit"
              >
                Designed by Aster &amp; Spruce Living • Muskoka, Ontario
              </div>
            </div>

            {/* Right: project + timestamp note */}
            <div className="space-y-2 md:text-right">
              <div
                className="text-sm text-foreground"
                data-testid="text-footer-project"
              >
                <span className="font-medium">{projectName}</span>
                <span className="mx-2 text-muted-foreground">·</span>
                <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                  {projectCode}
                </span>
              </div>
              <div
                className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground"
                data-testid="text-footer-timestamped"
              >
                © {year} • All updates timestamped
              </div>
            </div>
          </div>

          {/* Privacy / Terms */}
          <div className="mt-6 pt-4 border-t border-border/40 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            <button
              type="button"
              onClick={() => setOpenDoc("privacy")}
              className="hover:text-foreground transition-colors underline-offset-4 hover:underline"
              data-testid="link-footer-privacy"
            >
              Privacy
            </button>
            <span aria-hidden="true" className="text-border">·</span>
            <button
              type="button"
              onClick={() => setOpenDoc("terms")}
              className="hover:text-foreground transition-colors underline-offset-4 hover:underline"
              data-testid="link-footer-terms"
            >
              Terms
            </button>
          </div>
        </div>
      </footer>

      <Dialog open={openDoc !== null} onOpenChange={(o) => !o && setOpenDoc(null)}>
        <DialogContent className="max-w-lg" data-testid="dialog-footer-doc">
          <DialogHeader>
            <DialogTitle className="font-serif">
              {openDoc === "privacy" ? "Privacy" : "Terms"}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {openDoc === "privacy" ? "Privacy notice" : "Terms of use"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
            {openDoc === "privacy" ? (
              <>
                <p>
                  This client portal is private to your project. We share
                  documents, photos, and updates only with people invited to
                  this project by Aster &amp; Spruce Living.
                </p>
                <p>
                  We don't sell or share your information with third parties.
                  Files you upload are stored on our project servers and used
                  only to coordinate the work on your home.
                </p>
                <p>
                  Questions? Email{" "}
                  <a
                    href="mailto:info@asterandspruceliving.ca"
                    className="text-foreground underline underline-offset-2"
                    data-testid="link-footer-privacy-email"
                  >
                    info@asterandspruceliving.ca
                  </a>
                  .
                </p>
              </>
            ) : (
              <>
                <p>
                  This portal is provided to you as part of your design and
                  build engagement with Aster &amp; Spruce Living. Content
                  here — drawings, finishes, schedules — is for your project
                  and is not licensed for redistribution.
                </p>
                <p>
                  Updates posted here are timestamped. The most recent version
                  on the portal is the current source of truth for the project.
                </p>
                <p>
                  Engagement terms, fees, and scope are set out in your signed
                  agreement. Nothing in this portal supersedes that agreement.
                </p>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
