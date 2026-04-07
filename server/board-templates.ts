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

function wrap(objects: any[]) {
  return {
    version: "6.6.1",
    objects,
    background: "#f8f6f3",
  };
}

const kitchenRenovation = wrap([
  makeSectionHeader(40, 30, "Kitchen Renovation"),

  makeRect(40, 80, 280, 260, "#f0fdf4"),
  makeText(55, 90, "CABINETRY", 13, "bold", "#1e3a2f"),
  makeSticky(60, 125, "Shaker-style maple uppers\nin BM White Dove OC-17.\nSoft-close hinges throughout."),
  makeSticky(60, 240, "Lower bases: walnut stain\nBrass cup pulls — Emtek\nMorris 3\" centre-to-centre"),

  makeRect(340, 80, 280, 260, "#eff6ff"),
  makeText(355, 90, "COUNTERTOPS", 13, "bold", "#1e3a2f"),
  makeSticky(360, 125, "Caesarstone Calacatta\nNuvo 5131 — 3 cm slab.\nIsland: waterfall edge."),
  makeSticky(360, 240, "Perimeter: eased edge.\nColour-matched caulk.\nIntegrated drainboard area."),

  makeRect(640, 80, 280, 260, "#fefce8"),
  makeText(655, 90, "APPLIANCES", 13, "bold", "#1e3a2f"),
  makeSticky(660, 125, "Sub-Zero 36\" French door\nfridge — panel-ready.\nPlumbed ice & water.", "#fef9c3"),
  makeSticky(660, 240, "Wolf 48\" dual-fuel range.\nZephyr Cypress 48\" hood\nin brushed stainless.", "#fef9c3"),

  makeRect(40, 370, 280, 260, "#fdf2f8"),
  makeText(55, 380, "BACKSPLASH & TILE", 13, "bold", "#1e3a2f"),
  makeSticky(60, 415, "Cle Tile zellige 2×6\"\nin Weathered White.\nRunning-bond pattern.", "#fce7f3"),
  makeSticky(60, 530, "Mapei Keracolor U grout\nin Frost #77. Sealed finish.\nExtend to ceiling behind range.", "#fce7f3"),

  makeRect(340, 370, 280, 260, "#f5f3ff"),
  makeText(355, 380, "LIGHTING", 13, "bold", "#1e3a2f"),
  makeSticky(360, 415, "WAC LED tape — 3000K\nwarm white under all uppers.\nDimmable Lutron Caseta.", "#f3e8ff"),
  makeSticky(360, 530, "3× Schoolhouse Otis\npendants over island —\naged brass, 10\" globes.", "#f3e8ff"),

  makeRect(640, 370, 280, 260, "#fff7ed"),
  makeText(655, 380, "FINISHES", 13, "bold", "#1e3a2f"),
  makeSticky(660, 415, "White oak hardwood 5\"\nplanks — matte poly finish.\nRun continuous to dining.", "#fed7aa"),
  makeSticky(660, 530, "BM Edgecomb Gray HC-173\non walls. Trim & ceiling:\nChantilly Lace OC-65.", "#fed7aa"),
]);

const bathroomRenovation = wrap([
  makeSectionHeader(40, 30, "Bathroom Renovation"),

  makeRect(40, 80, 280, 260, "#eff6ff"),
  makeText(55, 90, "FIXTURES", 13, "bold", "#1e3a2f"),
  makeSticky(60, 125, "Victoria + Albert Napoli\nfreestanding tub — matte\nwhite. 65\" x 29\".", "#dbeafe"),
  makeSticky(60, 240, "Toto Drake II elongated\n— ADA height. Concealed\ntrapway, SoftClose seat.", "#dbeafe"),

  makeRect(340, 80, 280, 260, "#f0fdf4"),
  makeText(355, 90, "TILE & FLOORING", 13, "bold", "#1e3a2f"),
  makeSticky(360, 125, "Heated marble hex floor\n2\" Carrara mosaic.\nSchluter Ditra-Heat mat.", "#dcfce7"),
  makeSticky(360, 240, "Shower walls: large-format\nporcelain 24×48\" Calacatta.\nNiche in accent stone.", "#dcfce7"),

  makeRect(640, 80, 280, 260, "#fefce8"),
  makeText(655, 90, "VANITY & STORAGE", 13, "bold", "#1e3a2f"),
  makeSticky(660, 125, "60\" double vanity — white\noak floating. Quartz top\nw/ undermount basins.", "#fef9c3"),
  makeSticky(660, 240, "Recessed medicine cabinet\nw/ LED surround. Full-\nlength linen tower beside.", "#fef9c3"),

  makeRect(40, 370, 280, 260, "#f5f3ff"),
  makeText(55, 380, "LIGHTING", 13, "bold", "#1e3a2f"),
  makeSticky(60, 415, "Cedar & Moss Alto sconces\neither side of mirror —\nbrushed brass, 3000K.", "#f3e8ff"),
  makeSticky(60, 530, "4\" IC-rated recessed cans\nin shower (wet-rated).\nDimmable Lutron switch.", "#f3e8ff"),

  makeRect(340, 370, 280, 260, "#fff7ed"),
  makeText(355, 380, "PLUMBING NOTES", 13, "bold", "#1e3a2f"),
  makeSticky(360, 415, "Brizo Litze widespread —\nluxe gold finish. Matching\ntub filler w/ hand shower.", "#fed7aa"),
  makeSticky(360, 530, "Thermostatic valve —\n2-function diverter.\nRough-in at 48\" centre.", "#fed7aa"),
]);

const fullCottageBuild = wrap([
  makeSectionHeader(40, 30, "Full Cottage Build"),

  makeRect(40, 80, 430, 280, "#f0fdf4"),
  makeText(55, 90, "EXTERIOR", 14, "bold", "#1e3a2f"),
  makeSticky(60, 125, "Board-and-batten cedar\nsiding — semi-transparent\nstain in Driftwood Grey.", "#dcfce7"),
  makeSticky(260, 125, "Standing-seam metal roof\nin matte black. 26-gauge\nGalvalume — 50-yr warranty.", "#dcfce7"),
  makeSticky(60, 240, "Loewen Douglas fir triple-\nglaze windows. 8' sliding\ndoor to screened porch.", "#dcfce7"),
  makeSticky(260, 240, "Wrap-around Muskoka deck\nTimberTech composite in\nDriftwood. Steel cable rail.", "#dcfce7"),

  makeRect(490, 80, 430, 280, "#eff6ff"),
  makeText(505, 90, "INTERIOR ROOMS", 14, "bold", "#1e3a2f"),
  makeSticky(510, 125, "Vaulted great room w/\nexposed timber trusses.\nFloor-to-ceiling lake view.", "#dbeafe"),
  makeSticky(710, 125, "Open kitchen to dining —\nbutler's pantry behind.\n14' live-edge harvest table.", "#dbeafe"),
  makeSticky(510, 240, "Primary suite: lake side.\nWalk-in closet + ensuite\nw/ heated floor & soaker.", "#dbeafe"),
  makeSticky(710, 240, "3 guest bunkie rooms on\nlower level. Shared bath\nw/ double vanity.", "#dbeafe"),

  makeRect(40, 390, 430, 260, "#fefce8"),
  makeText(55, 400, "LANDSCAPING", 14, "bold", "#1e3a2f"),
  makeSticky(60, 435, "Crushed granite driveway\nw/ dry-laid flagstone\nwalkway to front entry.", "#fef9c3"),
  makeSticky(260, 435, "Permanent dock — steel\nframe, cedar decking.\nBoat lift + swim ladder.", "#fef9c3"),
  makeSticky(60, 545, "Native Muskoka plantings:\nwhite birch, ferns, juniper.\nLow-maintenance beds.", "#fef9c3"),
  makeSticky(260, 545, "Path lighting: Kichler LED\nbollards along walkway.\nDeck rail strip lighting.", "#fef9c3"),

  makeRect(490, 390, 430, 260, "#fdf2f8"),
  makeText(505, 400, "MECHANICAL & ELECTRICAL", 14, "bold", "#1e3a2f"),
  makeSticky(510, 435, "Mitsubishi Hyper-Heat\nmini-split — 4 zones.\nIn-floor radiant backup.", "#fce7f3"),
  makeSticky(710, 435, "200A panel — whole-home\nsurge. Pre-wire for EV\ncharger in carport.", "#fce7f3"),
  makeSticky(510, 545, "PEX manifold system.\nRinnai tankless water\nheater — recirculating.", "#fce7f3"),
  makeSticky(710, 545, "Engineered septic bed\n— Class 4 system.\nDrilled well, UV filter.", "#fce7f3"),
]);

const moodboard = wrap([
  makeSectionHeader(40, 30, "Moodboard"),

  makeRect(40, 80, 220, 520, "#f5f3ff"),
  makeText(55, 90, "COLOURS", 13, "bold", "#1e3a2f"),
  makeSticky(55, 125, "BM White Dove OC-17\nSW Alabaster 7008\nWarm whites throughout", "#f3e8ff", 190, 90),
  makeSticky(55, 230, "BM Salamander 2050-10\ndeep forest green on\nisland & accent walls", "#f3e8ff", 190, 90),
  makeSticky(55, 335, "Trim: BM Chantilly Lace\nOC-65. Ceiling: flat.\nAll trim semi-gloss.", "#f3e8ff", 190, 90),
  makeSticky(55, 440, "Keep palette to 3-4\ncolours max. Let natural\nwood tones do the work.", "#f3e8ff", 190, 90),

  makeRect(280, 80, 220, 520, "#fff7ed"),
  makeText(295, 90, "MATERIALS & TEXTURES", 13, "bold", "#1e3a2f"),
  makeSticky(295, 125, "White oak — wire-brushed\nnatural finish. Use on\nfloors, vanity, shelving.", "#fed7aa", 190, 90),
  makeSticky(295, 230, "Muskoka granite fieldstone\nfor fireplace surround.\nHoned Carrara in baths.", "#fed7aa", 190, 90),
  makeSticky(295, 335, "Aged brass hardware\nthroughout. Matte black\non exterior doors only.", "#fed7aa", 190, 90),
  makeSticky(295, 440, "Performance linen in\noatmeal for sofas. Wool\nbouclé accent chairs.", "#fed7aa", 190, 90),

  makeRect(520, 80, 220, 520, "#eff6ff"),
  makeText(535, 90, "INSPIRATION IMAGES", 13, "bold", "#1e3a2f"),
  makeSticky(535, 125, "Lake Joseph cottage —\nArchitectural Digest\nMay 2024 feature.", "#dbeafe", 190, 90),
  makeSticky(535, 230, "Studio McGee living\nroom — vaulted cedar\nceiling + linen palette.", "#dbeafe", 190, 90),
  makeSticky(535, 335, "Amber Interiors kitchen\n— open shelving + brass\nhardware + white oak.", "#dbeafe", 190, 90),
  makeSticky(535, 440, "Four Seasons Muskoka\nlobby — stone + timber\n+ warm lighting mood.", "#dbeafe", 190, 90),

  makeRect(760, 80, 220, 520, "#fefce8"),
  makeText(775, 90, "NOTES", 13, "bold", "#1e3a2f"),
  makeSticky(775, 125, "Client loves warm minimal.\nNo farmhouse or rustic.\nClean lines, natural feel.", "#fef9c3", 190, 90),
  makeSticky(775, 230, "Budget: $450K reno +\n$80K furnishings.\nPrioritise kitchen & baths.", "#fef9c3", 190, 90),
  makeSticky(775, 335, "Target: break ground May.\nCabinets 12-wk lead time\n— order by Feb 15.", "#fef9c3", 190, 90),
  makeSticky(775, 440, "Confirm dock permit w/\ntownship. Check setback\nrules for screened porch.", "#fef9c3", 190, 90),
]);

export interface BoardTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  canvasData: any;
}

export const boardTemplates: BoardTemplate[] = [
  {
    id: "kitchen",
    name: "Kitchen Renovation",
    description: "Cabinetry, countertops, appliances, backsplash, lighting, and finishes",
    icon: "ChefHat",
    canvasData: kitchenRenovation,
  },
  {
    id: "bathroom",
    name: "Bathroom Renovation",
    description: "Fixtures, tile & flooring, vanity & storage, lighting, and plumbing",
    icon: "Bath",
    canvasData: bathroomRenovation,
  },
  {
    id: "cottage",
    name: "Full Cottage Build",
    description: "Exterior, interior rooms, landscaping, and mechanical/electrical",
    icon: "Home",
    canvasData: fullCottageBuild,
  },
  {
    id: "moodboard",
    name: "Moodboard",
    description: "Colours, materials & textures, inspiration images, and notes",
    icon: "Palette",
    canvasData: moodboard,
  },
];

export function getTemplateCatalogue() {
  return boardTemplates.map(({ id, name, description, icon }) => ({ id, name, description, icon }));
}

export function getTemplateCanvasData(templateId: string): any | null {
  const t = boardTemplates.find((t) => t.id === templateId);
  return t ? JSON.parse(JSON.stringify(t.canvasData)) : null;
}
