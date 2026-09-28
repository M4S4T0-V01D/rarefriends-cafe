/** Static rules. Beans are an in-shop soft currency; only Rare Recipe Capsules touch (simulated) RF. */

export type ShopId = "cafe" | "seafood" | "pastry" | "burger" | "asian";
export type DishShape =
  | "cup" | "latte" | "tall" | "bowl" | "noodles" | "plate" | "fish" | "fries" | "skewer" | "dumplings" | "sushi"
  | "burger" | "bread" | "croissant" | "cake" | "macaron" | "shells" | "pan" | "rice" | "mochi" | "pancakes" | "omurice" | "parfait";
/** A dish id is `<shop>:<menu index>`; indexes 7 and 8 are the capsule specials. */
export type DishId = `${ShopId}:${number}`;
export type Dish = Readonly<{
  id: DishId; name: string; price: number; cook: number; unlockCost: number; level: number;
  /** Kept capsule recipe (outcome index) required instead of a Beans unlock. */
  blend?: number; shape: DishShape; color: string; accent: string;
}>;

/** Price, cook time, unlock cost and level are shared per menu slot so every shop is balanced alike. */
const TIERS = [
  { price: 5, cook: 3, unlockCost: 0, level: 1 }, { price: 7, cook: 4, unlockCost: 0, level: 1 },
  { price: 9, cook: 5, unlockCost: 60, level: 2 }, { price: 12, cook: 6, unlockCost: 120, level: 3 },
  { price: 16, cook: 8, unlockCost: 200, level: 5 }, { price: 23, cook: 10, unlockCost: 350, level: 7 },
  { price: 29, cook: 9, unlockCost: 500, level: 9 },
  { price: 35, cook: 6, unlockCost: 0, level: 1, blend: 1 }, { price: 55, cook: 11, unlockCost: 0, level: 1, blend: 2 },
] as const;
type MenuRow = readonly [name: string, shape: DishShape, color: string, accent: string];

export type Shop = Readonly<{
  id: ShopId; name: string; kind: string; sign: string; tagline: string; station: "espresso" | "tank" | "oven" | "grill" | "steamer";
  accent: string; menu: readonly Dish[];
}>;
function shop(id: ShopId, name: string, kind: string, sign: string, tagline: string, station: Shop["station"], accent: string, rows: readonly MenuRow[]): Shop {
  return { id, name, kind, sign, tagline, station, accent,
    menu: rows.map(([dishName, shape, color, dishAccent], index) => ({ id: `${id}:${index}` as DishId, name: dishName, shape, color, accent: dishAccent, ...TIERS[index] })) };
}

export const SHOPS: readonly Shop[] = [
  shop("cafe", "RareFriends Cafe", "Coffee & sweets café", "CAFE", "Lattes, mochi and omurice with a ketchup heart.", "espresso", "#d8b6b4", [
    ["Espresso", "cup", "#6f6a64", "#e8e4dc"], ["Latte ♡", "latte", "#b8a894", "#f4efe6"], ["Matcha Latte", "latte", "#a9b99a", "#eef1e6"],
    ["Strawberry Mochi", "mochi", "#d9b3b3", "#b4c3ab"], ["Fluffy Pancakes", "pancakes", "#dccb9c", "#e2d7ad"],
    ["Omurice (ketchup heart)", "omurice", "#e2d49e", "#c98f8f"], ["Cloud Parfait", "parfait", "#c5bdd6", "#f3f0f8"],
    ["Silver Latte", "latte", "#b9bfc6", "#ffffff"], ["Moonlight Parfait", "parfait", "#9fabc2", "#e9e3c4"],
  ]),
  shop("seafood", "Tide & Shell", "Seafood restaurant", "SEAFOOD", "Chowder, fish & chips and a lobster roll by the window.", "tank", "#afbccb", [
    ["Clam Chowder", "bowl", "#e8e1cf", "#b8a894"], ["Fish & Chips", "fish", "#dccb9c", "#e2d7ad"], ["Grilled Squid", "skewer", "#d9c3b0", "#8f8a84"],
    ["Shrimp Tempura", "fries", "#e2cfa0", "#d8a79c"], ["Oyster Plate", "shells", "#cfd3d6", "#f4f1ea"], ["Lobster Roll", "bread", "#dcc39a", "#d49d93"],
    ["Seafood Paella", "pan", "#e2c98e", "#c98f8f"], ["Silver Pearl Oysters", "shells", "#b9bfc6", "#ffffff"], ["Moonlight Bouillabaisse", "bowl", "#c9a58f", "#9fabc2"],
  ]),
  shop("pastry", "Flour Moon", "Pastry shop", "PÂTISSERIE", "Croissants, macarons and strawberry shortcake.", "oven", "#e2d7ad", [
    ["Croissant", "croissant", "#dcc39a", "#b89b73"], ["Cinnamon Roll", "bread", "#cfb08f", "#f1e8d8"], ["Macarons", "macaron", "#d8b6b4", "#b4c3ab"],
    ["Strawberry Shortcake", "cake", "#f3eee6", "#d49d9d"], ["Éclair", "bread", "#8f7563", "#e2d7ad"], ["Mille-feuille", "cake", "#e7dcc4", "#c6bed4"],
    ["Lemon Tart", "pan", "#e8dc9e", "#f6f0dc"], ["Silver Soufflé", "tall", "#dcd6cc", "#ffffff"], ["Moonlight Mont Blanc", "cake", "#b3a08b", "#9fabc2"],
  ]),
  shop("burger", "Patty Friends", "Burger diner", "DINER", "Smash burgers, onion rings and thick shakes.", "grill", "#d9a79c", [
    ["Fries", "fries", "#e2cf98", "#c98f8f"], ["Milkshake", "tall", "#e8cfd0", "#f6eeee"], ["Classic Burger", "burger", "#b98d6c", "#b4c3ab"],
    ["Cheeseburger", "burger", "#b98d6c", "#e6cd7a"], ["Onion Rings", "shells", "#d9bd8a", "#f1e3c2"], ["Double Stack", "burger", "#8f6a52", "#e6cd7a"],
    ["Friend Deluxe", "burger", "#a07a5e", "#c98f8f"], ["Silver Smash", "burger", "#9fa6ad", "#ffffff"], ["Moonlight Melt", "burger", "#8a93a8", "#e9e3c4"],
  ]),
  shop("asian", "Lantern Noodle House", "Asian kitchen", "NOODLES", "Ramen, gyoza, sushi and steamed bao.", "steamer", "#b4c3ab", [
    ["Green Tea", "cup", "#a9b99a", "#eef1e6"], ["Gyoza", "dumplings", "#e8dcc2", "#b89b73"], ["Onigiri", "rice", "#f6f3ec", "#3b3a38"],
    ["Miso Ramen", "noodles", "#d9c28f", "#c98f8f"], ["Sushi Set", "sushi", "#f3eee6", "#d8a79c"], ["Bao Buns", "dumplings", "#f4efe6", "#b4c3ab"],
    ["Katsu Curry", "plate", "#c9a26f", "#e2cf98"], ["Silver Tempura Udon", "noodles", "#c9ccd0", "#ffffff"], ["Moonlight Bento", "rice", "#9fabc2", "#e9e3c4"],
  ]),
];
export const shopById = (id: ShopId) => SHOPS.find(item => item.id === id)!;
export const dishById = (id: DishId) => shopById(id.split(":")[0] as ShopId).menu[Number(id.split(":")[1])];

/** XP needed to reach level n + 2 (index 0 is level 2). */
export const LEVEL_XP = [15, 40, 75, 120, 180, 255, 345, 450, 575, 720, 885, 1070, 1275, 1500] as const;
export const MAX_LEVEL = LEVEL_XP.length + 1;

export const MACHINE_COSTS = [70, 150, 260, 420, 650] as const;
/** Each kitchen station level cuts cook time 12%. */
export const machineFactor = (level: number) => 1 - 0.12 * level;
/** A day lasts five minutes. */
export const DAY_LENGTH = 300;
/** Tips: up to this share of the price for a guest served with full patience. */
export const TIP_RATE = 0.2;
export const ORDER_PATIENCE = 18;
export const FOOD_PATIENCE = 34;
export const EAT_TIME = 4;

// ---------- Staff ----------
export const START_STAFF_SLOTS = 1;
export const MAX_STAFF_SLOTS = 5;
/** Cost and café level for staff slot number (index + 2). */
export const STAFF_SLOT_COSTS = [120, 280, 520, 900] as const;
export const STAFF_SLOT_LEVELS = [2, 4, 6, 9] as const;
export type StaffRoleInfo = Readonly<{ id: "waiter" | "chef" | "promoter"; name: string; text: string }>;
export const STAFF_ROLES: readonly StaffRoleInfo[] = [
  { id: "waiter", name: "Waiter", text: "Takes orders and delivers dishes." },
  { id: "chef", name: "Chef", text: "Cooks in the kitchen: +1 dish at a time, and faster." },
  { id: "promoter", name: "Promoter", text: "Works the street and brings passers-by in." },
];
/**
 * Worker tier from the Friend's on-chain Generations generation: Gen 1 is the highest tier, Gen 6 the lowest.
 * Guest applicants (not your NFTs) rank below Gen 6.
 */
export const GENERATION_TIERS: Readonly<Record<number, { name: string; power: number }>> = {
  1: { name: "Gen 1 · Legendary", power: 1.3 }, 2: { name: "Gen 2 · Epic", power: 1.25 }, 3: { name: "Gen 3 · Rare", power: 1.2 },
  4: { name: "Gen 4 · Uncommon", power: 1.15 }, 5: { name: "Gen 5 · Common", power: 1.1 }, 6: { name: "Gen 6 · Rookie", power: 1.05 },
};
export const GUEST_TIER = { name: "Guest applicant", power: 1 } as const;
export const tierOf = (generation: number | null) => generation === null ? GUEST_TIER : GENERATION_TIERS[Math.min(6, Math.max(1, generation))];
/** Worker XP (one per task, dish or guest brought in) needed for levels 2–10. Each level adds 4% to the worker's power. */
export const WORKER_LEVEL_XP = [10, 25, 45, 70, 100, 140, 190, 250, 320] as const;
export const workerLevel = (xp: number) => 1 + WORKER_LEVEL_XP.filter(need => xp >= need).length;
/** Each worker level past the first earns one attribute point; each attribute takes up to MAX_STAT points. */
export type StatId = "speed" | "stamina" | "skill";
export const MAX_STAT = 5;
export const WORKER_STATS: readonly { id: StatId; name: string; text: string }[] = [
  { id: "speed", name: "Speed", text: "+6% walking speed per point." },
  { id: "stamina", name: "Stamina", text: "Tires 8% slower per point." },
  { id: "skill", name: "Skill", text: "Chefs cook 4% faster, waiters earn +3% tips, promoters pull 8% harder, per point." },
];
/** Fatigue 0–100. Tired at 70 (slower); exhausted at 100 (stops working until rested). */
export const FATIGUE = { tired: 70, exhausted: 100, perTask: 4, perDish: 3, promoterPerSecond: 0.3, levelRelief: 0.04 } as const;
/** A break takes 15 s rested, up to 30 s exhausted. */
export const breakSeconds = (fatigue: number) => 15 + 15 * Math.min(1, Math.max(0, fatigue) / 100);

// ---------- Street and expansion ----------
/** A Friend walks past on the street about every 1.6 s; this share of them step in (more with promoters and ambience). */
export const PASSERBY_INTERVAL = 1.6;
export const BASE_WALK_IN = 0.34;
export const PROMOTER_PULL = 0.12;
/** Expanding adds 2 tiles to each side of the shop. */
export const EXPAND_COSTS = [400, 900, 1600] as const;
export const EXPAND_LEVELS = [4, 7, 10] as const;

// ---------- Shop upgrades ----------
export type UpgradeId = "sign" | "shoes" | "chairs" | "tipjar" | "breakroom" | "dishwasher" | "plating" | "tray";
/** Beans upgrades bought one level at a time; `levels` is the café level each step needs. */
export type Upgrade = Readonly<{ id: UpgradeId; name: string; text: string; costs: readonly number[]; levels: readonly number[] }>;
export const UPGRADES: readonly Upgrade[] = [
  { id: "sign", name: "Window sign", text: "+6% walk-ins per level.", costs: [90, 240, 520], levels: [2, 5, 8] },
  { id: "shoes", name: "Running shoes", text: "You walk 8% faster per level.", costs: [110, 300], levels: [2, 6] },
  { id: "chairs", name: "Comfy cushions", text: "Guests wait 8% longer per level.", costs: [140, 340, 700], levels: [3, 6, 9] },
  { id: "tipjar", name: "Tip jar", text: "+5% tips per level.", costs: [160, 380, 780], levels: [3, 6, 10] },
  { id: "breakroom", name: "Break-room coffee", text: "Staff tire 12% slower and rest 20% faster per level.", costs: [200, 480], levels: [4, 8] },
  { id: "dishwasher", name: "Dishwasher", text: "Guests finish eating 20% sooner per level, freeing tables.", costs: [240, 560], levels: [4, 8] },
  { id: "plating", name: "Fancy plating", text: "Every dish sells for 6% more per level.", costs: [300, 700, 1400], levels: [5, 9, 12] },
  { id: "tray", name: "Big serving tray", text: "You carry one more dish.", costs: [1000], levels: [11] },
];
export const upgradeById = (id: UpgradeId) => UPGRADES.find(item => item.id === id)!;

// ---------- Build mode ----------
export type ExclusiveId = "luckycat" | "gumball" | "crane" | "jukebox" | "fountain" | "telescope" | "starlamp" | "statue";
export type RugKind = "rug" | "runner" | "roundrug";
export type ItemKind = "table" | "plant" | "lamp" | "shelf" | "record" | "piano" | RugKind
  | "cactus" | "coatrack" | "chalkboard" | "flowers" | "armchair" | "catbed" | "birdcage" | "cakecase" | "sofa" | "clock" | "arcade" | "aquarium" | ExclusiveId;
/**
 * `tier` marks an RF exclusive: collected from Rare Recipe Capsules (0 House Secret … 3 Golden Recipe), then placed for free.
 * Items that don't block are rugs: flat, walkable, and furniture can stand on them.
 */
export type CatalogItem = Readonly<{ kind: ItemKind; name: string; cost: number; ambience: number; blocks: boolean; text: string; tier?: number }>;
export const CATALOG: readonly CatalogItem[] = [
  { kind: "table", name: "Table & chair", cost: 60, ambience: 0, blocks: true, text: "Seats one guest. R / Rotate turns the chair to any side." },
  { kind: "cactus", name: "Little cactus", cost: 25, ambience: 1, blocks: true, text: "+1 ambience" },
  { kind: "plant", name: "Potted monstera", cost: 35, ambience: 1, blocks: true, text: "+1 ambience" },
  { kind: "coatrack", name: "Coat rack", cost: 40, ambience: 1, blocks: true, text: "+1 ambience" },
  { kind: "rug", name: "Faded rose rug", cost: 45, ambience: 1, blocks: false, text: "+1 ambience · walk over it" },
  { kind: "chalkboard", name: "A-frame menu board", cost: 55, ambience: 1, blocks: true, text: "+1 ambience · MENU on the front, OPEN on the back" },
  { kind: "runner", name: "Sage runner", cost: 55, ambience: 1, blocks: false, text: "+1 ambience · walk over it" },
  { kind: "flowers", name: "Flower stand", cost: 65, ambience: 1, blocks: true, text: "+1 ambience" },
  { kind: "lamp", name: "Paper floor lamp", cost: 70, ambience: 2, blocks: true, text: "+2 ambience" },
  { kind: "roundrug", name: "Braided round rug", cost: 80, ambience: 2, blocks: false, text: "+2 ambience · walk over it" },
  { kind: "shelf", name: "Bookshelf", cost: 90, ambience: 2, blocks: true, text: "+2 ambience" },
  { kind: "armchair", name: "Velvet armchair", cost: 110, ambience: 2, blocks: true, text: "+2 ambience" },
  { kind: "catbed", name: "Sleepy cat", cost: 130, ambience: 2, blocks: true, text: "+2 ambience · a cat asleep in its basket" },
  { kind: "birdcage", name: "Birdcage", cost: 140, ambience: 2, blocks: true, text: "+2 ambience · a butter-yellow canary" },
  { kind: "record", name: "Record player", cost: 150, ambience: 3, blocks: true, text: "+3 ambience" },
  { kind: "cakecase", name: "Cake display", cost: 160, ambience: 3, blocks: true, text: "+3 ambience" },
  { kind: "sofa", name: "Lavender loveseat", cost: 180, ambience: 3, blocks: true, text: "+3 ambience" },
  { kind: "clock", name: "Grandfather clock", cost: 200, ambience: 3, blocks: true, text: "+3 ambience · its pendulum swings" },
  { kind: "arcade", name: "Arcade cabinet", cost: 220, ambience: 3, blocks: true, text: "+3 ambience" },
  { kind: "aquarium", name: "Fish tank", cost: 240, ambience: 4, blocks: true, text: "+4 ambience" },
  { kind: "piano", name: "Upright piano", cost: 260, ambience: 4, blocks: true, text: "+4 ambience" },
  // RF exclusives: only from Rare Recipe Capsules. Each can be placed once, for free.
  { kind: "luckycat", name: "Lucky Cat", cost: 0, ambience: 3, blocks: true, text: "RF exclusive · waves in guests", tier: 0 },
  { kind: "gumball", name: "Gumball Machine", cost: 0, ambience: 3, blocks: true, text: "RF exclusive · faded pastel gumballs", tier: 0 },
  { kind: "crane", name: "Paper Crane Stand", cost: 0, ambience: 3, blocks: true, text: "RF exclusive · a flock of paper cranes", tier: 0 },
  { kind: "jukebox", name: "Chrome Jukebox", cost: 0, ambience: 4, blocks: true, text: "RF exclusive · unlocks the track Neon Nights", tier: 1 },
  { kind: "fountain", name: "Silver Fountain", cost: 0, ambience: 4, blocks: true, text: "RF exclusive · a trickling silver fountain", tier: 1 },
  { kind: "telescope", name: "Moon Telescope", cost: 0, ambience: 5, blocks: true, text: "RF exclusive · unlocks the track Midnight Moon", tier: 2 },
  { kind: "starlamp", name: "Star Lamp", cost: 0, ambience: 5, blocks: true, text: "RF exclusive · soft starlight", tier: 2 },
  { kind: "statue", name: "Golden Friend Statue", cost: 0, ambience: 8, blocks: true, text: "RF exclusive · your manager, in gold", tier: 3 },
];
export const EXCLUSIVES = CATALOG.filter(item => item.tier !== undefined);
/** Beans given for a duplicate exclusive, by capsule tier. */
export const DUPLICATE_BEANS = [40, 80, 160, 400] as const;
export const catalogItem = (kind: ItemKind) => CATALOG.find(item => item.kind === kind)!;
export const isRug = (kind: ItemKind) => !catalogItem(kind).blocks;
export const START_TABLES = 3;
/** Most tables allowed at a shop level (more room after expanding helps fit them). */
export const tableLimit = (level: number) => Math.min(16, START_TABLES + level);
export const SELL_REFUND = 0.5;

export type Finish = Readonly<{ id: string; name: string; cost: number; ambience: number; colors: readonly string[] }>;
export const WALLPAPERS: readonly Finish[] = [
  { id: "plain", name: "Plain plaster", cost: 0, ambience: 0, colors: ["#c3c0b8", "#d3d0c9"] },
  { id: "stripes", name: "Faded stripes", cost: 60, ambience: 1, colors: ["#cfc6c2", "#e0d8d3"] },
  { id: "gingham", name: "Sage gingham", cost: 70, ambience: 1, colors: ["#c9d1c3", "#d8ded3"] },
  { id: "dots", name: "Polka dots", cost: 90, ambience: 1, colors: ["#c7ccc2", "#d9ddd4"] },
  { id: "subway", name: "Subway tile", cost: 110, ambience: 1, colors: ["#d6d6d2", "#e4e4e0"] },
  { id: "brick", name: "White brick", cost: 140, ambience: 2, colors: ["#cdc8c0", "#dcd8d1"] },
  { id: "floral", name: "Butter florals", cost: 150, ambience: 2, colors: ["#d8d2bd", "#e5dfcb"] },
  { id: "panel", name: "Wood panelling", cost: 180, ambience: 2, colors: ["#b8a690", "#c9b8a2"] },
  { id: "chevron", name: "Lavender chevron", cost: 200, ambience: 2, colors: ["#c7c1d2", "#d6d1df"] },
  { id: "damask", name: "Dusty-blue damask", cost: 240, ambience: 3, colors: ["#b3bcc6", "#c4ccd4"] },
  { id: "scallop", name: "Rose scallops", cost: 280, ambience: 3, colors: ["#d6c1bf", "#e3d2d0"] },
  { id: "starry", name: "Starry night", cost: 340, ambience: 4, colors: ["#4e5566", "#5c6477"] },
];
export const FLOORS: readonly Finish[] = [
  { id: "checker", name: "Grey checker", cost: 0, ambience: 0, colors: ["#dedbd3", "#cfccc4"] },
  { id: "strawberry", name: "Strawberry checker", cost: 70, ambience: 1, colors: ["#e6d3d1", "#f3eee8"] },
  { id: "planks", name: "Oak planks", cost: 80, ambience: 1, colors: ["#d6c7b2", "#c9b9a2"] },
  { id: "tatami", name: "Tatami mats", cost: 110, ambience: 1, colors: ["#d9d3a9", "#cfc79b"] },
  { id: "hex", name: "Sage hex tiles", cost: 120, ambience: 1, colors: ["#cdd5c6", "#bcc6b4"] },
  { id: "slate", name: "Slate flagstones", cost: 140, ambience: 2, colors: ["#b9bbbb", "#a9abab"] },
  { id: "terrazzo", name: "Terrazzo", cost: 150, ambience: 2, colors: ["#e3e0da", "#d6d2cb"] },
  { id: "parquet", name: "Parquet squares", cost: 170, ambience: 2, colors: ["#c9ae8c", "#b8997a"] },
  { id: "herringbone", name: "Herringbone", cost: 190, ambience: 2, colors: ["#cbb79d", "#b9a58b"] },
  { id: "carpet", name: "Lavender carpet", cost: 210, ambience: 2, colors: ["#cbc3d6", "#c0b7cc"] },
  { id: "marble", name: "Rose marble", cost: 260, ambience: 3, colors: ["#e6dcda", "#d8cbc8"] },
  { id: "mosaic", name: "Blue mosaic", cost: 300, ambience: 4, colors: ["#c3cdd8", "#dde3e9"] },
];
/** Ambience points needed for ambience levels 1–5 (raises tips, patience and arrivals). */
export const AMBIENCE_LEVELS = [2, 5, 9, 14, 20] as const;

export type FamilyPerk = Readonly<{ title: string; text: string }>;
/** Indexed by Generations family ID (Skeleton … Hollow). */
export const FAMILY_PERKS: readonly FamilyPerk[] = [
  { title: "Bare-bones kitchen", text: "Dishes cook 15% faster." },
  { title: "Mysterious charm", text: "Guests tip 10% more." },
  { title: "Family business", text: "Staff helpers move 25% faster." },
  { title: "Multitasker", text: "Carry one extra dish at a time." },
  { title: "Happy accidents", text: "12% chance a guest pays double." },
  { title: "Floats between tables", text: "You move 30% faster." },
  { title: "Calming presence", text: "Guests are 25% more patient." },
  { title: "Dazzling", text: "Rating starts half a star higher." },
  { title: "Echoing welcome", text: "Guests arrive 15% more often." },
];

/** Shop bonuses while a capsule recipe is kept (outcome order matches game.json). Redeeming trades the bonus for RF. */
export const BLEND_BONUSES = [
  { name: "House Secret", text: "+3% tips per recipe kept (up to 5)." },
  { name: "Silver Recipe", text: "Unlocks your shop's silver special (60 Beans)." },
  { name: "Moonlight Recipe", text: "Unlocks your shop's moonlight special (95 Beans); guests +10% patient." },
  { name: "Golden Recipe", text: "Genesis VIP guests visit and pay 3×." },
] as const;

export const GUEST_NAMES = ["Mochi", "Pip", "Nori", "Tofu", "Yuzu", "Kumo", "Bun", "Miso", "Suki", "Hana", "Azuki", "Kiki",
  "Momo", "Taro", "Ume", "Sora", "Riku", "Nana", "Koko", "Toto", "Mimi", "Pudding", "Dango", "Chai"] as const;

export const FAMILY_NAMES = ["Skeleton", "Mask", "Family", "Cellular", "Asymmetry", "Hoverer", "Colossus", "Sparkling", "Hollow"] as const;
