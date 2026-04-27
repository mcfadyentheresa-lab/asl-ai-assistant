// In-process FIFO worker for cinematic_reviews. Concurrency 1: only one render
// at a time. Calling kickWorker() while a render is in flight is a no-op; the
// worker drains the queue before idling.
import { getCinematicReview, nextQueuedCinematicReview, updateCinematicReview } from "./db";
import { assembleKenBurnsForRoom } from "./ken-burns";

let running = false;

export function kickCinematicWorker(): void {
  if (running) return;
  running = true;
  void drain().finally(() => {
    running = false;
  });
}

async function drain(): Promise<void> {
  while (true) {
    const job = await nextQueuedCinematicReview();
    if (!job) return;
    await processJob(job.id);
  }
}

async function processJob(jobId: number): Promise<void> {
  // Mark as rendering so a subsequent drain doesn't double-pick it.
  const claimed = await updateCinematicReview(jobId, { status: "rendering" });
  if (!claimed) return;

  try {
    if (claimed.format !== "ken-burns") {
      // Defensive: only ken-burns is supported in PR-N1. Any other format
      // queued via legacy data should fail clearly rather than render bytes.
      await updateCinematicReview(jobId, {
        status: "failed",
        errorMessage: `Format ${claimed.format} not supported in this build`,
      });
      return;
    }

    if (!claimed.boardId) {
      await updateCinematicReview(jobId, {
        status: "failed",
        errorMessage: "Cinematic review requires a boardId",
      });
      return;
    }

    const result = await assembleKenBurnsForRoom({
      jobId,
      projectId: claimed.projectId,
      boardId: claimed.boardId,
      roomName: claimed.roomName,
    });

    await updateCinematicReview(jobId, {
      status: "completed",
      videoUrl: result.videoUrl,
      thumbnailUrl: result.thumbnailUrl || null,
      durationSec: result.durationSec,
      errorMessage: null,
    });
  } catch (err: any) {
    const msg = (err && err.message) ? String(err.message) : String(err);
    console.error(`[cinematic] job ${jobId} failed:`, msg);
    await updateCinematicReview(jobId, {
      status: "failed",
      errorMessage: msg.slice(0, 500),
    });
  }
}

export async function getCinematicReviewStatus(jobId: number) {
  return getCinematicReview(jobId);
}
