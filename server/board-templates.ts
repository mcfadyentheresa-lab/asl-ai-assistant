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
  makeSticky(60, 125, "Upper cabinet style & finish"),
  makeSticky(60, 240, "Lower cabinet hardware"),

  makeRect(340, 80, 280, 260, "#eff6ff"),
  makeText(355, 90, "COUNTERTOPS", 13, "bold", "#1e3a2f"),
  makeSticky(360, 125, "Material selection\n(granite, quartz, marble)"),
  makeSticky(360, 240, "Edge profile & colour"),

  makeRect(640, 80, 280, 260, "#fefce8"),
  makeText(655, 90, "APPLIANCES", 13, "bold", "#1e3a2f"),
  makeSticky(660, 125, "Fridge / freezer specs", "#fef9c3"),
  makeSticky(660, 240, "Range & hood selection", "#fef9c3"),

  makeRect(40, 370, 280, 260, "#fdf2f8"),
  makeText(55, 380, "BACKSPLASH & TILE", 13, "bold", "#1e3a2f"),
  makeSticky(60, 415, "Tile pattern & colour", "#fce7f3"),
  makeSticky(60, 530, "Grout colour & finish", "#fce7f3"),

  makeRect(340, 370, 280, 260, "#f5f3ff"),
  makeText(355, 380, "LIGHTING", 13, "bold", "#1e3a2f"),
  makeSticky(360, 415, "Under-cabinet lighting", "#f3e8ff"),
  makeSticky(360, 530, "Pendant / island fixtures", "#f3e8ff"),

  makeRect(640, 370, 280, 260, "#fff7ed"),
  makeText(655, 380, "FINISHES", 13, "bold", "#1e3a2f"),
  makeSticky(660, 415, "Flooring material & colour", "#fed7aa"),
  makeSticky(660, 530, "Paint / wall colour", "#fed7aa"),
]);

const bathroomRenovation = wrap([
  makeSectionHeader(40, 30, "Bathroom Renovation"),

  makeRect(40, 80, 280, 260, "#eff6ff"),
  makeText(55, 90, "FIXTURES", 13, "bold", "#1e3a2f"),
  makeSticky(60, 125, "Bathtub / shower selection", "#dbeafe"),
  makeSticky(60, 240, "Toilet & bidet specs", "#dbeafe"),

  makeRect(340, 80, 280, 260, "#f0fdf4"),
  makeText(355, 90, "TILE & FLOORING", 13, "bold", "#1e3a2f"),
  makeSticky(360, 125, "Floor tile material\n& pattern", "#dcfce7"),
  makeSticky(360, 240, "Wall tile / accent\ncolour", "#dcfce7"),

  makeRect(640, 80, 280, 260, "#fefce8"),
  makeText(655, 90, "VANITY & STORAGE", 13, "bold", "#1e3a2f"),
  makeSticky(660, 125, "Vanity style & size", "#fef9c3"),
  makeSticky(660, 240, "Mirror & medicine cabinet", "#fef9c3"),

  makeRect(40, 370, 280, 260, "#f5f3ff"),
  makeText(55, 380, "LIGHTING", 13, "bold", "#1e3a2f"),
  makeSticky(60, 415, "Vanity sconces / bar light", "#f3e8ff"),
  makeSticky(60, 530, "Recessed / ambient lighting", "#f3e8ff"),

  makeRect(340, 370, 280, 260, "#fff7ed"),
  makeText(355, 380, "PLUMBING NOTES", 13, "bold", "#1e3a2f"),
  makeSticky(360, 415, "Faucet finish & style", "#fed7aa"),
  makeSticky(360, 530, "Shower valve / rough-in", "#fed7aa"),
]);

const fullCottageBuild = wrap([
  makeSectionHeader(40, 30, "Full Cottage Build"),

  makeRect(40, 80, 430, 280, "#f0fdf4"),
  makeText(55, 90, "EXTERIOR", 14, "bold", "#1e3a2f"),
  makeSticky(60, 125, "Siding & cladding\nmaterial", "#dcfce7"),
  makeSticky(260, 125, "Roofing type &\ncolour", "#dcfce7"),
  makeSticky(60, 240, "Windows & doors", "#dcfce7"),
  makeSticky(260, 240, "Deck / porch finishes", "#dcfce7"),

  makeRect(490, 80, 430, 280, "#eff6ff"),
  makeText(505, 90, "INTERIOR ROOMS", 14, "bold", "#1e3a2f"),
  makeSticky(510, 125, "Living / great room\nlayout", "#dbeafe"),
  makeSticky(710, 125, "Kitchen & dining\nplan", "#dbeafe"),
  makeSticky(510, 240, "Primary bedroom\nsuite", "#dbeafe"),
  makeSticky(710, 240, "Guest rooms &\nbathrooms", "#dbeafe"),

  makeRect(40, 390, 430, 260, "#fefce8"),
  makeText(55, 400, "LANDSCAPING", 14, "bold", "#1e3a2f"),
  makeSticky(60, 435, "Driveway & pathways", "#fef9c3"),
  makeSticky(260, 435, "Dock & waterfront", "#fef9c3"),
  makeSticky(60, 545, "Gardens & planting", "#fef9c3"),
  makeSticky(260, 545, "Outdoor lighting", "#fef9c3"),

  makeRect(490, 390, 430, 260, "#fdf2f8"),
  makeText(505, 400, "MECHANICAL & ELECTRICAL", 14, "bold", "#1e3a2f"),
  makeSticky(510, 435, "HVAC system &\nzoning", "#fce7f3"),
  makeSticky(710, 435, "Electrical panel &\nwiring plan", "#fce7f3"),
  makeSticky(510, 545, "Plumbing rough-in\n& fixtures", "#fce7f3"),
  makeSticky(710, 545, "Septic / well\nsystems", "#fce7f3"),
]);

const moodboard = wrap([
  makeSectionHeader(40, 30, "Moodboard"),

  makeRect(40, 80, 220, 520, "#f5f3ff"),
  makeText(55, 90, "COLOURS", 13, "bold", "#1e3a2f"),
  makeSticky(55, 125, "Primary palette", "#f3e8ff", 190, 90),
  makeSticky(55, 230, "Accent colours", "#f3e8ff", 190, 90),
  makeSticky(55, 335, "Trim & neutral tones", "#f3e8ff", 190, 90),
  makeSticky(55, 440, "Notes", "#f3e8ff", 190, 90),

  makeRect(280, 80, 220, 520, "#fff7ed"),
  makeText(295, 90, "MATERIALS & TEXTURES", 13, "bold", "#1e3a2f"),
  makeSticky(295, 125, "Wood species & stain", "#fed7aa", 190, 90),
  makeSticky(295, 230, "Stone / tile samples", "#fed7aa", 190, 90),
  makeSticky(295, 335, "Metal finishes\n(hardware, fixtures)", "#fed7aa", 190, 90),
  makeSticky(295, 440, "Fabric / upholstery", "#fed7aa", 190, 90),

  makeRect(520, 80, 220, 520, "#eff6ff"),
  makeText(535, 90, "INSPIRATION IMAGES", 13, "bold", "#1e3a2f"),
  makeSticky(535, 125, "Add reference photo\nor URL here", "#dbeafe", 190, 90),
  makeSticky(535, 230, "Add reference photo\nor URL here", "#dbeafe", 190, 90),
  makeSticky(535, 335, "Add reference photo\nor URL here", "#dbeafe", 190, 90),
  makeSticky(535, 440, "Add reference photo\nor URL here", "#dbeafe", 190, 90),

  makeRect(760, 80, 220, 520, "#fefce8"),
  makeText(775, 90, "NOTES", 13, "bold", "#1e3a2f"),
  makeSticky(775, 125, "Client preferences\n& must-haves", "#fef9c3", 190, 90),
  makeSticky(775, 230, "Budget considerations", "#fef9c3", 190, 90),
  makeSticky(775, 335, "Timeline notes", "#fef9c3", 190, 90),
  makeSticky(775, 440, "Open questions", "#fef9c3", 190, 90),
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
