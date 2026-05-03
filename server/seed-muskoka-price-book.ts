/**
 * Idempotent Muskoka price-book seed.
 *
 * Populates four existing tables (cost_categories, suppliers,
 * supplier_prices, market_rates) plus the new regional_modifiers table
 * from researched CSVs at server/data/muskoka_*.csv. Safe to run on every
 * boot \u2014 every insert is gated by a uniqueness check, every update only
 * runs when stale, no row is ever overwritten if a human has manually
 * edited it.
 *
 * Manual-edit detection: a row is considered "human-touched" when its
 * notes field contains the marker string MANUAL_EDIT_MARKER. The seed
 * skips human-touched rows entirely.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { eq, and, inArray } from "drizzle-orm";
import { db } from "./db";
import {
  costCategories,
  suppliers,
  supplierPrices,
  marketRates,
  regionalModifiers,
} from "@shared/schema";

// Real local/national suppliers we trust for Muskoka pricing. Phantom
// suppliers introduced by earlier research-blob CSV rows (e.g.
// "Ontario / Canada range") get cleaned out at seed time. New entries
// here MUST also exist in muskoka_materials_prices.csv or muskoka_lumber_receipts.csv.
const REAL_SUPPLIER_NAMES: ReadonlyArray<string> = [
  "Chamberlain Timber Mart (Muskoka-Gravenhurst)",
  "Home Depot Canada",
  "RONA Canada",
  "Canadian Tire",
  "Benjamin Moore Canada store",
  "Muskoka Lumber",
];

const MANUAL_EDIT_MARKER = "[manual-edit]";
// Resolve relative to repo root so this works in both dev (tsx) and prod
// (esbuild CJS bundle, where import.meta.dirname is empty). Railway runs
// `node dist/index.cjs` from the repo root, so process.cwd() points at
// the project root in both environments.
const MUSKOKA_DATA_DIR = path.join(process.cwd(), "server", "data");

// ----------------------------------------------------------------------
// Tiny CSV parser \u2014 handles quoted fields with embedded commas/newlines
// without pulling in a dependency.
// ----------------------------------------------------------------------
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += c;
      i += 1;
      continue;
    }
    // Only enter quote mode when '"' appears at the very start of a
    // field. This matches the csv module's lenient behaviour and lets
    // unquoted fields contain bare quote characters (e.g. 30" Vanity).
    if (c === '"' && field === "") {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (c === "\n" || c === "\r") {
      // Skip CRLF pair
      if (c === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      field = "";
      // Drop blank trailing lines
      if (!(row.length === 1 && row[0] === "")) rows.push(row);
      row = [];
      i += 1;
      continue;
    }
    field += c;
    i += 1;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (!(row.length === 1 && row[0] === "")) rows.push(row);
  }
  return rows;
}

function rowsToObjects(
  raw: string[][],
): Array<Record<string, string>> {
  if (raw.length === 0) return [];
  const headers = raw[0].map((h) => h.trim());
  const lastIdx = headers.length - 1;
  return raw.slice(1).map((cols) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      // For the last column (typically `notes`), recombine any extra
      // fields that resulted from unquoted commas in the source data
      // (e.g. "$2,500"). This keeps the rest of the row aligned.
      if (idx === lastIdx && cols.length > headers.length) {
        obj[h] = cols.slice(idx).join(",").trim();
      } else {
        obj[h] = (cols[idx] ?? "").trim();
      }
    });
    return obj;
  });
}

// ----------------------------------------------------------------------
// Cost categories \u2014 the 13 buckets our research targets. Idempotent by
// name. Existing rows are left alone.
// ----------------------------------------------------------------------
const CATEGORY_SEEDS: Array<{
  name: string;
  description: string;
  defaultUnitType: string;
  sortOrder: number;
}> = [
  { name: "Lumber & Framing", description: "SPF dimensional lumber, plywood, LVL, sheathing", defaultUnitType: "each", sortOrder: 10 },
  { name: "Drywall", description: "Drywall sheets, mud, tape, corner bead", defaultUnitType: "sheet", sortOrder: 20 },
  { name: "Insulation", description: "Batt, blown-in, spray foam", defaultUnitType: "sq_ft", sortOrder: 30 },
  { name: "Flooring", description: "Hardwood, LVP, tile, underlayment", defaultUnitType: "sq_ft", sortOrder: 40 },
  { name: "Paint & Finishes", description: "Interior paint, primer, stain, polyurethane", defaultUnitType: "gallon", sortOrder: 50 },
  { name: "Plumbing Fixtures", description: "Tubs, showers, vanities, toilets, faucets", defaultUnitType: "each", sortOrder: 60 },
  { name: "Electrical Fixtures", description: "Receptacles, switches, pot lights, fans", defaultUnitType: "each", sortOrder: 70 },
  { name: "Kitchen & Cabinetry", description: "Stock cabinetry, countertops, backsplash", defaultUnitType: "linear_ft", sortOrder: 80 },
  { name: "Doors, Windows & Hardware", description: "Pre-hung doors, windows, lever sets, deadbolts", defaultUnitType: "each", sortOrder: 90 },
  { name: "Exterior & Decking", description: "Cottage trim, shingles, decking, T&G", defaultUnitType: "linear_ft", sortOrder: 100 },
  { name: "Demolition & Disposal", description: "Bin rentals, demo allowances, disposal fees", defaultUnitType: "lump_sum", sortOrder: 110 },
  { name: "Trades Labour", description: "Per-hour or per-sqft trades labour", defaultUnitType: "hour", sortOrder: 120 },
  { name: "Allowances", description: "Permit, contingency, design allowances", defaultUnitType: "lump_sum", sortOrder: 130 },
];

// CSV category slug \u2192 cost-category display name. This lets the seed
// rebuild associations without relying on display-name string matching
// in the source data.
const CSV_CATEGORY_TO_DISPLAY: Record<string, string> = {
  lumber: "Lumber & Framing",
  drywall: "Drywall",
  insulation: "Insulation",
  flooring: "Flooring",
  paint: "Paint & Finishes",
  plumbing_fixtures: "Plumbing Fixtures",
  electrical_fixtures: "Electrical Fixtures",
  kitchen: "Kitchen & Cabinetry",
  hardware: "Doors, Windows & Hardware",
  exterior: "Exterior & Decking",
  demo: "Demolition & Disposal",
  trades_labour: "Trades Labour",
  allowance: "Allowances",
  // labour CSV uses sub-trade slugs
  carpenter: "Trades Labour",
  plumbing: "Trades Labour",
  electrical: "Trades Labour",
  drywall_labour: "Trades Labour",
  painting: "Trades Labour",
  tile: "Trades Labour",
  hvac: "Trades Labour",
  roofing: "Trades Labour",
  earthworks: "Trades Labour",
  septic: "Trades Labour",
  permit: "Allowances",
  surcharge: "Allowances",
};

async function seedCategories(): Promise<Map<string, number>> {
  const existing = await db.select().from(costCategories);
  const byName = new Map(existing.map((c) => [c.name, c.id]));
  for (const seed of CATEGORY_SEEDS) {
    if (byName.has(seed.name)) continue;
    const [created] = await db.insert(costCategories).values(seed).returning();
    byName.set(created.name, created.id);
  }
  return byName;
}

// ----------------------------------------------------------------------
// Suppliers \u2014 derived from the materials CSV's `supplier` column. Idempotent
// by name.
// ----------------------------------------------------------------------
async function seedSuppliers(rows: Array<Record<string, string>>): Promise<Map<string, number>> {
  const uniqueSupplierNames = new Set<string>();
  for (const r of rows) {
    if (r.supplier) uniqueSupplierNames.add(r.supplier);
  }
  // First-seen supplier metadata (website / notes)
  const supplierMeta = new Map<
    string,
    { website?: string; notes?: string }
  >();
  for (const r of rows) {
    if (!r.supplier) continue;
    const existing = supplierMeta.get(r.supplier);
    if (existing) continue;
    let website: string | undefined;
    try {
      if (r.source_url && r.source_url.startsWith("http")) {
        const u = new URL(r.source_url);
        website = `${u.protocol}//${u.host}`;
      }
    } catch {
      // ignore malformed URLs
    }
    supplierMeta.set(r.supplier, { website });
  }

  const existing = await db.select().from(suppliers);
  const byName = new Map(existing.map((s) => [s.name, s.id]));
  for (const name of uniqueSupplierNames) {
    if (byName.has(name)) continue;
    const meta = supplierMeta.get(name) ?? {};
    const [created] = await db
      .insert(suppliers)
      .values({
        name,
        website: meta.website,
        isActive: true,
        notes: `Seeded from Muskoka price-book research ${new Date().toISOString().slice(0, 10)}`,
      })
      .returning();
    byName.set(created.name, created.id);
  }
  return byName;
}

// ----------------------------------------------------------------------
// Supplier prices \u2014 from the materials CSV. Each (supplier_name +
// product_name) is the natural key. The seed only inserts rows it has
// not seen before; rows touched by a human (notes contains
// MANUAL_EDIT_MARKER) are never overwritten.
// ----------------------------------------------------------------------

function csvUnitToDb(unit: string): string {
  const u = unit.toLowerCase().trim();
  if (u === "each" || u === "ea") return "each";
  if (u === "sheet") return "sheet";
  if (u === "sqft" || u === "sq_ft" || u === "sq ft" || u === "per sqft" || u === "per sq ft") return "sq_ft";
  if (u === "lf" || u === "linear ft" || u === "linear_ft" || u === "per lf" || u === "per linear foot") return "linear_ft";
  if (u === "gal" || u === "gallon" || u === "per gal" || u === "per gallon") return "gallon";
  if (u === "bag") return "bag";
  if (u === "pail" || u === "5gal pail") return "pail";
  if (u === "roll" || u === "rl") return "roll";
  if (u === "square" || u === "per square") return "square";
  if (u === "lb" || u === "lbs" || u === "per lb") return "lb";
  if (u === "lump_sum" || u === "lump sum" || u === "ls") return "lump_sum";
  if (u === "hour" || u === "per hour" || u === "hr") return "hour";
  if (u === "day" || u === "per day") return "day";
  if (u === "ton" || u === "per ton") return "ton";
  if (u === "board_ft" || u === "board foot" || u === "per board-foot") return "board_ft";
  return u || "unit";
}

async function seedSupplierPrices(
  rows: Array<Record<string, string>>,
  supplierIdByName: Map<string, number>,
  categoryIdByName: Map<string, number>,
): Promise<{ inserted: number; skipped: number; manualEditPreserved: number }> {
  let inserted = 0;
  let skipped = 0;
  let manualEditPreserved = 0;

  for (const r of rows) {
    const supplierName = r.supplier?.trim();
    const productName = r.name?.trim();
    const priceStr = r.unit_price_cad?.trim();
    if (!supplierName || !productName) {
      skipped += 1;
      continue;
    }
    if (!priceStr || Number.isNaN(Number(priceStr))) {
      skipped += 1;
      continue;
    }
    const supplierId = supplierIdByName.get(supplierName);
    if (!supplierId) {
      skipped += 1;
      continue;
    }
    const displayCat = CSV_CATEGORY_TO_DISPLAY[r.category?.trim()];
    const categoryId = displayCat ? categoryIdByName.get(displayCat) : undefined;

    // Natural-key lookup: same supplier + same product name
    const existing = await db
      .select()
      .from(supplierPrices)
      .where(
        and(
          eq(supplierPrices.supplierId, supplierId),
          eq(supplierPrices.productName, productName),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      const row = existing[0];
      if ((row.notes ?? "").includes(MANUAL_EDIT_MARKER)) {
        manualEditPreserved += 1;
        continue;
      }
      // Re-seed run on an unchanged row \u2014 leave it alone (lastUpdated
      // stays accurate to the original seed time).
      skipped += 1;
      continue;
    }

    await db.insert(supplierPrices).values({
      supplierId,
      productName,
      categoryId,
      unitPrice: priceStr,
      unitType: csvUnitToDb(r.unit ?? ""),
      productCode: (r.product_code || "").trim() || null,
      productUrl: r.source_url || null,
      notes: r.notes
        ? `Source: ${r.source_url || "n/a"}\nVerified ${r.last_verified || "n/a"}\n${r.notes}`
        : `Source: ${r.source_url || "n/a"}\nVerified ${r.last_verified || "n/a"}`,
    });
    inserted += 1;
  }

  return { inserted, skipped, manualEditPreserved };
}

// ----------------------------------------------------------------------
// Market rates (labour low/typical/high) \u2014 from the labour CSV. Idempotent
// by (categoryId + notes-contains-name). Stored as one market_rate row
// per labour line item, with the role name embedded in the notes so the
// estimator can pick it.
// ----------------------------------------------------------------------
async function seedMarketRates(
  rows: Array<Record<string, string>>,
  categoryIdByName: Map<string, number>,
): Promise<{ inserted: number; skipped: number; manualEditPreserved: number }> {
  let inserted = 0;
  let skipped = 0;
  let manualEditPreserved = 0;

  const labourCategoryId = categoryIdByName.get("Trades Labour");
  const allowanceCategoryId = categoryIdByName.get("Allowances");
  if (!labourCategoryId || !allowanceCategoryId) {
    return { inserted, skipped, manualEditPreserved };
  }

  for (const r of rows) {
    const name = r.name?.trim();
    const low = r.unit_price_cad_low?.trim();
    const typical = r.unit_price_cad_typical?.trim();
    const high = r.unit_price_cad_high?.trim();
    if (!name) {
      skipped += 1;
      continue;
    }
    // Skip "needs manual lookup" rows where typical is empty
    if (!typical || Number.isNaN(Number(typical))) {
      skipped += 1;
      continue;
    }

    const csvCat = (r.category ?? "").trim();
    const isPermitOrSurcharge = csvCat === "permit" || csvCat === "surcharge";
    const categoryId = isPermitOrSurcharge ? allowanceCategoryId : labourCategoryId;
    const unitType = csvUnitToDb(r.unit ?? "hour");

    // Idempotency: match by category + a stable name marker in the notes
    const nameMarker = `[role: ${name}]`;
    const existing = await db
      .select()
      .from(marketRates)
      .where(eq(marketRates.categoryId, categoryId));
    const match = existing.find((m) => (m.notes ?? "").includes(nameMarker));
    if (match) {
      if ((match.notes ?? "").includes(MANUAL_EDIT_MARKER)) {
        manualEditPreserved += 1;
        continue;
      }
      skipped += 1;
      continue;
    }

    const sourceLine = r.source_url ? `Source: ${r.source_url}` : "";
    const notesPieces = [
      nameMarker,
      sourceLine,
      r.last_verified ? `Verified ${r.last_verified}` : "",
      r.notes ?? "",
    ].filter(Boolean);

    await db.insert(marketRates).values({
      categoryId,
      unitType,
      lowRate: low || typical,
      typicalRate: typical,
      highRate: high || typical,
      effectiveDate: r.last_verified || new Date().toISOString().slice(0, 10),
      isActive: true,
      notes: notesPieces.join("\n"),
    });
    inserted += 1;
  }

  return { inserted, skipped, manualEditPreserved };
}

// ----------------------------------------------------------------------
// Regional modifiers \u2014 surcharges, permit formula, travel, season. Idempotent
// by (region + name).
// ----------------------------------------------------------------------
const REGIONAL_MODIFIER_SEEDS: Array<{
  modifierType: string;
  name: string;
  value: string;
  unit: string;
  appliesTo: string;
  description: string;
  sourceUrl?: string;
}> = [
  {
    modifierType: "surcharge_percent",
    name: "Boat-access cottage premium",
    value: "20",
    unit: "percent",
    appliesTo: "both",
    description:
      "Adder applied to materials + labour for sites only reachable by water. Range observed 15\u201325%; 20% used as Muskoka mid-point.",
    sourceUrl: "https://www.myowncottage.ca/",
  },
  {
    modifierType: "season_premium",
    name: "Winter / shoulder-season premium (Muskoka)",
    value: "15",
    unit: "percent",
    appliesTo: "both",
    description:
      "Frozen ground, heating costs, road closures, scarce subs. Muskoka runs OPPOSITE to the national pattern \u2014 winter is more expensive, not cheaper. Range 10\u201320%; 15% used as mid-point.",
  },
  {
    modifierType: "travel_rule",
    name: "Travel beyond Bracebridge core",
    value: "0.75",
    unit: "per_km",
    appliesTo: "travel",
    description:
      "Per-km surcharge for jobs beyond ~30 km radius from Bracebridge. Set to a placeholder; override per project as needed.",
  },
  {
    modifierType: "permit_formula",
    name: "Township residential permit fee (per $1k construction value)",
    value: "11.00",
    unit: "per_thousand_value",
    appliesTo: "permit",
    description:
      "Approximately consistent across Bracebridge, Huntsville, Gravenhurst, Muskoka Lakes townships. Minimum permit fee typically $200\u2013$310. Most interior cosmetic work (paint, flooring, cabinets) does not require a permit.",
  },
];

async function seedRegionalModifiers(): Promise<{ inserted: number; skipped: number; manualEditPreserved: number }> {
  let inserted = 0;
  let skipped = 0;
  let manualEditPreserved = 0;

  for (const seed of REGIONAL_MODIFIER_SEEDS) {
    const existing = await db
      .select()
      .from(regionalModifiers)
      .where(
        and(
          eq(regionalModifiers.region, "muskoka"),
          eq(regionalModifiers.name, seed.name),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      const row = existing[0];
      if ((row.description ?? "").includes(MANUAL_EDIT_MARKER)) {
        manualEditPreserved += 1;
        continue;
      }
      skipped += 1;
      continue;
    }

    await db.insert(regionalModifiers).values({
      region: "muskoka",
      modifierType: seed.modifierType,
      name: seed.name,
      value: seed.value,
      unit: seed.unit,
      appliesTo: seed.appliesTo,
      description: seed.description,
      sourceUrl: seed.sourceUrl,
      lastVerified: new Date().toISOString().slice(0, 10),
      isActive: true,
    });
    inserted += 1;
  }

  return { inserted, skipped, manualEditPreserved };
}

// ----------------------------------------------------------------------
// Phantom-supplier cleanup — removes legacy supplier_prices rows whose
// supplier name is NOT in REAL_SUPPLIER_NAMES (e.g. "Ontario / Canada
// range", "Home Depot Canada (fallback)"). Manual-edited rows are
// preserved. Suppliers left with zero prices are then deleted.
// Idempotent: subsequent runs find nothing to clean and return zeros.
// ----------------------------------------------------------------------
async function cleanupPhantomSuppliers(): Promise<{
  deletedPrices: number;
  deletedSuppliers: number;
  manualEditPreserved: number;
}> {
  const allSuppliers = await db.select().from(suppliers);
  const realSet = new Set(REAL_SUPPLIER_NAMES);
  const phantomSupplierIds = allSuppliers
    .filter((s) => !realSet.has(s.name))
    .map((s) => s.id);

  if (phantomSupplierIds.length === 0) {
    return { deletedPrices: 0, deletedSuppliers: 0, manualEditPreserved: 0 };
  }

  // Fetch phantom prices so we can preserve manual-edited rows.
  const phantomPrices = await db
    .select()
    .from(supplierPrices)
    .where(inArray(supplierPrices.supplierId, phantomSupplierIds));

  const preservedPriceIds: number[] = [];
  const deletePriceIds: number[] = [];
  for (const p of phantomPrices) {
    if ((p.notes ?? "").includes(MANUAL_EDIT_MARKER)) {
      preservedPriceIds.push(p.id);
    } else {
      deletePriceIds.push(p.id);
    }
  }

  let deletedPrices = 0;
  if (deletePriceIds.length > 0) {
    await db.delete(supplierPrices).where(inArray(supplierPrices.id, deletePriceIds));
    deletedPrices = deletePriceIds.length;
  }

  // Delete suppliers that have no remaining prices AND no preserved
  // manual-edited rows. (The supplier_prices.supplierId has
  // onDelete:"cascade" but we never want to drop a supplier that still
  // has a human-touched row underneath it.)
  const remainingPrices = await db
    .select()
    .from(supplierPrices)
    .where(inArray(supplierPrices.supplierId, phantomSupplierIds));
  const stillUsedSupplierIds = new Set(remainingPrices.map((p) => p.supplierId));
  const supplierIdsToDelete = phantomSupplierIds.filter(
    (id) => !stillUsedSupplierIds.has(id),
  );

  let deletedSuppliers = 0;
  if (supplierIdsToDelete.length > 0) {
    await db.delete(suppliers).where(inArray(suppliers.id, supplierIdsToDelete));
    deletedSuppliers = supplierIdsToDelete.length;
  }

  return {
    deletedPrices,
    deletedSuppliers,
    manualEditPreserved: preservedPriceIds.length,
  };
}

// ----------------------------------------------------------------------
// Market rates from "range" rows (formerly mis-filed in materials CSV).
// Each row becomes one market_rates entry, keyed by category + name marker
// (same convention as labour seeding).
// ----------------------------------------------------------------------
async function seedMarketRatesFromMaterialRanges(
  rows: Array<Record<string, string>>,
  categoryIdByName: Map<string, number>,
): Promise<{ inserted: number; skipped: number; manualEditPreserved: number }> {
  let inserted = 0;
  let skipped = 0;
  let manualEditPreserved = 0;

  for (const r of rows) {
    const name = r.name?.trim();
    const typical = r.unit_price_cad_typical?.trim();
    if (!name || !typical || Number.isNaN(Number(typical))) {
      skipped += 1;
      continue;
    }
    const csvCat = (r.category ?? "").trim();
    const displayCat = CSV_CATEGORY_TO_DISPLAY[csvCat];
    const categoryId = displayCat ? categoryIdByName.get(displayCat) : undefined;
    if (!categoryId) {
      skipped += 1;
      continue;
    }

    const nameMarker = `[role: ${name}]`;
    const existing = await db
      .select()
      .from(marketRates)
      .where(eq(marketRates.categoryId, categoryId));
    const match = existing.find((m) => (m.notes ?? "").includes(nameMarker));
    if (match) {
      if ((match.notes ?? "").includes(MANUAL_EDIT_MARKER)) {
        manualEditPreserved += 1;
        continue;
      }
      skipped += 1;
      continue;
    }

    const low = (r.unit_price_cad_low ?? "").trim();
    const high = (r.unit_price_cad_high ?? "").trim();
    const sourceLine = r.source_url ? `Source: ${r.source_url}` : "";
    const notesPieces = [
      nameMarker,
      sourceLine,
      r.last_verified ? `Verified ${r.last_verified}` : "",
      r.notes ?? "",
    ].filter(Boolean);

    await db.insert(marketRates).values({
      categoryId,
      unitType: csvUnitToDb(r.unit ?? ""),
      lowRate: low || typical,
      typicalRate: typical,
      highRate: high || typical,
      effectiveDate: r.last_verified || new Date().toISOString().slice(0, 10),
      isActive: true,
      notes: notesPieces.join("\n"),
    });
    inserted += 1;
  }

  return { inserted, skipped, manualEditPreserved };
}

// ----------------------------------------------------------------------
// Public entry point.
// ----------------------------------------------------------------------
export interface MuskokaSeedSummary {
  categories: { existing: number; created: number };
  suppliers: { existing: number; created: number };
  supplierPrices: { inserted: number; skipped: number; manualEditPreserved: number };
  marketRates: { inserted: number; skipped: number; manualEditPreserved: number };
  regionalModifiers: { inserted: number; skipped: number; manualEditPreserved: number };
  cleanup: { deletedPrices: number; deletedSuppliers: number; manualEditPreserved: number };
}

export async function seedMuskokaPriceBook(): Promise<MuskokaSeedSummary> {
  const materialsPath = path.join(MUSKOKA_DATA_DIR, "muskoka_materials_prices.csv");
  const labourPath = path.join(MUSKOKA_DATA_DIR, "muskoka_labour_rates.csv");
  const lumberPath = path.join(MUSKOKA_DATA_DIR, "muskoka_lumber_receipts.csv");
  const marketRatesPath = path.join(MUSKOKA_DATA_DIR, "muskoka_market_rates.csv");

  const materialsRaw = fs.existsSync(materialsPath) ? fs.readFileSync(materialsPath, "utf8") : "";
  const labourRaw = fs.existsSync(labourPath) ? fs.readFileSync(labourPath, "utf8") : "";
  const lumberRaw = fs.existsSync(lumberPath) ? fs.readFileSync(lumberPath, "utf8") : "";
  const marketRatesRaw = fs.existsSync(marketRatesPath) ? fs.readFileSync(marketRatesPath, "utf8") : "";

  const materialRows = rowsToObjects(parseCsv(materialsRaw));
  const labourRows = rowsToObjects(parseCsv(labourRaw));
  const lumberRows = rowsToObjects(parseCsv(lumberRaw));
  const materialMarketRows = rowsToObjects(parseCsv(marketRatesRaw));

  // Combined supplier-price source rows (materials CSV + lumber receipts).
  // Suppliers are derived from the union so "Muskoka Lumber" gets a row.
  const allPriceRows = [...materialRows, ...lumberRows];

  const beforeCategories = (await db.select().from(costCategories)).length;
  const categoryIdByName = await seedCategories();
  const afterCategories = categoryIdByName.size;

  const beforeSuppliers = (await db.select().from(suppliers)).length;
  const supplierIdByName = await seedSuppliers(allPriceRows);
  const afterSuppliers = supplierIdByName.size;

  // Drop legacy phantom suppliers BEFORE inserting new prices so the
  // Supplier Price Book renders cleanly on first boot after merge.
  const cleanupResult = await cleanupPhantomSuppliers();

  const supplierPriceResult = await seedSupplierPrices(
    allPriceRows,
    supplierIdByName,
    categoryIdByName,
  );
  const labourMarketRateResult = await seedMarketRates(labourRows, categoryIdByName);
  const materialMarketRateResult = await seedMarketRatesFromMaterialRanges(
    materialMarketRows,
    categoryIdByName,
  );
  const regionalResult = await seedRegionalModifiers();

  return {
    categories: {
      existing: beforeCategories,
      created: afterCategories - beforeCategories,
    },
    suppliers: {
      existing: beforeSuppliers,
      created: afterSuppliers - beforeSuppliers,
    },
    supplierPrices: supplierPriceResult,
    marketRates: {
      inserted: labourMarketRateResult.inserted + materialMarketRateResult.inserted,
      skipped: labourMarketRateResult.skipped + materialMarketRateResult.skipped,
      manualEditPreserved:
        labourMarketRateResult.manualEditPreserved +
        materialMarketRateResult.manualEditPreserved,
    },
    regionalModifiers: regionalResult,
    cleanup: cleanupResult,
  };
}
