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

  makeImage(40, 70, `${IMG}/kitchen-cabinets.png`, "Shaker-style maple uppers in BM White Dove OC-17", 320, 240),
  makeImage(380, 70, `${IMG}/kitchen-countertop.png`, "Caesarstone Calacatta Nuvo 5131 — 3cm waterfall island", 300, 200),
  makeImage(700, 70, `${IMG}/kitchen-range.png`, "Wolf 48\" dual-fuel range w/ Zephyr Cypress hood", 260, 200),

  makeColorSwatch(40, 330, "White Dove", "#f3efe6", "#F3EFE6", "OC-17", "Benjamin Moore", 160),
  makeColorSwatch(220, 330, "Edgecomb Gray", "#d5cec4", "#D5CEC4", "HC-173", "Benjamin Moore", 160),
  makeColorSwatch(400, 330, "Chantilly Lace", "#f5f2ed", "#F5F2ED", "OC-65", "Benjamin Moore", 160),

  makeImage(580, 290, `${IMG}/kitchen-tile.png`, "Cle Tile zellige 2×6\" in Weathered White, running bond", 260, 180),
  makeImage(860, 290, `${IMG}/kitchen-pendants.png`, "3× Schoolhouse Otis pendants — aged brass, 10\" globes", 200, 180),

  makeProduct(40, 550, "Caesarstone Calacatta Nuvo", "$85/sq ft", "Caesarstone", "https://caesarstone.ca"),
  makeProduct(280, 550, "Emtek Morris Cup Pull 3\"", "$32 each", "Emtek"),
  makeProduct(520, 550, "Sub-Zero 36\" French Door", "$12,400", "Sub-Zero"),

  makeMaterial(760, 550, "White Oak Hardwood", "Local mill", "5\" plank", `${IMG}/mood-oak-floor.png`, "Wire-brushed, matte poly. Run continuous to dining."),

  makeSticky(40, 690, "Soft-close hinges throughout.\nBrass cup pulls on all lowers.\nLower bases: walnut stain.", "#fef9c3", 220, 80),
  makeSticky(280, 690, "Budget note: Island is focal\npoint — allocate 40% of\ncabinetry budget here.", "#fef9c3", 220, 80),
  makeSticky(520, 690, "Lead times: cabinets 12 wks,\ncountertops 6 wks. Order\nbefore framing complete.", "#fef9c3", 220, 80),
  makeSticky(760, 750, "WAC LED tape — 3000K warm\nwhite under all uppers.\nDimmable Lutron Caseta.", "#fef9c3", 220, 80),

  makeSticky(40, 790, "Mapei Keracolor U grout in\nFrost #77. Sealed finish.\nExtend tile to ceiling\nbehind range.", "#fce7f3", 220, 90),
  makeSticky(280, 790, "Perimeter counters: eased\nedge. Colour-matched caulk.\nIntegrated drainboard area.", "#fce7f3", 220, 90),
]);

const bathroomRenovation = wrap([
  makeSectionHeader(40, 20, "Bathroom Renovation"),

  makeImage(40, 70, `${IMG}/bath-tub.png`, "Victoria + Albert Napoli freestanding — matte white, 65×29\"", 300, 240),
  makeImage(360, 70, `${IMG}/bath-vanity.png`, "60\" double vanity — white oak floating, quartz top", 300, 200),
  makeImage(680, 70, `${IMG}/bath-sconce.png`, "Cedar & Moss Alto sconces — brushed brass, 3000K", 220, 200),

  makeImage(40, 330, `${IMG}/bath-hex-tile.png`, "Heated 2\" Carrara hex mosaic w/ Schluter Ditra-Heat", 260, 180),

  makeColorSwatch(320, 330, "Pale Oak", "#e8e0d4", "#E8E0D4", "OC-20", "Benjamin Moore", 160),
  makeColorSwatch(500, 330, "White Heron", "#f0ede6", "#F0EDE6", "OC-57", "Benjamin Moore", 160),

  makeProduct(680, 290, "Brizo Litze Widespread", "$680", "Brizo", "https://brizo.com"),
  makeProduct(680, 420, "Toto Drake II ADA", "$520", "Toto"),

  makeMaterial(320, 530, "Carrara Marble Hex", "Stone Source", "2\" mosaic", `${IMG}/bath-hex-tile.png`, "Heated w/ Schluter Ditra-Heat mat under all tile."),
  makeMaterial(560, 530, "Large-Format Porcelain", "Cle Tile", "24×48\" Calacatta", "", "Shower walls. Niche in accent stone."),

  makeSticky(40, 530, "Heated floors mandatory.\nSchluter Ditra-Heat mat\nunder all tile areas.", "#dbeafe", 260, 80),
  makeSticky(40, 625, "Thermostatic valve —\n2-function diverter.\nRough-in at 48\" centre.", "#dbeafe", 260, 80),
  makeSticky(800, 530, "4\" IC-rated recessed cans\nin shower (wet-rated).\nDimmable Lutron switch.", "#f3e8ff", 200, 80),
  makeSticky(800, 625, "Recessed medicine cabinet\nw/ LED surround. Full-\nlength linen tower beside.", "#f3e8ff", 200, 80),

  makeSticky(40, 720, "Brizo Litze luxe gold finish.\nMatching tub filler with\nhand shower attachment.", "#fef9c3", 260, 80),
  makeSticky(320, 720, "Toto Drake II elongated —\nADA height. Concealed\ntrapway, SoftClose seat.", "#fef9c3", 260, 80),
]);

const fullCottageBuild = wrap([
  makeSectionHeader(40, 20, "Full Cottage Build"),

  makeImage(40, 70, `${IMG}/cottage-exterior.png`, "Board-and-batten cedar siding — semi-transparent Driftwood Grey", 340, 260),
  makeImage(400, 70, `${IMG}/cottage-trusses.png`, "Vaulted great room w/ exposed timber trusses, lake view", 300, 220),
  makeImage(720, 70, `${IMG}/cottage-dock.png`, "Permanent dock — steel frame, cedar decking, boat lift", 280, 220),

  makeImage(40, 350, `${IMG}/cottage-fireplace.png`, "Muskoka granite fieldstone fireplace surround", 280, 220),
  makeImage(340, 350, `${IMG}/mood-sofa.png`, "Performance linen in oatmeal — great room seating", 260, 200),

  makeColorSwatch(620, 350, "Driftwood Grey", "#9e9689", "#9E9689", "Semi-transparent", "Siding stain", 160),
  makeColorSwatch(800, 350, "Matte Black", "#2a2a2a", "#2A2A2A", "Metal roof", "Standing seam", 160),

  makeProduct(40, 590, "Loewen Douglas Fir Triple-Glaze", "$2,800/unit", "Loewen"),
  makeProduct(280, 590, "TimberTech Composite Decking", "$14/sq ft", "TimberTech", "https://timbertech.com"),
  makeProduct(520, 590, "Mitsubishi Hyper-Heat Mini-Split", "$8,200", "Mitsubishi"),

  makeMaterial(760, 590, "Cedar Board & Batten", "Local sawmill", "1×10 + 1×3 battens", "", "Semi-transparent stain in Driftwood Grey. Re-stain every 5 yrs."),

  makeSticky(40, 730, "Loewen Douglas fir triple-\nglaze windows. 8' sliding\ndoor to screened porch.", "#dcfce7", 220, 80),
  makeSticky(280, 730, "Wrap-around Muskoka deck\nTimberTech composite in\nDriftwood. Steel cable rail.", "#dcfce7", 220, 80),
  makeSticky(520, 730, "200A panel — whole-home\nsurge. Pre-wire for EV\ncharger in carport.", "#fef9c3", 220, 80),
  makeSticky(760, 790, "PEX manifold system.\nRinnai tankless water\nheater — recirculating.", "#fce7f3", 220, 80),

  makeSticky(40, 830, "Primary suite: lake side.\nWalk-in closet + ensuite\nw/ heated floor & soaker.", "#dbeafe", 220, 80),
  makeSticky(280, 830, "3 guest bunkie rooms on\nlower level. Shared bath\nw/ double vanity.", "#dbeafe", 220, 80),
  makeSticky(520, 830, "Confirm dock permit w/\ntownship. Check setback\nrules for screened porch.", "#fef9c3", 220, 80),
  makeSticky(760, 890, "Engineered septic bed —\nClass 4 system. Drilled\nwell, UV filter.", "#fce7f3", 220, 80),

  makeSticky(40, 930, "Native Muskoka plantings:\nwhite birch, ferns, juniper.\nLow-maintenance beds.", "#fef9c3", 220, 80),
  makeSticky(280, 930, "Path lighting: Kichler LED\nbollards along walkway.\nDeck rail strip lighting.", "#fef9c3", 220, 80),
  makeSticky(520, 930, "Open kitchen to dining —\nbutler's pantry behind.\n14' live-edge harvest table.", "#dbeafe", 220, 80),
  makeSticky(760, 990, "Mitsubishi Hyper-Heat\nmini-split — 4 zones.\nIn-floor radiant backup.", "#fce7f3", 220, 80),
]);

const moodboard = wrap([
  makeSectionHeader(40, 20, "Moodboard"),

  makeImage(40, 70, `${IMG}/mood-sofa.png`, "Performance linen sofa — oatmeal. Wool bouclé accents.", 320, 240),
  makeImage(380, 70, `${IMG}/mood-oak-floor.png`, "Wire-brushed white oak 5\" planks — matte poly finish", 280, 200),
  makeImage(680, 70, `${IMG}/cottage-fireplace.png`, "Muskoka granite fieldstone for fireplace surround", 280, 220),

  makeImage(40, 330, `${IMG}/kitchen-cabinets.png`, "White oak + aged brass hardware throughout", 260, 200),
  makeImage(320, 330, `${IMG}/bath-sconce.png`, "Cedar & Moss sconce — aged brass, 3000K", 220, 180),

  makeColorSwatch(560, 310, "White Dove", "#f3efe6", "#F3EFE6", "OC-17", "Benjamin Moore", 150),
  makeColorSwatch(730, 310, "Salamander", "#1e3a2f", "#1E3A2F", "2050-10", "Benjamin Moore", 150),
  makeColorSwatch(560, 530, "Alabaster", "#f0ede5", "#F0EDE5", "SW 7008", "Sherwin-Williams", 150),
  makeColorSwatch(730, 530, "Chantilly Lace", "#f5f2ed", "#F5F2ED", "OC-65", "Benjamin Moore", 150),

  makeMaterial(40, 550, "White Oak", "Local mill", "Wire-brushed natural", `${IMG}/mood-oak-floor.png`, "Floors, vanity, shelving. Matte poly finish."),
  makeMaterial(280, 550, "Muskoka Granite", "Local quarry", "Fieldstone", `${IMG}/cottage-fireplace.png`, "Fireplace surround. Honed Carrara in baths."),

  makeProduct(40, 750, "Aged Brass Cup Pulls", "$32 each", "Emtek"),
  makeProduct(280, 750, "Performance Linen Fabric", "$95/yd", "Kravet"),
  makeProduct(520, 750, "Wool Bouclé Accent Chair", "$2,400", "Restoration Hardware"),

  makeSticky(760, 750, "Client loves warm minimal.\nNo farmhouse or rustic.\nClean lines, natural feel.", "#fef9c3", 220, 80),
  makeSticky(760, 845, "Budget: $450K reno +\n$80K furnishings.\nPrioritise kitchen & baths.", "#fef9c3", 220, 80),

  makeSticky(40, 880, "Keep palette to 3-4 colours\nmax. Let natural wood\ntones do the work.", "#f3e8ff", 220, 80),
  makeSticky(280, 880, "Trim: BM Chantilly Lace\nOC-65. Ceiling: flat.\nAll trim semi-gloss.", "#f3e8ff", 220, 80),
  makeSticky(520, 880, "Target: break ground May.\nCabinets 12-wk lead time\n— order by Feb 15.", "#fef9c3", 220, 80),
  makeSticky(760, 940, "Aged brass hardware\nthroughout. Matte black\non exterior doors only.", "#fed7aa", 220, 80),

  makeSticky(40, 980, "Lake Joseph cottage —\nArchitectural Digest\nMay 2024 inspiration.", "#dbeafe", 220, 80),
  makeSticky(280, 980, "Studio McGee living room\n— vaulted cedar ceiling\n+ linen palette.", "#dbeafe", 220, 80),
  makeSticky(520, 980, "Confirm dock permit w/\ntownship. Check setback\nrules for screened porch.", "#fef9c3", 220, 80),
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
    id: "kitchen",
    name: "Kitchen Renovation",
    description: "Cabinetry, countertops, appliances, backsplash, lighting, and finishes",
    icon: "ChefHat",
    image: "/assets/images/template-kitchen-faux.png",
    canvasData: kitchenRenovation,
  },
  {
    id: "bathroom",
    name: "Bathroom Renovation",
    description: "Fixtures, tile & flooring, vanity & storage, lighting, and plumbing",
    icon: "Bath",
    image: "/assets/images/template-bathroom-faux.png",
    canvasData: bathroomRenovation,
  },
  {
    id: "cottage",
    name: "Full Cottage Build",
    description: "Exterior, interior rooms, landscaping, and mechanical/electrical",
    icon: "Home",
    image: "/assets/images/template-cottage-faux.png",
    canvasData: fullCottageBuild,
  },
  {
    id: "moodboard",
    name: "Moodboard",
    description: "Colours, materials & textures, inspiration images, and notes",
    icon: "Palette",
    image: "/assets/images/template-moodboard-faux.png",
    canvasData: moodboard,
  },
];

export function getTemplateCatalogue() {
  return boardTemplates.map(({ id, name, description, icon, image }) => ({ id, name, description, icon, image }));
}

export function getTemplateCanvasData(templateId: string): any | null {
  const t = boardTemplates.find((t) => t.id === templateId);
  return t ? JSON.parse(JSON.stringify(t.canvasData)) : null;
}
