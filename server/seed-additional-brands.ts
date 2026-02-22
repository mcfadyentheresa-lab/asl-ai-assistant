import { db } from "./db";
import { paintColors } from "@shared/schema";
import { eq } from "drizzle-orm";

interface ColorEntry {
  name: string;
  code: string;
  hex: string;
  collection?: string;
  lrv?: number;
  isPopular?: boolean;
}

interface ColorFamily {
  family: string;
  colors: ColorEntry[];
}

const sherwinWilliamsColors: ColorFamily[] = [
  {
    family: "White",
    colors: [
      { name: "Alabaster", code: "SW 7008", hex: "#EDEADE", lrv: 82, isPopular: true },
      { name: "Pure White", code: "SW 7005", hex: "#F0EDE3", lrv: 84, isPopular: true },
      { name: "Snowbound", code: "SW 7004", hex: "#EDE8DF", lrv: 83, isPopular: true },
      { name: "Extra White", code: "SW 7006", hex: "#F1F0EA", lrv: 86 },
      { name: "Greek Villa", code: "SW 7551", hex: "#F0EBDB", lrv: 84 },
      { name: "Shoji White", code: "SW 7042", hex: "#E5DFD0", lrv: 74 },
      { name: "Creamy", code: "SW 7012", hex: "#EFE5D1", lrv: 81 },
      { name: "Westhighland White", code: "SW 7566", hex: "#F3ECD9", lrv: 83 },
    ],
  },
  {
    family: "Neutral",
    colors: [
      { name: "Agreeable Gray", code: "SW 7029", hex: "#D0C9B9", lrv: 60, isPopular: true },
      { name: "Accessible Beige", code: "SW 7036", hex: "#D1C4AE", lrv: 58, isPopular: true },
      { name: "Balanced Beige", code: "SW 7037", hex: "#C1B59F", lrv: 46 },
      { name: "Kilim Beige", code: "SW 6106", hex: "#C7B79A", lrv: 50 },
      { name: "Macadamia", code: "SW 6142", hex: "#D6C9AE", lrv: 61 },
      { name: "Natural Tan", code: "SW 7567", hex: "#C7B89D", lrv: 50 },
    ],
  },
  {
    family: "Gray",
    colors: [
      { name: "Repose Gray", code: "SW 7015", hex: "#C2BDB3", lrv: 58, isPopular: true },
      { name: "Mindful Gray", code: "SW 7016", hex: "#B5AFA3", lrv: 48, isPopular: true },
      { name: "Colonnade Gray", code: "SW 7641", hex: "#BEB9AB", lrv: 53 },
      { name: "Worldly Gray", code: "SW 7043", hex: "#C8C1B3", lrv: 57 },
      { name: "Passive", code: "SW 7064", hex: "#C6C3BC", lrv: 60 },
      { name: "Dorian Gray", code: "SW 7017", hex: "#A9A39A", lrv: 39 },
      { name: "Gauntlet Gray", code: "SW 7019", hex: "#86807A", lrv: 24 },
      { name: "Anonymous", code: "SW 7046", hex: "#9E9790", lrv: 33 },
      { name: "Pewter Tankard", code: "SW 0023", hex: "#8A8580", lrv: 26 },
    ],
  },
  {
    family: "Blue",
    colors: [
      { name: "Sea Salt", code: "SW 6204", hex: "#C5D5CB", lrv: 63, isPopular: true },
      { name: "Naval", code: "SW 6244", hex: "#2E3441", lrv: 4, isPopular: true },
      { name: "Waterloo", code: "SW 9141", hex: "#8497A5", lrv: 30 },
      { name: "Gale Force", code: "SW 7605", hex: "#2E4659", lrv: 7 },
      { name: "Cyberspace", code: "SW 7076", hex: "#454E56", lrv: 8 },
      { name: "Misty", code: "SW 6232", hex: "#C5D1CF", lrv: 61 },
      { name: "Tradewind", code: "SW 6218", hex: "#9BB7B3", lrv: 46 },
      { name: "Rainstorm", code: "SW 6230", hex: "#3E5A6A", lrv: 10 },
    ],
  },
  {
    family: "Green",
    colors: [
      { name: "Evergreen Fog", code: "SW 9130", hex: "#95A08B", lrv: 30, isPopular: true },
      { name: "Pewter Green", code: "SW 6208", hex: "#A2AD9D", lrv: 40 },
      { name: "Clary Sage", code: "SW 6178", hex: "#B0AF96", lrv: 44 },
      { name: "Acacia Haze", code: "SW 9132", hex: "#96A08E", lrv: 31 },
      { name: "Emerald", code: "SW 6766", hex: "#24664B", lrv: 10, isPopular: true },
      { name: "Ripe Olive", code: "SW 6209", hex: "#484E38", lrv: 7 },
      { name: "Succulent", code: "SW 9650", hex: "#869A79", lrv: 30 },
    ],
  },
  {
    family: "Brown",
    colors: [
      { name: "Urbane Bronze", code: "SW 7048", hex: "#54504A", lrv: 8, isPopular: true },
      { name: "Van Dyke Brown", code: "SW 7041", hex: "#6B5C4C", lrv: 11 },
      { name: "Latte", code: "SW 6108", hex: "#C9B89D", lrv: 50 },
      { name: "Umber Rust", code: "SW 9100", hex: "#835C3E", lrv: 12 },
    ],
  },
  {
    family: "Black",
    colors: [
      { name: "Tricorn Black", code: "SW 6258", hex: "#2F2F30", lrv: 3, isPopular: true },
      { name: "Iron Ore", code: "SW 7069", hex: "#434341", lrv: 6, isPopular: true },
      { name: "Black Magic", code: "SW 6991", hex: "#353333", lrv: 3 },
      { name: "Caviar", code: "SW 6990", hex: "#353336", lrv: 3 },
    ],
  },
  {
    family: "Yellow",
    colors: [
      { name: "Butter Up", code: "SW 6681", hex: "#F3E0A5", lrv: 76 },
      { name: "Jonquil", code: "SW 6674", hex: "#F0D779", lrv: 68 },
      { name: "Jersey Cream", code: "SW 6379", hex: "#F1E1B6", lrv: 78 },
    ],
  },
  {
    family: "Orange",
    colors: [
      { name: "Cavern Clay", code: "SW 7701", hex: "#B16B4C", lrv: 18, isPopular: true },
      { name: "Copper Wire", code: "SW 7707", hex: "#C17D52", lrv: 24 },
      { name: "Subdued Sienna", code: "SW 9009", hex: "#B5785A", lrv: 22 },
    ],
  },
  {
    family: "Red",
    colors: [
      { name: "Red Bay", code: "SW 6321", hex: "#8C3533", lrv: 7 },
      { name: "Positive Red", code: "SW 6871", hex: "#AD3235", lrv: 9 },
      { name: "Bravado Red", code: "SW 6320", hex: "#753430", lrv: 5 },
    ],
  },
  {
    family: "Pink",
    colors: [
      { name: "Rosy Outlook", code: "SW 6316", hex: "#E8C0B2", lrv: 55 },
      { name: "Quaint Peche", code: "SW 6330", hex: "#E8C4A6", lrv: 57 },
      { name: "Appleblossom", code: "SW 0076", hex: "#E3BBAF", lrv: 51 },
    ],
  },
  {
    family: "Purple",
    colors: [
      { name: "Expressive Plum", code: "SW 6271", hex: "#5C4558", lrv: 7 },
      { name: "Grape Harvest", code: "SW 6285", hex: "#8E7F94", lrv: 24 },
      { name: "Plummy", code: "SW 6558", hex: "#675061", lrv: 9 },
    ],
  },
];

const farrowAndBallColors: ColorFamily[] = [
  {
    family: "White",
    colors: [
      { name: "All White", code: "No.2005", hex: "#F5F2EB", lrv: 85, isPopular: true },
      { name: "Strong White", code: "No.2001", hex: "#EAE6DB", lrv: 81, isPopular: true },
      { name: "Pointing", code: "No.2003", hex: "#F4EEE0", lrv: 83 },
      { name: "Wimborne White", code: "No.239", hex: "#F1EDE3", lrv: 83 },
      { name: "James White", code: "No.2010", hex: "#EDE8D9", lrv: 79 },
      { name: "Wevet", code: "No.273", hex: "#E8E5DA", lrv: 78 },
      { name: "School House White", code: "No.291", hex: "#E7E2D6", lrv: 76 },
    ],
  },
  {
    family: "Neutral",
    colors: [
      { name: "Elephant's Breath", code: "No.229", hex: "#C4BAA9", lrv: 48, isPopular: true },
      { name: "Joa's White", code: "No.226", hex: "#DDD4BF", lrv: 65 },
      { name: "Oxford Stone", code: "No.264", hex: "#CBB78D", lrv: 48 },
      { name: "Matchstick", code: "No.2013", hex: "#E2D8C2", lrv: 69 },
      { name: "London Stone", code: "No.6", hex: "#A5957A", lrv: 33 },
      { name: "Savage Ground", code: "No.213", hex: "#D8C9AD", lrv: 59 },
    ],
  },
  {
    family: "Gray",
    colors: [
      { name: "Cornforth White", code: "No.228", hex: "#C8C3B8", lrv: 55, isPopular: true },
      { name: "Ammonite", code: "No.274", hex: "#D4CDC0", lrv: 62, isPopular: true },
      { name: "Pavilion Gray", code: "No.242", hex: "#BEBCB0", lrv: 52 },
      { name: "Manor House Gray", code: "No.265", hex: "#7D7B73", lrv: 22 },
      { name: "Worsted", code: "No.284", hex: "#A5A092", lrv: 37 },
      { name: "Dimpse", code: "No.277", hex: "#C5BFAF", lrv: 53 },
      { name: "Purbeck Stone", code: "No.275", hex: "#C1B9A8", lrv: 49 },
      { name: "Mole's Breath", code: "No.276", hex: "#908478", lrv: 25 },
    ],
  },
  {
    family: "Blue",
    colors: [
      { name: "Hague Blue", code: "No.30", hex: "#2C3E50", lrv: 6, isPopular: true },
      { name: "Stiffkey Blue", code: "No.281", hex: "#3A4D5C", lrv: 8, isPopular: true },
      { name: "Stone Blue", code: "No.86", hex: "#7B97A0", lrv: 30 },
      { name: "Parma Gray", code: "No.27", hex: "#A8B6B8", lrv: 46 },
      { name: "Lulworth Blue", code: "No.89", hex: "#9CB4BF", lrv: 45 },
      { name: "Pitch Blue", code: "No.220", hex: "#546775", lrv: 14 },
      { name: "Cook's Blue", code: "No.237", hex: "#52728A", lrv: 17 },
    ],
  },
  {
    family: "Green",
    colors: [
      { name: "Vert De Terre", code: "No.234", hex: "#BBC5AD", lrv: 53 },
      { name: "Calke Green", code: "No.34", hex: "#6B7962", lrv: 19 },
      { name: "Card Room Green", code: "No.79", hex: "#5B6751", lrv: 13 },
      { name: "Studio Green", code: "No.93", hex: "#384136", lrv: 5 },
      { name: "Breakfast Room Green", code: "No.81", hex: "#7B9674", lrv: 27 },
      { name: "Green Smoke", code: "No.47", hex: "#7A8972", lrv: 24 },
      { name: "Treron", code: "No.292", hex: "#8C9480", lrv: 30 },
    ],
  },
  {
    family: "Brown",
    colors: [
      { name: "Mouse's Back", code: "No.40", hex: "#8F7F6A", lrv: 22 },
      { name: "London Clay", code: "No.244", hex: "#7D5B42", lrv: 12 },
      { name: "Brinjal", code: "No.222", hex: "#49363E", lrv: 4 },
    ],
  },
  {
    family: "Black",
    colors: [
      { name: "Railings", code: "No.31", hex: "#3A3A3C", lrv: 4, isPopular: true },
      { name: "Off-Black", code: "No.57", hex: "#3B3C40", lrv: 4 },
      { name: "Pitch Black", code: "No.256", hex: "#313338", lrv: 3 },
      { name: "Down Pipe", code: "No.26", hex: "#626260", lrv: 12, isPopular: true },
    ],
  },
  {
    family: "Yellow",
    colors: [
      { name: "Dayroom Yellow", code: "No.233", hex: "#E7D57E", lrv: 62 },
      { name: "Citron", code: "No.74", hex: "#D2C158", lrv: 50 },
      { name: "Sudbury Yellow", code: "No.51", hex: "#D9C06A", lrv: 53 },
    ],
  },
  {
    family: "Orange",
    colors: [
      { name: "Charlotte's Locks", code: "No.268", hex: "#D17339", lrv: 22 },
      { name: "India Yellow", code: "No.66", hex: "#C9943A", lrv: 33 },
    ],
  },
  {
    family: "Red",
    colors: [
      { name: "Rectory Red", code: "No.217", hex: "#8A3334", lrv: 6 },
      { name: "Incarnadine", code: "No.248", hex: "#8C3632", lrv: 6 },
      { name: "Blazer", code: "No.212", hex: "#B8432F", lrv: 12 },
    ],
  },
  {
    family: "Pink",
    colors: [
      { name: "Sulking Room Pink", code: "No.295", hex: "#C4ACA4", lrv: 44, isPopular: true },
      { name: "Peignoir", code: "No.286", hex: "#CDBEB4", lrv: 53, isPopular: true },
      { name: "Setting Plaster", code: "No.231", hex: "#DFC9B7", lrv: 58 },
      { name: "Pink Ground", code: "No.202", hex: "#E8D3C1", lrv: 65 },
      { name: "Dead Salmon", code: "No.28", hex: "#C4A48A", lrv: 39 },
    ],
  },
  {
    family: "Purple",
    colors: [
      { name: "Brassica", code: "No.271", hex: "#6E5965", lrv: 11 },
      { name: "Pelt", code: "No.254", hex: "#4D3E51", lrv: 5 },
      { name: "Rangwali", code: "No.296", hex: "#B97094", lrv: 21 },
    ],
  },
];

const paraPaintsColors: ColorFamily[] = [
  {
    family: "White",
    colors: [
      { name: "Para Cotton", code: "P5000-11", hex: "#F2EEE4", lrv: 85, isPopular: true },
      { name: "Whitecap", code: "P5000-10", hex: "#F0ECE1", lrv: 83, isPopular: true },
      { name: "White Whisper", code: "P5000-01", hex: "#F5F3EE", lrv: 89, isPopular: true },
      { name: "Snowdrift", code: "P5000-05", hex: "#F3F1EA", lrv: 87 },
      { name: "Alpine White", code: "P5000-13", hex: "#EDE9DE", lrv: 80 },
      { name: "Ivory Tusk", code: "P5000-21", hex: "#F1E9D4", lrv: 81 },
    ],
  },
  {
    family: "Neutral",
    colors: [
      { name: "Para Mink", code: "P5001-44", hex: "#B5A898", lrv: 40, isPopular: true },
      { name: "Cashmere", code: "P5001-33", hex: "#C8BBAA", lrv: 51 },
      { name: "Sandstone", code: "P5001-34", hex: "#C4B59C", lrv: 48 },
      { name: "Fawn", code: "P5001-42", hex: "#BAA98F", lrv: 42 },
      { name: "Linen", code: "P5001-23", hex: "#DBD0BF", lrv: 63 },
      { name: "Birchwood", code: "P5001-31", hex: "#CBBFAB", lrv: 54 },
    ],
  },
  {
    family: "Gray",
    colors: [
      { name: "Silverpoint", code: "P5001-52", hex: "#B4AEA3", lrv: 44, isPopular: true },
      { name: "Smoke", code: "P5001-53", hex: "#A9A49A", lrv: 39 },
      { name: "Pebble", code: "P5001-43", hex: "#B0A596", lrv: 39 },
      { name: "Fog", code: "P5001-22", hex: "#CBC5BA", lrv: 56 },
      { name: "Platinum", code: "P5001-62", hex: "#9E9990", lrv: 34 },
      { name: "Charcoal Slate", code: "P5001-75", hex: "#6B6660", lrv: 14 },
    ],
  },
  {
    family: "Blue",
    colors: [
      { name: "Northern Sky", code: "P5004-35", hex: "#9BB6C4", lrv: 45, isPopular: true },
      { name: "Twilight Zone", code: "P5001-85D", hex: "#3B4A5C", lrv: 7, isPopular: true },
      { name: "Ice Blue", code: "P5004-14", hex: "#C8D6DC", lrv: 63 },
      { name: "Bluebell", code: "P5004-44", hex: "#7BA0B3", lrv: 33 },
      { name: "Navy Pier", code: "P5004-76D", hex: "#2E4052", lrv: 5 },
      { name: "Glacier", code: "P5004-24", hex: "#B1C5D0", lrv: 54 },
    ],
  },
  {
    family: "Green",
    colors: [
      { name: "Forest Walk", code: "P5008-64", hex: "#4A6B4E", lrv: 13, isPopular: true },
      { name: "Sage Garden", code: "P5008-34", hex: "#98A688", lrv: 36 },
      { name: "Celadon", code: "P5008-24", hex: "#ADBB9E", lrv: 48 },
      { name: "Fern Gully", code: "P5008-54", hex: "#5C7858", lrv: 17 },
      { name: "Moss", code: "P5008-44", hex: "#778B6C", lrv: 24 },
      { name: "Evergreen", code: "P5008-74D", hex: "#2F4F3A", lrv: 6 },
    ],
  },
  {
    family: "Brown",
    colors: [
      { name: "Espresso", code: "P5002-75D", hex: "#5A4638", lrv: 7 },
      { name: "Cocoa", code: "P5002-64", hex: "#7A624E", lrv: 13 },
      { name: "Toffee", code: "P5002-54", hex: "#9A7E60", lrv: 23 },
    ],
  },
  {
    family: "Black",
    colors: [
      { name: "Obsidian", code: "P5001-85", hex: "#363434", lrv: 3 },
      { name: "Midnight", code: "P5001-84D", hex: "#3E3C3C", lrv: 4 },
    ],
  },
  {
    family: "Yellow",
    colors: [
      { name: "Buttercup", code: "P5012-34", hex: "#E8D07A", lrv: 64 },
      { name: "Sunbeam", code: "P5012-24", hex: "#F0DD93", lrv: 72 },
      { name: "Honeycomb", code: "P5012-44", hex: "#D5B85C", lrv: 47 },
    ],
  },
  {
    family: "Orange",
    colors: [
      { name: "Autumn Harvest", code: "P5014-54", hex: "#C07845", lrv: 22 },
      { name: "Terracotta", code: "P5014-64", hex: "#A86240", lrv: 14 },
    ],
  },
  {
    family: "Red",
    colors: [
      { name: "Cranberry", code: "P5016-64D", hex: "#8B3038", lrv: 6 },
      { name: "Heritage Red", code: "P5016-74D", hex: "#7A2B30", lrv: 5 },
    ],
  },
  {
    family: "Pink",
    colors: [
      { name: "Rose Petal", code: "P5016-14", hex: "#ECCEC5", lrv: 64 },
      { name: "Blush", code: "P5016-24", hex: "#E0BAB0", lrv: 51 },
      { name: "Ballet Slipper", code: "P5016-34", hex: "#D8A8A0", lrv: 42 },
    ],
  },
  {
    family: "Purple",
    colors: [
      { name: "Plum Noir", code: "P5018-74D", hex: "#4E3A50", lrv: 5 },
      { name: "Lavender Fields", code: "P5018-24", hex: "#C5B4CA", lrv: 47 },
      { name: "Amethyst", code: "P5018-44", hex: "#8B7392", lrv: 19 },
    ],
  },
];

async function seedBrandColors(brand: string, colorFamilies: ColorFamily[]) {
  const existing = await db
    .select()
    .from(paintColors)
    .where(eq(paintColors.brand, brand))
    .limit(1);

  if (existing.length > 0) {
    console.log(`${brand} colors already seeded. Skipping.`);
    return 0;
  }

  console.log(`Seeding ${brand} paint colors...`);
  let count = 0;

  for (const family of colorFamilies) {
    const values = family.colors.map((c) => ({
      brand,
      name: c.name,
      code: c.code,
      hex: c.hex.toUpperCase(),
      colorFamily: family.family,
      collection: c.collection || null,
      lrv: c.lrv || null,
      isPopular: c.isPopular || false,
    }));
    await db.insert(paintColors).values(values);
    count += values.length;
    console.log(`  Inserted ${values.length} ${family.family} colors`);
  }

  console.log(`Done! Seeded ${count} ${brand} colors.`);
  return count;
}

async function seedAdditionalBrands() {
  let total = 0;
  total += await seedBrandColors("Sherwin-Williams", sherwinWilliamsColors);
  total += await seedBrandColors("Farrow & Ball", farrowAndBallColors);
  total += await seedBrandColors("Para Paints", paraPaintsColors);
  console.log(`\nTotal additional colors seeded: ${total}`);
}

seedAdditionalBrands()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed error:", err);
    process.exit(1);
  });
