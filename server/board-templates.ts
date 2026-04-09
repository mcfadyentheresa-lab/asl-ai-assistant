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

const kitchenRenovation = wrap([
  makeSectionHeader(40, 20, "Kitchen Renovation"),

  makeRoomZone(30, 60, 520, 380, "Cabinetry & Surfaces", "#eae6df", 0.4),
  makeRoomZone(570, 60, 480, 340, "Lighting & Backsplash", "#e8ebe6", 0.35),
  makeRoomZone(30, 480, 700, 280, "Specifications", "#e6e3dc", 0.3),

  makeImage(50, 80, `${IMG}/kitchen-cabinets.png`, "Shaker-style maple uppers in BM White Dove OC-17", 380, 290),
  makeImage(300, 200, `${IMG}/kitchen-countertop.png`, "Caesarstone Calacatta Nuvo 5131 — 3cm waterfall island", 240, 180),

  makeColorSwatch(60, 310, "White Dove", "#f3efe6", "#F3EFE6", "OC-17", "Benjamin Moore", 140),
  makeColorSwatch(180, 340, "Edgecomb Gray", "#d5cec4", "#D5CEC4", "HC-173", "Benjamin Moore", 130),
  makeColorSwatch(410, 330, "Chantilly Lace", "#f5f2ed", "#F5F2ED", "OC-65", "Benjamin Moore", 130),

  makeImage(590, 80, `${IMG}/kitchen-range.png`, "Wolf 48\" dual-fuel range w/ Zephyr Cypress hood", 300, 230),
  makeImage(620, 220, `${IMG}/kitchen-tile.png`, "Cle Tile zellige 2×6\" in Weathered White, running bond", 240, 160),
  makeImage(870, 180, `${IMG}/kitchen-pendants.png`, "3× Schoolhouse Otis pendants — aged brass, 10\" globes", 170, 170),

  makeCallout(870, 100, "Aged brass throughout", "#fef9c3", 160, 60),

  makeProduct(50, 500, "Caesarstone Calacatta Nuvo", "$85/sq ft", "Caesarstone", "https://caesarstone.ca"),
  makeProduct(290, 500, "Emtek Morris Cup Pull 3\"", "$32 each", "Emtek"),
  makeProduct(50, 640, "Sub-Zero 36\" French Door", "$12,400", "Sub-Zero"),

  makeMaterial(500, 500, "White Oak Hardwood", "Local mill", "5\" plank", `${IMG}/mood-oak-floor.png`, "Wire-brushed, matte poly. Run continuous to dining."),

  makeSticky(290, 640, "Soft-close hinges throughout.\nBrass cup pulls on all lowers.\nLower bases: walnut stain.", "#fef9c3", 200, 80),
  makeSticky(510, 700, "Budget note: Island is focal\npoint — allocate 40% of\ncabinetry budget here.", "#fef9c3", 200, 80),
  makeSticky(750, 500, "Lead times: cabinets 12 wks,\ncountertops 6 wks. Order\nbefore framing complete.", "#fef9c3", 220, 80),

  makeCallout(750, 600, "WAC LED tape — 3000K\nunder all uppers. Dimmable.", "#f3e8ff", 210, 60),

  makeSticky(750, 680, "Mapei Keracolor U grout in\nFrost #77. Sealed finish.\nExtend tile to ceiling\nbehind range.", "#fce7f3", 220, 90),
  makeSticky(510, 800, "Perimeter counters: eased\nedge. Colour-matched caulk.\nIntegrated drainboard area.", "#fce7f3", 220, 90),
]);

const bathroomRenovation = wrap([
  makeSectionHeader(40, 20, "Bathroom Renovation"),

  makeRoomZone(30, 60, 500, 400, "Fixtures & Bathing", "#e6e9ec", 0.4),
  makeRoomZone(550, 60, 470, 360, "Finishes & Lighting", "#ece8e3", 0.35),
  makeRoomZone(30, 490, 700, 320, "Materials & Notes", "#e3e6e1", 0.3),

  makeImage(50, 80, `${IMG}/bath-tub.png`, "Victoria + Albert Napoli freestanding — matte white, 65×29\"", 360, 280),
  makeImage(280, 220, `${IMG}/bath-vanity.png`, "60\" double vanity — white oak floating, quartz top", 240, 190),

  makeCallout(50, 380, "Heated floors mandatory", "#dbeafe", 190, 55),

  makeImage(570, 80, `${IMG}/bath-sconce.png`, "Cedar & Moss Alto sconces — brushed brass, 3000K", 260, 220),
  makeImage(610, 230, `${IMG}/bath-hex-tile.png`, "Heated 2\" Carrara hex mosaic w/ Schluter Ditra-Heat", 240, 170),

  makeColorSwatch(860, 80, "Pale Oak", "#e8e0d4", "#E8E0D4", "OC-20", "Benjamin Moore", 140),
  makeColorSwatch(880, 240, "White Heron", "#f0ede6", "#F0EDE6", "OC-57", "Benjamin Moore", 130),

  makeCallout(870, 370, "4\" IC-rated wet cans\nin shower — dimmable", "#f3e8ff", 150, 55),

  makeProduct(570, 430, "Brizo Litze Widespread", "$680", "Brizo", "https://brizo.com"),
  makeProduct(780, 430, "Toto Drake II ADA", "$520", "Toto"),

  makeMaterial(50, 510, "Carrara Marble Hex", "Stone Source", "2\" mosaic", `${IMG}/bath-hex-tile.png`, "Heated w/ Schluter Ditra-Heat mat under all tile."),
  makeMaterial(290, 510, "Large-Format Porcelain", "Cle Tile", "24×48\" Calacatta", "", "Shower walls. Niche in accent stone."),

  makeSticky(530, 550, "Thermostatic valve —\n2-function diverter.\nRough-in at 48\" centre.", "#dbeafe", 220, 80),
  makeSticky(530, 650, "Recessed medicine cabinet\nw/ LED surround. Full-\nlength linen tower beside.", "#f3e8ff", 200, 80),

  makeSticky(50, 710, "Brizo Litze luxe gold finish.\nMatching tub filler with\nhand shower attachment.", "#fef9c3", 220, 80),
  makeSticky(290, 710, "Toto Drake II elongated —\nADA height. Concealed\ntrapway, SoftClose seat.", "#fef9c3", 220, 80),
]);

const fullCottageBuild = wrap([
  makeSectionHeader(40, 20, "Full Cottage Build"),

  makeRoomZone(30, 60, 560, 420, "Exterior & Structure", "#e4e1db", 0.4),
  makeRoomZone(610, 60, 440, 380, "Lakefront & Dock", "#dce5e8", 0.35),
  makeRoomZone(30, 510, 520, 370, "Interior & Living", "#e8e5df", 0.3),
  makeRoomZone(570, 480, 490, 400, "Mechanical & Systems", "#e1e4df", 0.3),

  makeImage(50, 80, `${IMG}/cottage-exterior.png`, "Board-and-batten cedar siding — semi-transparent Driftwood Grey", 400, 300),
  makeImage(320, 250, `${IMG}/cottage-trusses.png`, "Vaulted great room w/ exposed timber trusses, lake view", 260, 200),

  makeColorSwatch(60, 340, "Driftwood Grey", "#9e9689", "#9E9689", "Semi-transparent", "Siding stain", 140),
  makeColorSwatch(180, 370, "Matte Black", "#2a2a2a", "#2A2A2A", "Metal roof", "Standing seam", 130),

  makeImage(630, 80, `${IMG}/cottage-dock.png`, "Permanent dock — steel frame, cedar decking, boat lift", 340, 260),

  makeCallout(640, 290, "Confirm dock permit\nw/ township first", "#fef9c3", 180, 55),
  makeCallout(850, 290, "Steel cable rail\nalong all decks", "#dcfce7", 160, 55),

  makeProduct(830, 80, "Loewen Douglas Fir Triple-Glaze", "$2,800/unit", "Loewen"),
  makeProduct(830, 210, "TimberTech Composite Decking", "$14/sq ft", "TimberTech", "https://timbertech.com"),

  makeImage(50, 530, `${IMG}/cottage-fireplace.png`, "Muskoka granite fieldstone fireplace surround", 300, 240),
  makeImage(240, 660, `${IMG}/mood-sofa.png`, "Performance linen in oatmeal — great room seating", 250, 190),

  makeCallout(360, 550, "Primary suite: lake side\nwalk-in + ensuite", "#dbeafe", 180, 55),

  makeMaterial(50, 790, "Cedar Board & Batten", "Local sawmill", "1×10 + 1×3 battens", "", "Semi-transparent stain in Driftwood Grey. Re-stain every 5 yrs."),

  makeSticky(290, 870, "Loewen Douglas fir triple-\nglaze windows. 8' sliding\ndoor to screened porch.", "#dcfce7", 220, 80),

  makeProduct(590, 500, "Mitsubishi Hyper-Heat Mini-Split", "$8,200", "Mitsubishi"),

  makeSticky(590, 640, "200A panel — whole-home\nsurge. Pre-wire for EV\ncharger in carport.", "#fef9c3", 220, 80),
  makeSticky(830, 500, "PEX manifold system.\nRinnai tankless water\nheater — recirculating.", "#fce7f3", 220, 80),
  makeSticky(830, 600, "Mitsubishi Hyper-Heat\nmini-split — 4 zones.\nIn-floor radiant backup.", "#fce7f3", 220, 80),

  makeSticky(590, 740, "3 guest bunkie rooms on\nlower level. Shared bath\nw/ double vanity.", "#dbeafe", 220, 80),
  makeSticky(830, 710, "Engineered septic bed —\nClass 4 system. Drilled\nwell, UV filter.", "#fce7f3", 220, 80),

  makeSticky(590, 840, "Native Muskoka plantings:\nwhite birch, ferns, juniper.\nLow-maintenance beds.", "#fef9c3", 220, 80),
  makeSticky(830, 810, "Path lighting: Kichler LED\nbollards along walkway.\nDeck rail strip lighting.", "#fef9c3", 220, 80),

  makeCallout(300, 560, "Open kitchen to dining —\n14' live-edge harvest table", "#dbeafe", 200, 55),
]);

const moodboard = wrap([
  makeSectionHeader(40, 20, "Moodboard"),

  makeRoomZone(30, 60, 560, 420, "Inspiration & Palette", "#ece8e3", 0.4),
  makeRoomZone(610, 60, 420, 380, "Colour Story", "#e5e8e3", 0.35),
  makeRoomZone(30, 510, 500, 350, "Materials & Textures", "#e3e0da", 0.3),
  makeRoomZone(550, 480, 490, 380, "Details & Notes", "#e8e5df", 0.3),

  makeImage(50, 80, `${IMG}/mood-sofa.png`, "Performance linen sofa — oatmeal. Wool bouclé accents.", 400, 300),
  makeImage(330, 260, `${IMG}/mood-oak-floor.png`, "Wire-brushed white oak 5\" planks — matte poly finish", 250, 190),

  makeImage(50, 340, `${IMG}/cottage-fireplace.png`, "Muskoka granite fieldstone for fireplace surround", 240, 180),

  makeCallout(310, 80, "Client loves warm minimal\nNo farmhouse or rustic", "#fef9c3", 200, 55),

  makeColorSwatch(630, 80, "White Dove", "#f3efe6", "#F3EFE6", "OC-17", "Benjamin Moore", 140),
  makeColorSwatch(790, 80, "Salamander", "#1e3a2f", "#1E3A2F", "2050-10", "Benjamin Moore", 140),
  makeColorSwatch(630, 260, "Alabaster", "#f0ede5", "#F0EDE5", "SW 7008", "Sherwin-Williams", 140),
  makeColorSwatch(790, 260, "Chantilly Lace", "#f5f2ed", "#F5F2ED", "OC-65", "Benjamin Moore", 140),

  makeCallout(650, 200, "Max 3–4 colours.\nLet wood tones do the work.", "#f3e8ff", 190, 55),

  makeImage(930, 150, `${IMG}/kitchen-cabinets.png`, "White oak + aged brass hardware throughout", 200, 170),
  makeImage(930, 300, `${IMG}/bath-sconce.png`, "Cedar & Moss sconce — aged brass, 3000K", 180, 150),

  makeMaterial(50, 530, "White Oak", "Local mill", "Wire-brushed natural", `${IMG}/mood-oak-floor.png`, "Floors, vanity, shelving. Matte poly finish."),
  makeMaterial(290, 530, "Muskoka Granite", "Local quarry", "Fieldstone", `${IMG}/cottage-fireplace.png`, "Fireplace surround. Honed Carrara in baths."),

  makeProduct(50, 730, "Aged Brass Cup Pulls", "$32 each", "Emtek"),
  makeProduct(290, 730, "Performance Linen Fabric", "$95/yd", "Kravet"),

  makeCallout(50, 860, "Lake Joseph cottage —\nArchitectural Digest inspo", "#dbeafe", 210, 55),
  makeCallout(280, 860, "Studio McGee living room\nvaulted cedar + linen", "#dbeafe", 210, 55),

  makeProduct(570, 500, "Wool Bouclé Accent Chair", "$2,400", "Restoration Hardware"),

  makeSticky(570, 640, "Budget: $450K reno +\n$80K furnishings.\nPrioritise kitchen & baths.", "#fef9c3", 220, 80),
  makeSticky(810, 500, "Aged brass hardware\nthroughout. Matte black\non exterior doors only.", "#fed7aa", 220, 80),
  makeSticky(810, 600, "Trim: BM Chantilly Lace\nOC-65. Ceiling: flat.\nAll trim semi-gloss.", "#f3e8ff", 220, 80),
  makeSticky(570, 740, "Target: break ground May.\nCabinets 12-wk lead time\n— order by Feb 15.", "#fef9c3", 220, 80),
  makeSticky(810, 710, "Keep palette to 3-4 colours\nmax. Let natural wood\ntones do the work.", "#f3e8ff", 220, 80),
  makeSticky(570, 840, "Confirm dock permit w/\ntownship. Check setback\nrules for screened porch.", "#fef9c3", 220, 80),
]);

const furnitureRefinishingConceptBoardWorking = wrap([
  makeSectionHeader(40, 20, "Furniture Refinishing Concept Board"),
  makeText(40, 54, "PROJECT NAME", 13, "600", "#6b7280"),
  makeText(40, 76, "Working Board", 18, "bold", "#1e3a2f"),

  makeRoomZone(30, 110, 320, 520, "Before + Client Ideas", "#f3efe8", 0.42),
  makeRoomZone(370, 110, 360, 520, "Proposed Direction", "#ede8e1", 0.42),
  makeRoomZone(750, 110, 210, 230, "Swatches", "#f4f0ea", 0.42),
  makeRoomZone(750, 360, 210, 310, "Materials + Notes", "#ece7df", 0.42),
  makeRoomZone(30, 650, 930, 170, "Planning Notes", "#f7f4ef", 0.35),

  makeImage(50, 140, "", "Before", 270, 170),
  makeImage(50, 335, "", "Client Inspiration", 270, 200),
  makeImage(390, 140, "", "Proposed Direction", 300, 230),
  makeCallout(420, 390, "Add one clean arrow callout if needed", "#f7f4ef", 180, 45),

  makeColorSwatch(770, 140, "Paint Colour", "#f3efe6", "#F3EFE6", "Placeholder", "", 160),
  makeColorSwatch(770, 220, "Stain Colour", "#b58a63", "#B58A63", "Placeholder", "", 160),
  makeColorSwatch(770, 300, "Finish Sample", "#d9d4cb", "#D9D4CB", "Placeholder", "", 160),

  makeMaterial(770, 380, "Wood Grain", "", "", "", "Use for grain direction, edges, and repair notes."),
  makeMaterial(770, 485, "Texture Reference", "", "", "", "Secondary materials, hardware, or finish close-ups."),

  makeSticky(50, 675, "Visible grain to remain.\nReduce orange/red undertone.", "#f7f4ef", 210, 70),
  makeSticky(280, 675, "Matte protective topcoat.\nSample approval before final.", "#f7f4ef", 210, 70),
  makeSticky(510, 675, "Durability for high-use piece.\nKeep notes short and clear.", "#f7f4ef", 210, 70),
]);

const collageConceptBoard = wrap([
  makeSectionHeader(40, 20, "Concept Board"),

  makeRoomZone(30, 60, 200, 540, "Renovation", "#f6f3ee", 0.48),
  makeRoomZone(250, 60, 220, 260, "Design & construction", "#f6f3ee", 0.48),
  makeRoomZone(490, 60, 390, 540, "Floor Plan", "#f6f3ee", 0.48),
  makeRoomZone(900, 60, 220, 220, "Feature Desk", "#f6f3ee", 0.48),
  makeRoomZone(900, 300, 220, 220, "Swatches", "#f6f3ee", 0.48),
  makeRoomZone(900, 540, 220, 180, "Display Shelf", "#f6f3ee", 0.48),

  makeImage(40, 80, "", "Renovation", 180, 140),
  makeText(55, 238, "Objectives", 16, "bold", "#1e1e1e"),
  makeSticky(50, 275, "Emphasise the home’s existing architectural character.\nUse soft, warm materials.\nKeep the palette calm and timeless.", "#ffffff", 160, 95),

  makeText(270, 86, "1. Livngroom Moodboard", 14, "bold", "#1e1e1e"),
  makeText(270, 138, "2. Study Moodboard", 14, "bold", "#1e1e1e"),
  makeText(270, 190, "3. Kitchen moodboard", 14, "bold", "#1e1e1e"),
  makeText(270, 235, "Things to buy", 16, "bold", "#1e1e1e"),
  makeSticky(270, 280, "Materials checklist\nAdd product references\nMark anything still to source.", "#ffffff", 180, 88),

  makeImage(520, 80, "", "House floorplan", 340, 420),
  makeCallout(560, 510, "Use a clean plan with a few highlighted zones", "#ffffff", 240, 54),

  makeImage(920, 80, "", "Bright feature desk", 180, 120),
  makeColorSwatch(920, 330, "Horizon", "#6fa7b4", "#6FA7B4", "", "", 90),
  makeColorSwatch(1015, 330, "Birchwood", "#e5d3b4", "#E5D3B4", "", "", 90),
  makeImage(920, 570, "", "Floating display unit", 180, 110),

  makeSticky(40, 590, "Add client notes and approvals here.", "#ffffff", 170, 70),
  makeSticky(250, 590, "Keep the board airy and presentation-ready.", "#ffffff", 170, 70),
  makeSticky(490, 590, "Reserve room for arrows and callouts.", "#ffffff", 250, 70),
]);

const materialInspirationBoard = wrap([
  makeSectionHeader(40, 20, "Material Inspiration Board"),

  makeRoomZone(140, 60, 260, 360, "Fabric Samples", "#f5f3ef", 0.45),
  makeRoomZone(420, 60, 220, 220, "Stone / Pattern", "#f5f3ef", 0.45),
  makeRoomZone(650, 60, 220, 180, "Dark Wood", "#f5f3ef", 0.45),
  makeRoomZone(650, 260, 220, 140, "Label", "#f5f3ef", 0.45),
  makeRoomZone(890, 170, 240, 290, "Oak Veneer", "#f5f3ef", 0.45),
  makeRoomZone(420, 300, 240, 250, "Lighting + Objects", "#f5f3ef", 0.45),
  makeRoomZone(680, 430, 180, 120, "Colour Chip", "#f5f3ef", 0.45),
  makeRoomZone(885, 470, 220, 170, "Door Handles", "#f5f3ef", 0.45),

  makeImage(150, 80, "", "European fabric samples", 220, 180),
  makeCallout(80, 110, "European fabric\nsamples", "#5a443d", 90, 80),

  makeImage(430, 70, "", "Herringbone pattern", 210, 180),
  makeText(500, 220, "Herringbone pattern", 18, "bold", "#2f2a28"),

  makeImage(660, 70, "", "Dark wood grain", 180, 120),
  makeText(715, 165, "Wenge spruce", 14, "400", "#1f1f1f"),

  makeImage(430, 220, "", "Textured lamp", 240, 230),
  makeCallout(470, 330, "Hemlock", "#556b3f", 120, 60),

  makeImage(650, 290, "", "Oak veneer finish", 210, 190),
  makeCallout(920, 370, "Bar top oak veneer finish", "#f5f3ef", 170, 55),

  makeImage(900, 180, "", "Oak veneer finish", 200, 220),
  makeImage(910, 490, "", "Door handles", 190, 120),
  makeCallout(900, 500, "Entry door handles", "#f5f3ef", 150, 55),

  makeSticky(430, 500, "Oak side tables", "#ffffff", 150, 60),
  makeSticky(650, 540, "Keep the palette grounded.", "#ffffff", 150, 60),
  makeSticky(920, 610, "Use a single dark accent piece.", "#ffffff", 150, 60),
]);

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
    id: "collage-concept",
    name: "Collage Concept Board",
    description: "Multi-column presentation board with plan, notes, swatches, and feature images",
    icon: "LayoutPanelLeft",
    image: "/assets/images/Screenshot_2026-04-09_at_10.54.53_AM_1775746499391.png",
    canvasData: collageConceptBoard,
  },
  {
    id: "material-inspiration",
    name: "Material Inspiration Board",
    description: "Layered collage board for fabrics, finishes, wood tones, and product inspiration",
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
