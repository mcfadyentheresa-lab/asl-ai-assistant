import type { CSSProperties } from "react";

interface HeroFrameInput {
  heroFocalX?: number | null;
  heroFocalY?: number | null;
  heroZoom?: number | null;
}

/**
 * CSS for any <img> element rendering a project's hero / thumbnail. Defaults
 * to 50%/50%/1.0 — identical to plain `object-cover; object-position: center`
 * so existing rows render unchanged. Apply to the parent's overflow:hidden.
 */
export function heroImageStyle(project: HeroFrameInput | null | undefined): CSSProperties {
  const fx = ((project?.heroFocalX ?? 0.5) as number) * 100;
  const fy = ((project?.heroFocalY ?? 0.5) as number) * 100;
  const z = (project?.heroZoom ?? 1) as number;
  const pos = `${fx.toFixed(2)}% ${fy.toFixed(2)}%`;
  return {
    objectPosition: pos,
    transform: `scale(${z.toFixed(3)})`,
    transformOrigin: pos,
  };
}
