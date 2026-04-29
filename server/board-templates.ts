function makeRect(left: number, top: number, width: number, height: number, fill: string) {
  return {
    type: "rect",
    left,
    top,
    width,
    height,
    fill,
    stroke: "#d1d5db",
    strokeWidth: 1,
    rx: 8,
    ry: 8,
    selectable: true,
    evented: true,
  };
}

function makeText(left: number, top: number, text: string, fontSize = 16, fontWeight = "bold", fill = "#1a1a1a") {
  return {
    type: "textbox",
    left,
    top,
    text,
    fontSize,
    fontWeight,
    fontFamily: "Inter, sans-serif",
    fill,
    width: 240,
    selectable: true,
    evented: true,
    editable: true,
  };
}

function makeSticky(left: number, top: number, text: string, color = "#fef9c3", width = 180, height = 100) {
  return {
    type: "group",
    left,
    top,
    width,
    height,
    selectable: true,
    evented: true,
    subTargetCheck: true,
    interactive: true,
    objects: [
      {
        type: "rect",
        left: -(width / 2),
        top: -(height / 2),
        width,
        height,
        fill: color,
        rx: 4,
        ry: 4,
        stroke: "#e5e7eb",
        strokeWidth: 1,
        shadow: { color: "rgba(0,0,0,0.08)", blur: 4, offsetX: 1, offsetY: 2 },
      },
      {
        type: "textbox",
        left: -(width / 2) + 10,
        top: -(height / 2) + 10,
        width: width - 20,
        text,
        fontSize: 12,
        fontFamily: "Inter, sans-serif",
        fill: "#374151",
        editable: true,
      },
    ],
  };
}

function makeSectionHeader(left: number, top: number, text: string) {
  return makeText(left, top, text.toUpperCase(), 18, "bold", "#1e3a2f");
}

function makeImage(left: number, top: number, url: string, caption: string, width = 280, height = 220) {
  return {
    type: "template_image",
    left,
    top,
    width,
    height,
    url,
    caption,
  };
}

function makeColorSwatch(left: number, top: number, name: string, color: string, hex: string, code = "", brand = "", width = 180) {
  return {
    type: "template_color_swatch",
    left,
    top,
    width,
    height: 200,
    name,
    color,
    hex,
    code,
    brand,
  };
}

function makeProduct(left: number, top: number, name: string, price: string, supplier: string, url = "", width = 220) {
  return {
    type: "template_product",
    left,
    top,
    width,
    height: 120,
    name,
    price,
    supplier,
    url,
  };
}

function makeMaterial(left: number, top: number, name: string, supplier: string, code: string, imageUrl = "", notes = "", width = 220) {
  return {
    type: "template_material",
    left,
    top,
    width,
    height: 180,
    name,
    supplier,
    code,
    imageUrl,
    notes,
  };
}

function makeRoomZone(left: number, top: number, width: number, height: number, title: string, color = "#f0ede8", opacity = 0.45) {
  return {
    type: "template_room_zone",
    left,
    top,
    width,
    height,
    title,
    color,
    opacity,
  };
}

function makeCallout(left: number, top: number, text: string, color = "#fef9c3", width = 180, height = 70) {
  return {
    type: "template_callout",
    left,
    top,
    width,
    height,
    text,
    color,
  };
}

function wrap(objects: any[]) {
  return {
    version: "6.6.1",
    objects,
    background: "#f8f6f3",
  };
}

const IMG = "/api/public-assets/images/templates";

// ---------------------------------------------------------------------------
// Layout grid
// ---------------------------------------------------------------------------
// Every template uses the same predictable canvas grid so users see an
// "obvious example layout" the moment a board is created — clean horizontal
// rows, tidy 3-column image grids, no overlapping zones or scattered notes.
//
//   [ Title row              ]  y=20..70
//   [ Section A (zone)       ]  y=80..480   (3-column image grid inside)
//   [ Section B (zone)       ]  y=500..820  (swatches + materials + notes)
//
// Helpers below build those rows so each template definition stays short
// and visually consistent.
// ---------------------------------------------------------------------------

const TITLE_X = 40;
const TITLE_Y = 24;

const SECTION_A_TOP = 80;
const SECTION_A_HEIGHT = 400;
const SECTION_B_TOP = 500;
const SECTION_B_HEIGHT = 320;

const CANVAS_LEFT = 30;
const CANVAS_WIDTH = 1100;

// 3-column image grid inside Section A.
function imageGrid(top: number, items: { url: string; caption: string }[]) {
  const cols = 3;
  const gutter = 24;
  const sectionInsetX = 60;
  const sectionInsetTop = 56; // leaves room below the zone title
  const cellW = Math.floor((CANVAS_WIDTH - sectionInsetX * 2 - gutter * (cols - 1)) / cols);
  const cellH = 220;
  const rowGap = 60;
  return items.map((it, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const x = CANVAS_LEFT + sectionInsetX + c * (cellW + gutter);
    const y = top + sectionInsetTop + r * (cellH + rowGap);
    return makeImage(x, y, it.url, it.caption, cellW, cellH);
  });
}

// Row of swatches inside Section B (left half).
function swatchRow(top: number, items: { name: string; hex: string; code?: string; brand?: string }[]) {
  const swatchW = 130;
  const gap = 16;
  const startX = CANVAS_LEFT + 60;
  const swatchTop = top + 56;
  return items.map((it, i) => {
    const x = startX + i * (swatchW + gap);
    return makeColorSwatch(x, swatchTop, it.name, it.hex, it.hex, it.code || "", it.brand || "", swatchW);
  });
}

// Row of materials below swatches in Section B.
function materialRow(top: number, items: { name: string; supplier?: string; code?: string; imageUrl?: string; notes?: string }[]) {
  const w = 220;
  const gap = 24;
  const startX = CANVAS_LEFT + 60;
  const matTop = top + 56;
  return items.map((it, i) => {
    const x = startX + i * (w + gap);
    return makeMaterial(x, matTop, it.name, it.supplier || "", it.code || "", it.imageUrl || "", it.notes || "");
  });
}

// Row of notes (sticky) in the right half of Section B.
function noteRow(top: number, leftOffset: number, items: { text: string; color?: string }[]) {
  const w = 200;
  const h = 90;
  const gap = 16;
  const startX = CANVAS_LEFT + leftOffset;
  const noteTop = top + 100;
  return items.map((it, i) => {
    const x = startX + i * (w + gap);
    return makeSticky(x, noteTop, it.text, it.color || "#fef9c3", w, h);
  });
}

// Build a clean two-section template with a Title row, an image grid in
// Section A, and swatches/materials/notes in Section B.
interface SimpleTemplateInput {
  title: string;
  sectionA: string;
  sectionB: string;
  images: { url: string; caption: string }[]; // up to 6
  swatches?: { name: string; hex: string; code?: string; brand?: string }[];
  materials?: { name: string; supplier?: string; code?: string; imageUrl?: string; notes?: string }[];
  notes?: { text: string; color?: string }[];
  zoneColorA?: string;
  zoneColorB?: string;
}

function buildSimpleTemplate(input: SimpleTemplateInput) {
  const objects: any[] = [];
  objects.push(makeSectionHeader(TITLE_X, TITLE_Y, input.title));

  // Section A — image grid
  objects.push(makeRoomZone(CANVAS_LEFT, SECTION_A_TOP, CANVAS_WIDTH, SECTION_A_HEIGHT, input.sectionA, input.zoneColorA || "#ece8e1", 0.4));
  objects.push(makeText(CANVAS_LEFT + 24, SECTION_A_TOP + 18, input.sectionA.toUpperCase(), 12, "600", "#1e3a2f"));
  objects.push(...imageGrid(SECTION_A_TOP, input.images.slice(0, 6)));

  // Section B — swatches + materials + notes
  objects.push(makeRoomZone(CANVAS_LEFT, SECTION_B_TOP, CANVAS_WIDTH, SECTION_B_HEIGHT, input.sectionB, input.zoneColorB || "#e8ebe6", 0.35));
  objects.push(makeText(CANVAS_LEFT + 24, SECTION_B_TOP + 18, input.sectionB.toUpperCase(), 12, "600", "#1e3a2f"));

  if (input.swatches && input.swatches.length > 0) {
    objects.push(makeText(CANVAS_LEFT + 60, SECTION_B_TOP + 36, "PALETTE", 11, "600", "#6b7280"));
    objects.push(...swatchRow(SECTION_B_TOP, input.swatches.slice(0, 4)));
  }
  if (input.materials && input.materials.length > 0) {
    const matTop = SECTION_B_TOP + (input.swatches && input.swatches.length ? 200 : 0);
    objects.push(makeText(CANVAS_LEFT + 60, matTop + 36, "MATERIALS", 11, "600", "#6b7280"));
    objects.push(...materialRow(matTop, input.materials.slice(0, 3)));
  }
  if (input.notes && input.notes.length > 0) {
    const notesLeftOffset = 720;
    objects.push(makeText(CANVAS_LEFT + notesLeftOffset, SECTION_B_TOP + 36, "NOTES", 11, "600", "#6b7280"));
    objects.push(...noteRow(SECTION_B_TOP, notesLeftOffset, input.notes.slice(0, 2)));
  }

  return wrap(objects);
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

const kitchenRenovation = buildSimpleTemplate({
  title: "Kitchen Renovation",
  sectionA: "Cabinetry, Surfaces & Lighting",
  sectionB: "Palette, Materials & Notes",
  images: [
    { url: `${IMG}/kitchen-cabinets.png`, caption: "Shaker maple uppers — BM White Dove OC-17" },
    { url: `${IMG}/kitchen-countertop.png`, caption: "Calacatta Nuvo 5131 — 3cm waterfall island" },
    { url: `${IMG}/kitchen-range.png`, caption: "Wolf 48\" range w/ Zephyr Cypress hood" },
    { url: `${IMG}/kitchen-tile.png`, caption: "Cle zellige 2×6\" backsplash — running bond" },
    { url: `${IMG}/kitchen-pendants.png`, caption: "Schoolhouse Otis pendants — aged brass" },
    { url: `${IMG}/mood-oak-floor.png`, caption: "5\" white oak hardwood — wire-brushed matte" },
  ],
  swatches: [
    { name: "White Dove", hex: "#F3EFE6", code: "OC-17", brand: "Benjamin Moore" },
    { name: "Edgecomb Gray", hex: "#D5CEC4", code: "HC-173", brand: "Benjamin Moore" },
    { name: "Chantilly Lace", hex: "#F5F2ED", code: "OC-65", brand: "Benjamin Moore" },
    { name: "Aged Brass", hex: "#A8895C", code: "Hardware", brand: "Emtek" },
  ],
  materials: [
    { name: "White Oak Hardwood", supplier: "Local mill", code: "5\" plank", imageUrl: `${IMG}/mood-oak-floor.png`, notes: "Wire-brushed, matte poly. Continuous to dining." },
    { name: "Calacatta Nuvo Quartz", supplier: "Caesarstone", code: "5131", imageUrl: `${IMG}/kitchen-countertop.png`, notes: "Waterfall island. Eased edge perimeter." },
    { name: "Zellige Backsplash", supplier: "Cle Tile", code: "2×6 Weathered White", imageUrl: `${IMG}/kitchen-tile.png`, notes: "Running bond. Extend to ceiling behind range." },
  ],
  notes: [
    { text: "Lead times: cabinets 12 wks, countertops 6 wks. Order before framing.", color: "#fef9c3" },
    { text: "Aged brass hardware throughout. Soft-close hinges on all lowers.", color: "#dcfce7" },
  ],
});

const bathroomRenovation = buildSimpleTemplate({
  title: "Bathroom Renovation",
  sectionA: "Fixtures, Finishes & Lighting",
  sectionB: "Palette, Materials & Notes",
  zoneColorA: "#e6e9ec",
  zoneColorB: "#ece8e3",
  images: [
    { url: `${IMG}/bath-tub.png`, caption: "V+A Napoli freestanding — matte white, 65×29\"" },
    { url: `${IMG}/bath-vanity.png`, caption: "60\" double vanity — white oak floating" },
    { url: `${IMG}/bath-sconce.png`, caption: "Cedar & Moss Alto sconces — brushed brass" },
    { url: `${IMG}/bath-hex-tile.png`, caption: "2\" Carrara hex mosaic — heated" },
    { url: `${IMG}/kitchen-tile.png`, caption: "Large-format Calacatta porcelain — shower" },
    { url: `${IMG}/mood-oak-floor.png`, caption: "Heated white oak threshold transitions" },
  ],
  swatches: [
    { name: "Pale Oak", hex: "#E8E0D4", code: "OC-20", brand: "Benjamin Moore" },
    { name: "White Heron", hex: "#F0EDE6", code: "OC-57", brand: "Benjamin Moore" },
    { name: "Brushed Brass", hex: "#B69672", code: "Fixtures", brand: "Brizo Litze" },
    { name: "Carrara White", hex: "#EDEAE3", code: "Mosaic", brand: "Stone Source" },
  ],
  materials: [
    { name: "Carrara Marble Hex", supplier: "Stone Source", code: "2\" mosaic", imageUrl: `${IMG}/bath-hex-tile.png`, notes: "Heated w/ Schluter Ditra-Heat under all tile." },
    { name: "Calacatta Porcelain", supplier: "Cle Tile", code: "24×48\"", imageUrl: "", notes: "Shower walls. Niche in accent stone." },
    { name: "White Oak Vanity", supplier: "Custom mill", code: "Floating, 60\"", imageUrl: `${IMG}/bath-vanity.png`, notes: "Quartz top, undermount basins." },
  ],
  notes: [
    { text: "Heated floors mandatory. Schluter Ditra-Heat under all tile.", color: "#dbeafe" },
    { text: "Thermostatic valve, 2-function diverter. Rough-in at 48\" centre.", color: "#fef9c3" },
  ],
});

const fullCottageBuild = buildSimpleTemplate({
  title: "Full Cottage Build",
  sectionA: "Exterior, Lakefront & Interior",
  sectionB: "Palette, Materials & Mechanical Notes",
  zoneColorA: "#e4e1db",
  zoneColorB: "#dce5e8",
  images: [
    { url: `${IMG}/cottage-exterior.png`, caption: "Board-and-batten cedar — Driftwood Grey stain" },
    { url: `${IMG}/cottage-trusses.png`, caption: "Vaulted great room — exposed timber trusses" },
    { url: `${IMG}/cottage-dock.png`, caption: "Permanent dock — steel frame, cedar decking" },
    { url: `${IMG}/cottage-fireplace.png`, caption: "Muskoka granite fieldstone fireplace surround" },
    { url: `${IMG}/mood-sofa.png`, caption: "Performance linen great-room seating" },
    { url: `${IMG}/mood-oak-floor.png`, caption: "5\" white oak floors — continuous main level" },
  ],
  swatches: [
    { name: "Driftwood Grey", hex: "#9E9689", code: "Semi-trans.", brand: "Cabot Stain" },
    { name: "Matte Black", hex: "#2A2A2A", code: "Standing seam", brand: "Metal roof" },
    { name: "White Dove", hex: "#F3EFE6", code: "OC-17", brand: "Benjamin Moore" },
    { name: "Salamander", hex: "#1E3A2F", code: "2050-10", brand: "Benjamin Moore" },
  ],
  materials: [
    { name: "Cedar Board & Batten", supplier: "Local sawmill", code: "1×10 + 1×3", imageUrl: `${IMG}/cottage-exterior.png`, notes: "Semi-transparent stain. Re-stain every 5 yrs." },
    { name: "Loewen Triple-Glaze", supplier: "Loewen", code: "Douglas fir", imageUrl: "", notes: "8' sliding door to screened porch." },
    { name: "TimberTech Decking", supplier: "TimberTech", code: "Composite", imageUrl: "", notes: "Steel cable rail along all decks." },
  ],
  notes: [
    { text: "Confirm dock permit w/ township. Check setback for screened porch.", color: "#fef9c3" },
    { text: "200A panel, EV pre-wire. Mitsubishi Hyper-Heat 4 zones + radiant.", color: "#fce7f3" },
  ],
});

const moodboard = buildSimpleTemplate({
  title: "Moodboard",
  sectionA: "Inspiration & References",
  sectionB: "Palette, Materials & Direction",
  zoneColorA: "#ece8e3",
  zoneColorB: "#e5e8e3",
  images: [
    { url: `${IMG}/mood-sofa.png`, caption: "Performance linen sofa — oatmeal, wool bouclé accents" },
    { url: `${IMG}/mood-oak-floor.png`, caption: "Wire-brushed white oak — matte poly" },
    { url: `${IMG}/cottage-fireplace.png`, caption: "Muskoka granite fieldstone fireplace" },
    { url: `${IMG}/kitchen-cabinets.png`, caption: "White oak + aged brass hardware" },
    { url: `${IMG}/bath-sconce.png`, caption: "Cedar & Moss sconce — aged brass, 3000K" },
    { url: `${IMG}/kitchen-pendants.png`, caption: "Schoolhouse globe pendants" },
  ],
  swatches: [
    { name: "White Dove", hex: "#F3EFE6", code: "OC-17", brand: "Benjamin Moore" },
    { name: "Salamander", hex: "#1E3A2F", code: "2050-10", brand: "Benjamin Moore" },
    { name: "Alabaster", hex: "#F0EDE5", code: "SW 7008", brand: "Sherwin-Williams" },
    { name: "Chantilly Lace", hex: "#F5F2ED", code: "OC-65", brand: "Benjamin Moore" },
  ],
  materials: [
    { name: "White Oak", supplier: "Local mill", code: "Wire-brushed", imageUrl: `${IMG}/mood-oak-floor.png`, notes: "Floors, vanity, shelving. Matte poly." },
    { name: "Muskoka Granite", supplier: "Local quarry", code: "Fieldstone", imageUrl: `${IMG}/cottage-fireplace.png`, notes: "Fireplace surround. Honed Carrara in baths." },
    { name: "Performance Linen", supplier: "Kravet", code: "Oatmeal", imageUrl: `${IMG}/mood-sofa.png`, notes: "Sofa + drapery. Wool bouclé on accent chair." },
  ],
  notes: [
    { text: "Client loves warm minimal. No farmhouse or rustic. Max 3-4 colours.", color: "#fef9c3" },
    { text: "Aged brass hardware throughout. Matte black on exterior doors only.", color: "#fed7aa" },
  ],
});

const furnitureRefinishingConceptBoardWorking = buildSimpleTemplate({
  title: "Furniture Refinishing",
  sectionA: "Before & Proposed Direction",
  sectionB: "Swatches, Materials & Approval Notes",
  zoneColorA: "#f3efe8",
  zoneColorB: "#ede8e1",
  images: [
    { url: `${IMG}/cottage-exterior.png`, caption: "Before — current piece, full view" },
    { url: `${IMG}/mood-sofa.png`, caption: "Client inspiration reference" },
    { url: `${IMG}/cottage-fireplace.png`, caption: "Proposed direction — finish goal" },
    { url: `${IMG}/mood-oak-floor.png`, caption: "Wood grain reference — matching tone" },
    { url: `${IMG}/kitchen-cabinets.png`, caption: "Hardware close-up reference" },
    { url: `${IMG}/bath-vanity.png`, caption: "Edge profile + repair detail" },
  ],
  swatches: [
    { name: "Paint Colour", hex: "#F3EFE6", code: "Sample", brand: "TBD" },
    { name: "Stain Colour", hex: "#B58A63", code: "Sample", brand: "TBD" },
    { name: "Topcoat Sheen", hex: "#D9D4CB", code: "Matte", brand: "TBD" },
    { name: "Hardware Tone", hex: "#A8895C", code: "Aged brass", brand: "TBD" },
  ],
  materials: [
    { name: "Wood Grain Note", supplier: "", code: "Direction", imageUrl: "", notes: "Visible grain to remain. Reduce orange undertone." },
    { name: "Edge Profile", supplier: "", code: "Eased", imageUrl: "", notes: "Sand to 220. Dust off twice before finish." },
    { name: "Topcoat", supplier: "Rubio Monocoat", code: "Pure", imageUrl: "", notes: "Matte. Sample approval before final." },
  ],
  notes: [
    { text: "Sample approval required before final finish. Photo client reply.", color: "#fef9c3" },
    { text: "Durability for high-use piece. Confirm finish with client.", color: "#dcfce7" },
  ],
});

const collageConceptBoard = buildSimpleTemplate({
  title: "Concept Board",
  sectionA: "Renovation, Design & Floor Plan",
  sectionB: "Palette, Features & Objectives",
  zoneColorA: "#f6f3ee",
  zoneColorB: "#ede8e1",
  images: [
    { url: `${IMG}/cottage-exterior.png`, caption: "Renovation overview" },
    { url: `${IMG}/cottage-trusses.png`, caption: "House floor plan" },
    { url: `${IMG}/mood-sofa.png`, caption: "Feature desk inspiration" },
    { url: `${IMG}/kitchen-cabinets.png`, caption: "Kitchen moodboard" },
    { url: `${IMG}/cottage-fireplace.png`, caption: "Living room moodboard" },
    { url: `${IMG}/mood-oak-floor.png`, caption: "Floating display unit" },
  ],
  swatches: [
    { name: "Horizon", hex: "#6FA7B4", code: "", brand: "" },
    { name: "Birchwood", hex: "#E5D3B4", code: "", brand: "" },
    { name: "White Dove", hex: "#F3EFE6", code: "OC-17", brand: "Benjamin Moore" },
    { name: "Charcoal", hex: "#3A3A3A", code: "", brand: "" },
  ],
  materials: [
    { name: "Renovation", supplier: "", code: "Existing", imageUrl: "", notes: "Emphasise the home's existing architectural character." },
    { name: "Materials List", supplier: "", code: "Source", imageUrl: "", notes: "Add product references. Mark anything still to source." },
    { name: "Display Shelf", supplier: "", code: "Floating", imageUrl: "", notes: "Reserve room for arrows and callouts on plan." },
  ],
  notes: [
    { text: "Calm, timeless palette. Use warm materials. Keep airy and presentation-ready.", color: "#ffffff" },
    { text: "Three moodboards: Living, Study, Kitchen. Things to buy section.", color: "#ffffff" },
  ],
});

const materialInspirationBoard = buildSimpleTemplate({
  title: "Material Inspiration",
  sectionA: "Fabrics, Finishes & Wood Tones",
  sectionB: "Palette, Materials & Detail Notes",
  zoneColorA: "#f5f3ef",
  zoneColorB: "#ece8e3",
  images: [
    { url: `${IMG}/bath-vanity.png`, caption: "European fabric samples" },
    { url: `${IMG}/bath-hex-tile.png`, caption: "Herringbone pattern" },
    { url: `${IMG}/mood-oak-floor.png`, caption: "Wenge spruce — dark wood grain" },
    { url: `${IMG}/kitchen-pendants.png`, caption: "Textured lamp + objects" },
    { url: `${IMG}/kitchen-cabinets.png`, caption: "Bar top oak veneer finish" },
    { url: `${IMG}/bath-sconce.png`, caption: "Entry door handles" },
  ],
  swatches: [
    { name: "Hemlock", hex: "#556B3F", code: "Accent", brand: "" },
    { name: "Espresso", hex: "#5A443D", code: "Wood", brand: "" },
    { name: "Birchwood", hex: "#E5D3B4", code: "Light", brand: "" },
    { name: "Linen", hex: "#E8E0D4", code: "Neutral", brand: "" },
  ],
  materials: [
    { name: "Oak Veneer", supplier: "Local mill", code: "Bar top", imageUrl: `${IMG}/kitchen-cabinets.png`, notes: "Bar top + display shelving." },
    { name: "Herringbone Stone", supplier: "Stone Source", code: "Pattern", imageUrl: `${IMG}/bath-hex-tile.png`, notes: "Feature wall in entry." },
    { name: "European Fabric", supplier: "Kravet", code: "Sample", imageUrl: `${IMG}/bath-vanity.png`, notes: "Drapery + accent pillows." },
  ],
  notes: [
    { text: "Keep the palette grounded. Use a single dark accent piece.", color: "#ffffff" },
    { text: "Oak side tables. Door handles in aged brass to tie everything.", color: "#ffffff" },
  ],
});

export interface BoardTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  image: string;
  canvasData: any;
}

export const boardTemplates: BoardTemplate[] = [
  {
    id: "kitchen",
    name: "Kitchen Renovation",
    description: "Cabinetry, surfaces, lighting, palette \u2014 prefilled in a clean grid",
    icon: "ChefHat",
    image: "/assets/images/template-kitchen-faux.png",
    canvasData: kitchenRenovation,
  },
  {
    id: "bathroom",
    name: "Bathroom Renovation",
    description: "Fixtures, finishes, lighting, tile spec \u2014 prefilled in a clean grid",
    icon: "Bath",
    image: "/assets/images/template-bathroom-faux.png",
    canvasData: bathroomRenovation,
  },
  {
    id: "cottage",
    name: "Full Cottage Build",
    description: "Exterior, lakefront, interior, mechanical \u2014 prefilled in a clean grid",
    icon: "Home",
    image: "/assets/images/template-cottage-faux.png",
    canvasData: fullCottageBuild,
  },
  {
    id: "moodboard",
    name: "Moodboard",
    description: "Inspiration, palette, materials \u2014 prefilled in a clean grid",
    icon: "Palette",
    image: "/assets/images/Screenshot_2026-04-08_at_12.56.52_PM_1775667416114.png",
    canvasData: moodboard,
  },
  {
    id: "furniture-refinishing-working",
    name: "Furniture Refinishing",
    description: "Before, proposed direction, swatches, approval notes",
    icon: "LayoutPanelLeft",
    image: "/assets/images/Screenshot_2026-04-08_at_12.56.52_PM_1775667416114.png",
    canvasData: furnitureRefinishingConceptBoardWorking,
  },
  {
    id: "collage-concept",
    name: "Collage Concept Board",
    description: "Multi-section presentation board with plan, palette, and features",
    icon: "LayoutPanelLeft",
    image: "/assets/images/Screenshot_2026-04-09_at_10.54.53_AM_1775746499391.png",
    canvasData: collageConceptBoard,
  },
  {
    id: "material-inspiration",
    name: "Material Inspiration Board",
    description: "Fabrics, finishes, wood tones, and palette laid out clearly",
    icon: "Palette",
    image: "/assets/images/Screenshot_2026-04-09_at_10.57.06_AM_1775746631248.png",
    canvasData: materialInspirationBoard,
  },
];

export function getTemplateCatalogue() {
  return boardTemplates.map(({ id, name, description, icon, image }) => ({ id, name, description, icon, image }));
}

export function getTemplateCanvasData(templateId: string): any | null {
  const t = boardTemplates.find((t) => t.id === templateId);
  return t ? JSON.parse(JSON.stringify(t.canvasData)) : null;
}
