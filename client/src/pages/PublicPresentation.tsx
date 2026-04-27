/**
 * Public, unauthenticated read-only view of a board presentation.
 * Reached via /p/:token after a designer copies the share link from
 * Presentation Mode.
 */
import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { Loader2 } from "lucide-react";
import PresentationMode from "@/components/board/PresentationMode";
import type { CanvasElement } from "@shared/schema";

interface PublicPresentationData {
  projectId: number;
  boardId: number;
  boardName: string;
  elements: CanvasElement[];
}

export default function PublicPresentation() {
  const [, params] = useRoute<{ token: string }>("/p/:token");
  const token = params?.token;
  const [data, setData] = useState<PublicPresentationData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetch(`/api/board/presentation/${token}`)
      .then(async (r) => {
        if (!r.ok) {
          throw new Error(r.status === 404 ? "This presentation link is no longer valid." : "Could not load presentation.");
        }
        return r.json();
      })
      .then((d) => { if (!cancelled) setData(d); })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [token]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-8 text-center">
        <div>
          <div className="text-2xl font-semibold mb-2" style={{ fontFamily: "var(--font-serif)" }}>
            {error}
          </div>
          <div className="text-sm text-muted-foreground" style={{ fontFamily: "var(--font-mono)" }}>
            Aster &amp; Spruce
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <PresentationMode
      open={true}
      onClose={() => {}}
      projectId={data.projectId}
      boardId={data.boardId}
      boardName={data.boardName}
      elements={data.elements}
      watermarkOnly={true}
    />
  );
}
