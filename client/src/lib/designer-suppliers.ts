// Curated list of brand-name suppliers that interior designers actually shop.
// Used by the product-card supplier dropdown on the planning board so picking
// a known brand is one click instead of typing.
//
// Picking an entry fills BOTH the supplier name AND, only when the product
// URL field is blank, the brand homepage so a follow-up unfurl can pull
// imageUrl/title automatically.
//
// Add / remove freely — order within each group is the dropdown order.

export type DesignerSupplier = {
  name: string;
  url: string;
};

export type DesignerSupplierGroup = {
  label: string;
  suppliers: DesignerSupplier[];
};

export const DESIGNER_SUPPLIER_GROUPS: DesignerSupplierGroup[] = [
  {
    label: "Furniture — High End",
    suppliers: [
      { name: "Restoration Hardware", url: "https://rh.com" },
      { name: "Holly Hunt", url: "https://hollyhunt.com" },
      { name: "Hickory Chair", url: "https://hickorychair.com" },
      { name: "Lee Industries", url: "https://leeindustries.com" },
      { name: "Ralph Lauren Home", url: "https://ralphlaurenhome.com" },
      { name: "Bernhardt", url: "https://bernhardt.com" },
      { name: "Baker Furniture", url: "https://bakerfurniture.com" },
      { name: "B&B Italia", url: "https://bebitalia.com" },
      { name: "Minotti", url: "https://minotti.com" },
      { name: "Roche Bobois", url: "https://roche-bobois.com" },
      { name: "Cassina", url: "https://cassina.com" },
      { name: "Knoll", url: "https://knoll.com" },
      { name: "Herman Miller", url: "https://hermanmiller.com" },
      { name: "Arteriors", url: "https://arteriorshome.com" },
      { name: "Four Hands", url: "https://fourhands.com" },
    ],
  },
  {
    label: "Furniture — Modern / Mid-Range",
    suppliers: [
      { name: "Crate & Barrel", url: "https://crateandbarrel.com" },
      { name: "CB2", url: "https://cb2.com" },
      { name: "West Elm", url: "https://westelm.com" },
      { name: "Pottery Barn", url: "https://potterybarn.com" },
      { name: "Room & Board", url: "https://roomandboard.com" },
      { name: "DWR (Design Within Reach)", url: "https://dwr.com" },
      { name: "Article", url: "https://article.com" },
      { name: "EQ3", url: "https://eq3.com" },
      { name: "Gus* Modern", url: "https://gusmodern.com" },
      { name: "Blu Dot", url: "https://bludot.com" },
      { name: "Anthropologie", url: "https://anthropologie.com" },
      { name: "Serena & Lily", url: "https://serenaandlily.com" },
    ],
  },
  {
    label: "Lighting",
    suppliers: [
      { name: "Visual Comfort", url: "https://visualcomfort.com" },
      { name: "Circa Lighting", url: "https://circalighting.com" },
      { name: "Hudson Valley Lighting", url: "https://hudsonvalleylighting.com" },
      { name: "Hinkley", url: "https://hinkley.com" },
      { name: "Kichler", url: "https://kichler.com" },
      { name: "Tom Dixon", url: "https://tomdixon.net" },
      { name: "Flos", url: "https://flos.com" },
      { name: "Artemide", url: "https://artemide.com" },
      { name: "Louis Poulsen", url: "https://louispoulsen.com" },
      { name: "Moooi", url: "https://moooi.com" },
      { name: "Allied Maker", url: "https://alliedmaker.com" },
      { name: "Apparatus Studio", url: "https://apparatusstudio.com" },
      { name: "Roll & Hill", url: "https://rollandhill.com" },
      { name: "Cedar & Moss", url: "https://cedarandmoss.com" },
      { name: "Schoolhouse", url: "https://schoolhouse.com" },
      { name: "Rejuvenation", url: "https://rejuvenation.com" },
    ],
  },
  {
    label: "Plumbing & Bath",
    suppliers: [
      { name: "Waterworks", url: "https://waterworks.com" },
      { name: "Kallista", url: "https://kallista.com" },
      { name: "Brizo", url: "https://brizo.com" },
      { name: "Kohler", url: "https://kohler.com" },
      { name: "Rohl", url: "https://rohl.com" },
      { name: "Perrin & Rowe", url: "https://perrinandrowe.com" },
      { name: "Newport Brass", url: "https://newportbrass.com" },
      { name: "Signature Hardware", url: "https://signaturehardware.com" },
      { name: "Native Trails", url: "https://nativetrailshome.com" },
      { name: "Victoria + Albert", url: "https://vandabaths.com" },
    ],
  },
  {
    label: "Hardware & Fittings",
    suppliers: [
      { name: "Rocky Mountain Hardware", url: "https://rockymountainhardware.com" },
      { name: "Emtek", url: "https://emtek.com" },
      { name: "Baldwin", url: "https://baldwinhardware.com" },
      { name: "Top Knobs", url: "https://topknobs.com" },
      { name: "Schaub & Company", url: "https://schaubandcompany.com" },
      { name: "Buster + Punch", url: "https://busterandpunch.com" },
      { name: "Armac Martin", url: "https://armacmartin.com" },
    ],
  },
  {
    label: "Tile, Stone & Surfaces",
    suppliers: [
      { name: "Ann Sacks", url: "https://annsacks.com" },
      { name: "Walker Zanger", url: "https://walkerzanger.com" },
      { name: "Cle Tile", url: "https://cletile.com" },
      { name: "Heath Ceramics", url: "https://heathceramics.com" },
      { name: "Fireclay Tile", url: "https://fireclaytile.com" },
      { name: "Zia Tile", url: "https://ziatile.com" },
      { name: "Caesarstone", url: "https://caesarstone.ca" },
      { name: "Cambria", url: "https://cambriausa.com" },
      { name: "Calacatta / Marble.com", url: "https://marble.com" },
    ],
  },
  {
    label: "Textiles & Rugs",
    suppliers: [
      { name: "Schumacher", url: "https://fschumacher.com" },
      { name: "Kravet", url: "https://kravet.com" },
      { name: "Pierre Frey", url: "https://pierrefrey.com" },
      { name: "Romo", url: "https://romo.com" },
      { name: "de Le Cuona", url: "https://delecuona.com" },
      { name: "Loloi Rugs", url: "https://loloirugs.com" },
      { name: "Jaipur Living", url: "https://jaipurliving.com" },
      { name: "Annie Selke / Dash & Albert", url: "https://annieselke.com" },
      { name: "The Citizenry", url: "https://the-citizenry.com" },
      { name: "Armadillo", url: "https://armadillo-co.com" },
    ],
  },
  {
    label: "Appliances",
    suppliers: [
      { name: "Sub-Zero & Wolf", url: "https://subzero-wolf.com" },
      { name: "Miele", url: "https://miele.ca" },
      { name: "Thermador", url: "https://thermador.com" },
      { name: "Gaggenau", url: "https://gaggenau.com" },
      { name: "La Cornue", url: "https://lacornueusa.com" },
      { name: "Lacanche", url: "https://lacanche.com" },
      { name: "Smeg", url: "https://smegusa.com" },
      { name: "Fisher & Paykel", url: "https://fisherpaykel.com" },
    ],
  },
  {
    label: "Paint & Wallcoverings",
    suppliers: [
      { name: "Benjamin Moore", url: "https://benjaminmoore.com" },
      { name: "Farrow & Ball", url: "https://farrow-ball.com" },
      { name: "Sherwin-Williams", url: "https://sherwin-williams.com" },
      { name: "Portola Paints", url: "https://portolapaints.com" },
      { name: "Phillip Jeffries", url: "https://phillipjeffries.com" },
      { name: "Cole & Son", url: "https://cole-and-son.com" },
      { name: "de Gournay", url: "https://degournay.com" },
    ],
  },
  {
    label: "Decor & Accessories",
    suppliers: [
      { name: "McGee & Co.", url: "https://mcgeeandco.com" },
      { name: "Studio McGee", url: "https://studio-mcgee.com" },
      { name: "Jayson Home", url: "https://jaysonhome.com" },
      { name: "Lulu and Georgia", url: "https://luluandgeorgia.com" },
      { name: "Chairish", url: "https://chairish.com" },
      { name: "1stDibs", url: "https://1stdibs.com" },
      { name: "Aerin", url: "https://aerin.com" },
    ],
  },
];

// Flat lookup — used to match a typed supplier back to a known brand
// (e.g. so we can prefill the brand homepage if a user typed the name).
export const ALL_DESIGNER_SUPPLIERS: DesignerSupplier[] =
  DESIGNER_SUPPLIER_GROUPS.flatMap((g) => g.suppliers);
