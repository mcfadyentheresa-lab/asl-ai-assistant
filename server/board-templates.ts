// Curated Unsplash photo IDs grouped by category. Helper renders to a 1080-wide CDN URL.
function unsplash(id: string): string {
  return `https://images.unsplash.com/${id}?fm=jpg&q=70&w=1080&auto=format&fit=crop`;
}
function premiumUnsplash(id: string): string {
  return `https://plus.unsplash.com/${id}?fm=jpg&q=70&w=1080&auto=format&fit=crop`;
}

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

const CANVAS_LEFT = 30;
const CANVAS_WIDTH = 1180;

// Section A — image grid (2 rows of 3 images at 220h + 60 row gap + 80 top inset + 40 bottom padding = ~640)
const SECTION_A_TOP = 90;
const SECTION_A_HEIGHT_BASE = 640;
const SECTION_A_HEIGHT_WITH_ARTWORK = 920; // adds room for a 3-image artwork row (~220 + 60 gap)
// Section B holds swatches row (200) + 30 gap + materials row (180) + 80 inset + 40 padding = ~530
const SECTION_B_HEIGHT = 530;

// Inner column split inside Section B: left side for swatches/materials, right side for notes.
const SECTION_B_LEFT_WIDTH = 880;

// 3-column image grid inside Section A.
function imageGrid(top: number, items: { url: string; caption: string }[]) {
  const cols = 3;
  const gutter = 24;
  const sectionInsetX = 40;
  const sectionInsetTop = 80; // leaves room below the zone title
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

// Row of swatches inside Section B (left side, top row).
function swatchRow(top: number, items: { name: string; hex: string; code?: string; brand?: string }[]) {
  const swatchW = 170;
  const gap = 18;
  const startX = CANVAS_LEFT + 40;
  const swatchTop = top + 80;
  return items.map((it, i) => {
    const x = startX + i * (swatchW + gap);
    return makeColorSwatch(x, swatchTop, it.name, it.hex, it.hex, it.code || "", it.brand || "", swatchW);
  });
}

// Row of materials below swatches in Section B (left side, bottom row).
function materialRow(top: number, items: { name: string; supplier?: string; code?: string; imageUrl?: string; notes?: string }[]) {
  const w = 220;
  const gap = 24;
  const startX = CANVAS_LEFT + 40;
  const matTop = top + 80;
  return items.map((it, i) => {
    const x = startX + i * (w + gap);
    return makeMaterial(x, matTop, it.name, it.supplier || "", it.code || "", it.imageUrl || "", it.notes || "");
  });
}

// Column of notes (stickies) on the right side of Section B.
function noteColumn(top: number, leftOffset: number, items: { text: string; color?: string }[]) {
  const w = 220;
  const h = 110;
  const gap = 16;
  const startX = CANVAS_LEFT + leftOffset;
  const noteTop = top + 80;
  return items.map((it, i) => {
    const y = noteTop + i * (h + gap);
    return makeSticky(startX, y, it.text, it.color || "#fef9c3", w, h);
  });
}

// Build a clean two-section template with a Title row, an image grid in
// Section A, and swatches/materials/notes in Section B.
interface SimpleTemplateInput {
  title: string;
  sectionA: string;
  sectionB: string;
  images: { url: string; caption: string }[]; // up to 6
  artwork?: { url: string; caption: string }[]; // up to 3 — adds an Artwork row inside Section A
  swatches?: { name: string; hex: string; code?: string; brand?: string }[];
  materials?: { name: string; supplier?: string; code?: string; imageUrl?: string; notes?: string }[];
  notes?: { text: string; color?: string }[];
  zoneColorA?: string;
  zoneColorB?: string;
}

function buildSimpleTemplate(input: SimpleTemplateInput) {
  const objects: any[] = [];
  objects.push(makeSectionHeader(TITLE_X, TITLE_Y, input.title));

  const hasArtwork = !!(input.artwork && input.artwork.length > 0);
  const sectionAHeight = hasArtwork ? SECTION_A_HEIGHT_WITH_ARTWORK : SECTION_A_HEIGHT_BASE;
  const sectionBTop = SECTION_A_TOP + sectionAHeight + 30;

  // Section A — image grid (2 rows × 3 cols of 220h images, fully contained)
  objects.push(makeRoomZone(CANVAS_LEFT, SECTION_A_TOP, CANVAS_WIDTH, sectionAHeight, input.sectionA, input.zoneColorA || "#ece8e1", 0.4));
  objects.push(makeText(CANVAS_LEFT + 24, SECTION_A_TOP + 18, input.sectionA.toUpperCase(), 12, "600", "#1e3a2f"));
  objects.push(...imageGrid(SECTION_A_TOP, input.images.slice(0, 6)));

  if (hasArtwork) {
    // Artwork row sits below the 2 image rows. Image grid uses sectionInsetTop=80, 2 rows of 220 + 60 gap = 500
    // So artwork row label at +600 and images at +630.
    const artworkLabelY = SECTION_A_TOP + 620;
    const artworkRowTop = SECTION_A_TOP + 540; // imageGrid uses top + 80 + r*(220+60); for r=2 → 540+80=620 vs row 1 at 360
    objects.push(makeText(CANVAS_LEFT + 40, artworkLabelY, "ARTWORK", 11, "600", "#6b7280"));
    objects.push(...imageGrid(artworkRowTop, input.artwork!.slice(0, 3)));
  }

  // Section B — left side: swatches row then materials row; right side: notes column.
  objects.push(makeRoomZone(CANVAS_LEFT, sectionBTop, CANVAS_WIDTH, SECTION_B_HEIGHT, input.sectionB, input.zoneColorB || "#e8ebe6", 0.35));
  objects.push(makeText(CANVAS_LEFT + 24, sectionBTop + 18, input.sectionB.toUpperCase(), 12, "600", "#1e3a2f"));

  const materialsRowTop = sectionBTop + 240;

  if (input.swatches && input.swatches.length > 0) {
    objects.push(makeText(CANVAS_LEFT + 40, sectionBTop + 50, "PALETTE", 11, "600", "#6b7280"));
    objects.push(...swatchRow(sectionBTop, input.swatches.slice(0, 4)));
  }
  if (input.materials && input.materials.length > 0) {
    objects.push(makeText(CANVAS_LEFT + 40, materialsRowTop + 50, "MATERIALS", 11, "600", "#6b7280"));
    objects.push(...materialRow(materialsRowTop, input.materials.slice(0, 3)));
  }
  if (input.notes && input.notes.length > 0) {
    const notesLeftOffset = SECTION_B_LEFT_WIDTH + 20;
    objects.push(makeText(CANVAS_LEFT + notesLeftOffset, sectionBTop + 50, "NOTES", 11, "600", "#6b7280"));
    objects.push(...noteColumn(sectionBTop, notesLeftOffset, input.notes.slice(0, 2)));
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
    { url: unsplash("photo-1771371854543-bb274762389e"), caption: "Shaker uppers — BM White Dove OC-17" },
    { url: premiumUnsplash("premium_photo-1768228106004-912a8dc7b8bf"), caption: "Calacatta marble — 3cm waterfall island" },
    { url: unsplash("photo-1682888818650-0a7cbb35287d"), caption: "Marble counter w/ pendant lighting" },
    { url: unsplash("photo-1682888818589-404faaa4dbc9"), caption: "White cabinets w/ aged brass hardware" },
    { url: unsplash("photo-1682888818620-94875adf5bb9"), caption: "Open island layout — stone countertop" },
    { url: unsplash("photo-1771371854543-bb274762389e"), caption: "5\" white oak hardwood — wire-brushed matte" },
  ],
  swatches: [
    { name: "White Dove", hex: "#F3EFE6", code: "OC-17", brand: "Benjamin Moore" },
    { name: "Edgecomb Gray", hex: "#D5CEC4", code: "HC-173", brand: "Benjamin Moore" },
    { name: "Chantilly Lace", hex: "#F5F2ED", code: "OC-65", brand: "Benjamin Moore" },
    { name: "Aged Brass", hex: "#A8895C", code: "Hardware", brand: "Emtek" },
  ],
  materials: [
    { name: "White Oak Hardwood", supplier: "Local mill", code: "5\" plank", imageUrl: unsplash("photo-1572970385182-97a64c98205b"), notes: "Wire-brushed, matte poly. Continuous to dining." },
    { name: "Calacatta Nuvo Quartz", supplier: "Caesarstone", code: "5131", imageUrl: premiumUnsplash("premium_photo-1768228106004-912a8dc7b8bf"), notes: "Waterfall island. Eased edge perimeter." },
    { name: "Zellige Backsplash", supplier: "Cle Tile", code: "2×6 Weathered White", imageUrl: unsplash("photo-1682888818650-0a7cbb35287d"), notes: "Running bond. Extend to ceiling behind range." },
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
    { url: premiumUnsplash("premium_photo-1768423936222-9d2d803f3faf"), caption: "Freestanding tub — matte white" },
    { url: unsplash("photo-1759223607861-f0ef3e617739"), caption: "Marble vanity w/ glass shower" },
    { url: unsplash("photo-1771372012124-f7696f374a5a"), caption: "Freestanding tub w/ double vanity" },
    { url: unsplash("photo-1753605788101-04d1e653e74a"), caption: "Luxe freestanding bathtub" },
    { url: unsplash("photo-1765766600820-58eaf8687f1d"), caption: "Calacatta marble walls — shower" },
    { url: premiumUnsplash("premium_photo-1661884424253-08db7c7758ce"), caption: "Marble vanity — brushed brass fixtures" },
  ],
  swatches: [
    { name: "Pale Oak", hex: "#E8E0D4", code: "OC-20", brand: "Benjamin Moore" },
    { name: "White Heron", hex: "#F0EDE6", code: "OC-57", brand: "Benjamin Moore" },
    { name: "Brushed Brass", hex: "#B69672", code: "Fixtures", brand: "Brizo Litze" },
    { name: "Carrara White", hex: "#EDEAE3", code: "Mosaic", brand: "Stone Source" },
  ],
  materials: [
    { name: "Carrara Marble Hex", supplier: "Stone Source", code: "2\" mosaic", imageUrl: unsplash("photo-1765766600820-58eaf8687f1d"), notes: "Heated w/ Schluter Ditra-Heat under all tile." },
    { name: "Calacatta Porcelain", supplier: "Cle Tile", code: "24×48\"", imageUrl: premiumUnsplash("premium_photo-1768228106004-912a8dc7b8bf"), notes: "Shower walls. Niche in accent stone." },
    { name: "White Oak Vanity", supplier: "Custom mill", code: "Floating, 60\"", imageUrl: unsplash("photo-1572970385182-97a64c98205b"), notes: "Quartz top, undermount basins." },
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
    { url: unsplash("photo-1693498871905-3b0646657786"), caption: "Cedar exterior on the lake" },
    { url: premiumUnsplash("premium_photo-1663091687045-d108c7fb83e4"), caption: "Modern cottage on a quiet lake" },
    { url: unsplash("photo-1693498868381-fef2612e49dd"), caption: "Lakeside dock — cedar decking" },
    { url: unsplash("photo-1559767949-0faa5c7e9992"), caption: "Lakefront cottage facade" },
    { url: unsplash("photo-1586090097830-147b7f2be946"), caption: "Vaulted great room w/ wood beams" },
    { url: unsplash("photo-1572970385182-97a64c98205b"), caption: "Cottage interior — white oak floors" },
  ],
  swatches: [
    { name: "Driftwood Grey", hex: "#9E9689", code: "Semi-trans.", brand: "Cabot Stain" },
    { name: "Matte Black", hex: "#2A2A2A", code: "Standing seam", brand: "Metal roof" },
    { name: "White Dove", hex: "#F3EFE6", code: "OC-17", brand: "Benjamin Moore" },
    { name: "Salamander", hex: "#1E3A2F", code: "2050-10", brand: "Benjamin Moore" },
  ],
  materials: [
    { name: "Cedar Board & Batten", supplier: "Local sawmill", code: "1×10 + 1×3", imageUrl: unsplash("photo-1693498871905-3b0646657786"), notes: "Semi-transparent stain. Re-stain every 5 yrs." },
    { name: "Loewen Triple-Glaze", supplier: "Loewen", code: "Douglas fir", imageUrl: unsplash("photo-1559767949-0faa5c7e9992"), notes: "8' sliding door to screened porch." },
    { name: "TimberTech Decking", supplier: "TimberTech", code: "Composite", imageUrl: unsplash("photo-1693498868381-fef2612e49dd"), notes: "Steel cable rail along all decks." },
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
    { url: premiumUnsplash("premium_photo-1722048810826-751afbcc98c0"), caption: "Wabi-sabi interior — warm neutrals" },
    { url: premiumUnsplash("premium_photo-1705262413765-5fe7a310d4e6"), caption: "Beige living room — layered textures" },
    { url: unsplash("photo-1572970385182-97a64c98205b"), caption: "Wire-brushed white oak — matte poly" },
    { url: premiumUnsplash("premium_photo-1768228106004-912a8dc7b8bf"), caption: "Stone surface — calacatta marble" },
    { url: unsplash("photo-1771371854543-bb274762389e"), caption: "White oak + aged brass hardware" },
    { url: premiumUnsplash("premium_photo-1673152979577-64b00806a6d1"), caption: "Beige textured wall — wabi-sabi" },
  ],
  artwork: [
    { url: premiumUnsplash("premium_photo-1673152979577-64b00806a6d1"), caption: "Textured beige wall art" },
    { url: premiumUnsplash("premium_photo-1722048810826-751afbcc98c0"), caption: "Sculptural neutral form" },
    { url: unsplash("photo-1572970385182-97a64c98205b"), caption: "Wood + sculpture detail" },
  ],
  swatches: [
    { name: "White Dove", hex: "#F3EFE6", code: "OC-17", brand: "Benjamin Moore" },
    { name: "Salamander", hex: "#1E3A2F", code: "2050-10", brand: "Benjamin Moore" },
    { name: "Alabaster", hex: "#F0EDE5", code: "SW 7008", brand: "Sherwin-Williams" },
    { name: "Chantilly Lace", hex: "#F5F2ED", code: "OC-65", brand: "Benjamin Moore" },
  ],
  materials: [
    { name: "White Oak", supplier: "Local mill", code: "Wire-brushed", imageUrl: unsplash("photo-1572970385182-97a64c98205b"), notes: "Floors, vanity, shelving. Matte poly." },
    { name: "Muskoka Granite", supplier: "Local quarry", code: "Fieldstone", imageUrl: premiumUnsplash("premium_photo-1768228106004-912a8dc7b8bf"), notes: "Fireplace surround. Honed Carrara in baths." },
    { name: "Performance Linen", supplier: "Kravet", code: "Oatmeal", imageUrl: premiumUnsplash("premium_photo-1722048810826-751afbcc98c0"), notes: "Sofa + drapery. Wool bouclé on accent chair." },
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
    { url: unsplash("photo-1586090097830-147b7f2be946"), caption: "Before — replace with current piece photo" },
    { url: premiumUnsplash("premium_photo-1705262413765-5fe7a310d4e6"), caption: "Client inspiration — replace with reference" },
    { url: unsplash("photo-1572970385182-97a64c98205b"), caption: "Proposed direction — natural wood finish" },
    { url: premiumUnsplash("premium_photo-1722048810826-751afbcc98c0"), caption: "Wood grain reference — matching tone" },
    { url: unsplash("photo-1771371854543-bb274762389e"), caption: "Hardware reference — aged brass" },
    { url: premiumUnsplash("premium_photo-1673152979577-64b00806a6d1"), caption: "Edge profile + finish detail" },
  ],
  swatches: [
    { name: "Simply White", hex: "#F4F1E8", code: "OC-117", brand: "Benjamin Moore" },
    { name: "Special Walnut", hex: "#7A5230", code: "224", brand: "Minwax" },
    { name: "Rubio Pure", hex: "#D9D4CB", code: "Monocoat", brand: "Rubio" },
    { name: "Aged Brass", hex: "#A8895C", code: "US7", brand: "Emtek" },
  ],
  materials: [
    { name: "White Oak Grain", supplier: "Reference", code: "Direction", imageUrl: unsplash("photo-1572970385182-97a64c98205b"), notes: "Visible grain to remain. Reduce orange undertone." },
    { name: "Eased Edge Profile", supplier: "Custom mill", code: "3mm radius", imageUrl: premiumUnsplash("premium_photo-1722048810826-751afbcc98c0"), notes: "Sand to 220. Dust off twice before finish." },
    { name: "Rubio Monocoat", supplier: "Rubio", code: "Pure 2C", imageUrl: unsplash("photo-1771371854543-bb274762389e"), notes: "Matte. Sample approval before final." },
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
    { url: unsplash("photo-1586090097830-147b7f2be946"), caption: "Renovation overview" },
    { url: premiumUnsplash("premium_photo-1722048810826-751afbcc98c0"), caption: "House floor plan — replace with project plan" },
    { url: premiumUnsplash("premium_photo-1705262413765-5fe7a310d4e6"), caption: "Living room moodboard" },
    { url: unsplash("photo-1771371854543-bb274762389e"), caption: "Kitchen moodboard" },
    { url: premiumUnsplash("premium_photo-1722048810826-751afbcc98c0"), caption: "Feature wall inspiration" },
    { url: unsplash("photo-1572970385182-97a64c98205b"), caption: "Floating display unit" },
  ],
  artwork: [
    { url: premiumUnsplash("premium_photo-1673152979577-64b00806a6d1"), caption: "Textured neutral artwork" },
    { url: premiumUnsplash("premium_photo-1722048810826-751afbcc98c0"), caption: "Sculptural form study" },
    { url: unsplash("photo-1572970385182-97a64c98205b"), caption: "Material detail piece" },
  ],
  swatches: [
    { name: "Horizon", hex: "#6FA7B4", code: "", brand: "" },
    { name: "Birchwood", hex: "#E5D3B4", code: "", brand: "" },
    { name: "White Dove", hex: "#F3EFE6", code: "OC-17", brand: "Benjamin Moore" },
    { name: "Charcoal", hex: "#3A3A3A", code: "", brand: "" },
  ],
  materials: [
    { name: "Architectural Detail", supplier: "Existing", code: "Trim + millwork", imageUrl: unsplash("photo-1586090097830-147b7f2be946"), notes: "Emphasise the home's existing architectural character." },
    { name: "Stone Surface", supplier: "To source", code: "Sample", imageUrl: premiumUnsplash("premium_photo-1768228106004-912a8dc7b8bf"), notes: "Add product references. Mark anything still to source." },
    { name: "Floating Shelf", supplier: "Custom mill", code: "White oak", imageUrl: unsplash("photo-1572970385182-97a64c98205b"), notes: "Reserve room for arrows and callouts on plan." },
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
    { url: premiumUnsplash("premium_photo-1722048810826-751afbcc98c0"), caption: "Linen + natural texture" },
    { url: unsplash("photo-1572970385182-97a64c98205b"), caption: "White oak — wire-brushed grain" },
    { url: unsplash("photo-1771371854543-bb274762389e"), caption: "Aged brass hardware detail" },
    { url: premiumUnsplash("premium_photo-1768228106004-912a8dc7b8bf"), caption: "Calacatta marble surface" },
    { url: premiumUnsplash("premium_photo-1705262413765-5fe7a310d4e6"), caption: "Beige interior — layered" },
    { url: premiumUnsplash("premium_photo-1673152979577-64b00806a6d1"), caption: "Textured beige wall" },
  ],
  artwork: [
    { url: premiumUnsplash("premium_photo-1673152979577-64b00806a6d1"), caption: "Wabi-sabi wall texture" },
    { url: premiumUnsplash("premium_photo-1722048810826-751afbcc98c0"), caption: "Sculptural object" },
    { url: unsplash("photo-1572970385182-97a64c98205b"), caption: "Wood + form detail" },
  ],
  swatches: [
    { name: "Hemlock", hex: "#556B3F", code: "Accent", brand: "" },
    { name: "Espresso", hex: "#5A443D", code: "Wood", brand: "" },
    { name: "Birchwood", hex: "#E5D3B4", code: "Light", brand: "" },
    { name: "Linen", hex: "#E8E0D4", code: "Neutral", brand: "" },
  ],
  materials: [
    { name: "Oak Veneer", supplier: "Local mill", code: "Bar top", imageUrl: unsplash("photo-1572970385182-97a64c98205b"), notes: "Bar top + display shelving." },
    { name: "Herringbone Stone", supplier: "Stone Source", code: "Pattern", imageUrl: premiumUnsplash("premium_photo-1768228106004-912a8dc7b8bf"), notes: "Feature wall in entry." },
    { name: "European Linen", supplier: "Kravet", code: "Oatmeal", imageUrl: premiumUnsplash("premium_photo-1722048810826-751afbcc98c0"), notes: "Drapery + accent pillows." },
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
