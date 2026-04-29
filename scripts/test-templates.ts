// Validates every template's layout: no overflow, no overlap.
import { boardTemplates, getTemplateCanvasData } from "../server/board-templates";

interface Box { id: string; x: number; y: number; w: number; h: number; type: string; }

function rectsOverlap(a: Box, b: Box): boolean {
  return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
}

function objToBox(obj: any, idx: number): Box {
  return {
    id: `${obj.type}-${idx}`,
    x: obj.left ?? 0,
    y: obj.top ?? 0,
    w: obj.width ?? 0,
    h: obj.height ?? (obj.fontSize ? obj.fontSize * 2 : 40),
    type: obj.type,
  };
}

let totalIssues = 0;
const summary: { id: string; name: string; ok: boolean; issues: string[] }[] = [];

for (const tpl of boardTemplates) {
  const canvas = getTemplateCanvasData(tpl.id);
  const objs = canvas?.objects ?? [];
  const issues: string[] = [];

  // Find zones (template_room_zone) and check that each child element fits inside its zone.
  const zones = objs
    .map((o: any, i: number) => ({ obj: o, box: objToBox(o, i) }))
    .filter((x: any) => x.obj.type === "template_room_zone");

  // Check overflow: every image/swatch/material should be inside SOME zone (not strict for text headers).
  const contained = ["template_image", "template_color_swatch", "template_material", "group"];
  for (let i = 0; i < objs.length; i++) {
    const obj = objs[i];
    if (!contained.includes(obj.type)) continue;
    const box = objToBox(obj, i);
    let inside = false;
    for (const z of zones) {
      const zb = z.box;
      // Note: stickies are positioned by center, not top-left, so account for that.
      const isSticky = obj.type === "group";
      const cx = isSticky ? box.x : box.x + box.w / 2;
      const cy = isSticky ? box.y : box.y + box.h / 2;
      const left = isSticky ? box.x - box.w / 2 : box.x;
      const top = isSticky ? box.y - box.h / 2 : box.y;
      const right = isSticky ? box.x + box.w / 2 : box.x + box.w;
      const bottom = isSticky ? box.y + box.h / 2 : box.y + box.h;
      if (left >= zb.x && right <= zb.x + zb.w && top >= zb.y && bottom <= zb.y + zb.h) {
        inside = true;
        break;
      }
    }
    if (!inside) {
      issues.push(`${obj.type} #${i} at (${box.x},${box.y}) ${box.w}x${box.h} overflows all zones`);
    }
  }

  // Check overlap between same-type content elements (images vs images, swatches vs swatches, materials vs materials).
  const checkOverlap = (typeName: string) => {
    const items = objs
      .map((o: any, i: number) => ({ obj: o, box: objToBox(o, i), idx: i }))
      .filter((x: any) => x.obj.type === typeName);
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        if (rectsOverlap(items[i].box, items[j].box)) {
          issues.push(`${typeName} #${items[i].idx} overlaps #${items[j].idx}`);
        }
      }
    }
  };
  checkOverlap("template_image");
  checkOverlap("template_color_swatch");
  checkOverlap("template_material");

  // Check images vs swatches vs materials (cross-type overlap)
  const allContent = objs
    .map((o: any, i: number) => ({ obj: o, box: objToBox(o, i), idx: i }))
    .filter((x: any) => ["template_image", "template_color_swatch", "template_material"].includes(x.obj.type));
  for (let i = 0; i < allContent.length; i++) {
    for (let j = i + 1; j < allContent.length; j++) {
      if (allContent[i].obj.type === allContent[j].obj.type) continue;
      if (rectsOverlap(allContent[i].box, allContent[j].box)) {
        issues.push(`${allContent[i].obj.type} #${allContent[i].idx} overlaps ${allContent[j].obj.type} #${allContent[j].idx}`);
      }
    }
  }

  summary.push({ id: tpl.id, name: tpl.name, ok: issues.length === 0, issues });
  totalIssues += issues.length;
}

console.log("\n=== Template Layout Validation ===\n");
for (const s of summary) {
  const status = s.ok ? "✅ OK" : `❌ ${s.issues.length} issue(s)`;
  console.log(`${status}  [${s.id}] ${s.name}`);
  for (const issue of s.issues) console.log(`     - ${issue}`);
}
console.log(`\nTotal: ${summary.filter(s => s.ok).length}/${summary.length} clean, ${totalIssues} issue(s) found.`);
process.exit(totalIssues > 0 ? 1 : 0);
