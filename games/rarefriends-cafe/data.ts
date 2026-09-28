/** Static rules. Beans are an in-shop soft currency; only Rare Recipe Capsules touch (simulated) RF. */

export type ShopId = "cafe" | "seafood" | "pastry" | "burger" | "asian";
export type DishShape =
  | "cup" | "latte" | "tall" | "bowl" | "noodles" | "plate" | "fish" | "fries" | "skewer" | "dumplings" | "sushi"
  | "burger" | "bread" | "croissant" | "cake" | "macaron" | "shells" | "pan" | "rice" | "mochi" | "pancakes" | "omurice" | "parfait";
/** A dish id is `<shop>:<menu index>`; indexes 7 and 8 are the capsule specials, 9–11 the late-game signatures, 12–18 the master menu. */
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
  // Late-game signatures.
  { price: 38, cook: 11, unlockCost: 900, level: 11 }, { price: 48, cook: 12, unlockCost: 1500, level: 13 }, { price: 62, cook: 14, unlockCost: 2400, level: 15 },
  // The master menu: one dish a level from 16 to 22, each a long save.
  { price: 72, cook: 15, unlockCost: 3400, level: 16 }, { price: 84, cook: 16, unlockCost: 4600, level: 17 }, { price: 96, cook: 17, unlockCost: 6000, level: 18 },
  { price: 110, cook: 18, unlockCost: 7800, level: 19 }, { price: 126, cook: 19, unlockCost: 10000, level: 20 }, { price: 145, cook: 20, unlockCost: 13000, level: 21 },
  { price: 170, cook: 22, unlockCost: 17000, level: 22 },
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
    ["Honey Butter Toast", "bread", "#e2c98e", "#f6f0dc"], ["Strawberry Crêpe Cake", "cake", "#f3e4e2", "#d49d9d"], ["Latte Art Flight", "latte", "#c9b08f", "#f7f5f0"],
    ["Affogato", "tall", "#e9e3d4", "#6f6a64"], ["Tiramisu", "cake", "#d9c7a6", "#6f5a4c"], ["Soufflé Pancake Tower", "pancakes", "#efe3bd", "#d49d9d"],
    ["Black Sesame Parfait", "parfait", "#8a8680", "#f3f0f8"], ["Truffle Omurice", "omurice", "#e8d9a4", "#6f5a4c"], ["Gold-Leaf Mocha", "latte", "#8f7563", "#e2d49e"],
    ["Friendship High Tea", "cake", "#f1e3e2", "#c6bed4"],
  ]),
  shop("seafood", "Tide & Shell", "Seafood restaurant", "SEAFOOD", "Chowder, fish & chips and a lobster roll by the window.", "tank", "#afbccb", [
    ["Clam Chowder", "bowl", "#e8e1cf", "#b8a894"], ["Fish & Chips", "fish", "#dccb9c", "#e2d7ad"], ["Grilled Squid", "skewer", "#d9c3b0", "#8f8a84"],
    ["Shrimp Tempura", "fries", "#e2cfa0", "#d8a79c"], ["Oyster Plate", "shells", "#cfd3d6", "#f4f1ea"], ["Lobster Roll", "bread", "#dcc39a", "#d49d93"],
    ["Seafood Paella", "pan", "#e2c98e", "#c98f8f"], ["Silver Pearl Oysters", "shells", "#b9bfc6", "#ffffff"], ["Moonlight Bouillabaisse", "bowl", "#c9a58f", "#9fabc2"],
    ["Grilled Lobster", "fish", "#d49d93", "#e2cf98"], ["Crab Pot", "pan", "#d9a79c", "#f1e3c2"], ["Grand Seafood Tower", "shells", "#cfd3d6", "#d49d93"],
    ["Scallop Carpaccio", "shells", "#f1e8dc", "#b4c3ab"], ["Seared Tuna Steak", "fish", "#b97f7a", "#e8e1cf"], ["Uni Risotto", "rice", "#ecd9a8", "#d9a36f"],
    ["Lobster Thermidor", "fish", "#dba08f", "#f1e3c2"], ["King Crab Legs", "skewer", "#d98f7f", "#f4efe6"], ["Caviar Blini", "bread", "#e8dcc2", "#3b3a38"],
    ["Ocean Grand Platter", "shells", "#b9c7d4", "#d49d93"],
  ]),
  shop("pastry", "Flour Moon", "Pastry shop", "PÂTISSERIE", "Croissants, macarons and strawberry shortcake.", "oven", "#e2d7ad", [
    ["Croissant", "croissant", "#dcc39a", "#b89b73"], ["Cinnamon Roll", "bread", "#cfb08f", "#f1e8d8"], ["Macarons", "macaron", "#d8b6b4", "#b4c3ab"],
    ["Strawberry Shortcake", "cake", "#f3eee6", "#d49d9d"], ["Éclair", "bread", "#8f7563", "#e2d7ad"], ["Mille-feuille", "cake", "#e7dcc4", "#c6bed4"],
    ["Lemon Tart", "pan", "#e8dc9e", "#f6f0dc"], ["Silver Soufflé", "tall", "#dcd6cc", "#ffffff"], ["Moonlight Mont Blanc", "cake", "#b3a08b", "#9fabc2"],
    ["Opera Cake", "cake", "#6f5a4c", "#e2d49e"], ["Macaron Tower", "macaron", "#c6bed4", "#e8cfd0"], ["Gold-Leaf Éclair", "bread", "#8f7563", "#e2d49e"],
    ["Kouign-amann", "croissant", "#c9a26f", "#e2d49e"], ["Paris-Brest", "bread", "#d9bd8a", "#f1e8d8"], ["Saint-Honoré", "cake", "#f3eee6", "#d9bd8a"],
    ["Chocolate Soufflé", "tall", "#6f5a4c", "#f3eee6"], ["Fraisier", "cake", "#f1e3e2", "#c98f8f"], ["Croquembouche", "macaron", "#dcc39a", "#f6f0dc"],
    ["Moon Palace Pièce Montée", "cake", "#e9e3c4", "#9fabc2"],
  ]),
  shop("burger", "Patty Friends", "Burger diner", "DINER", "Smash burgers, onion rings and thick shakes.", "grill", "#d9a79c", [
    ["Fries", "fries", "#e2cf98", "#c98f8f"], ["Milkshake", "tall", "#e8cfd0", "#f6eeee"], ["Classic Burger", "burger", "#b98d6c", "#b4c3ab"],
    ["Cheeseburger", "burger", "#b98d6c", "#e6cd7a"], ["Onion Rings", "shells", "#d9bd8a", "#f1e3c2"], ["Double Stack", "burger", "#8f6a52", "#e6cd7a"],
    ["Friend Deluxe", "burger", "#a07a5e", "#c98f8f"], ["Silver Smash", "burger", "#9fa6ad", "#ffffff"], ["Moonlight Melt", "burger", "#8a93a8", "#e9e3c4"],
    ["Loaded Nachos", "fries", "#e2cf98", "#b4c3ab"], ["Truffle Burger", "burger", "#6f5a4c", "#e2d7ad"], ["Tower of Friendship", "burger", "#8f6a52", "#c6bed4"],
    ["Chili Cheese Fries", "fries", "#e6cd7a", "#c98f8f"], ["Wagyu Burger", "burger", "#7a5a48", "#e8dcc2"], ["Lobster Slider Trio", "burger", "#d49d93", "#f4efe6"],
    ["Triple Truffle Shake", "tall", "#b8a894", "#f6eeee"], ["BBQ Brisket Stack", "burger", "#6f4f3f", "#d9a36f"], ["Onion Ring Tower", "shells", "#d9bd8a", "#b89b73"],
    ["Golden Friend Burger", "burger", "#b98d6c", "#e2d49e"],
  ]),
  shop("asian", "Lantern Noodle House", "Asian kitchen", "NOODLES", "Ramen, gyoza, sushi and steamed bao.", "steamer", "#b4c3ab", [
    ["Green Tea", "cup", "#a9b99a", "#eef1e6"], ["Gyoza", "dumplings", "#e8dcc2", "#b89b73"], ["Onigiri", "rice", "#f6f3ec", "#3b3a38"],
    ["Miso Ramen", "noodles", "#d9c28f", "#c98f8f"], ["Sushi Set", "sushi", "#f3eee6", "#d8a79c"], ["Bao Buns", "dumplings", "#f4efe6", "#b4c3ab"],
    ["Katsu Curry", "plate", "#c9a26f", "#e2cf98"], ["Silver Tempura Udon", "noodles", "#c9ccd0", "#ffffff"], ["Moonlight Bento", "rice", "#9fabc2", "#e9e3c4"],
    ["Peking Duck", "plate", "#b98d6c", "#e8dcc2"], ["Omakase Box", "sushi", "#f3eee6", "#c98f8f"], ["Dragon Ramen", "noodles", "#d9a79c", "#c98f8f"],
    ["Tonkotsu Ramen", "noodles", "#efe6d0", "#6f5a4c"], ["Xiao Long Bao", "dumplings", "#f4efe6", "#d9c28f"], ["Unagi Don", "rice", "#8f6a52", "#e2cf98"],
    ["Wagyu Hot Pot", "bowl", "#c9785f", "#e8dcc2"], ["Lobster Dim Sum", "dumplings", "#f1d9d2", "#d49d93"], ["Toro Nigiri Flight", "sushi", "#e8c3bd", "#3b3a38"],
    ["Imperial Banquet", "plate", "#c98f8f", "#e2d49e"],
  ]),
];
export const shopById = (id: ShopId) => SHOPS.find(item => item.id === id)!;
export const dishById = (id: DishId) => shopById(id.split(":")[0] as ShopId).menu[Number(id.split(":")[1])];

/** XP needed to reach level n + 2 (index 0 is level 2). */
export const LEVEL_XP = [15, 40, 75, 120, 180, 255, 345, 450, 575, 720, 885, 1070, 1275, 1500, 1750, 2030, 2340, 2685, 3065, 3485, 3945] as const;
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
export const MAX_STAFF_SLOTS = 10;
/** Cost and café level for staff slot number (index + 2). */
export const STAFF_SLOT_COSTS = [120, 280, 520, 900, 1300, 1800, 2400, 3100, 4000] as const;
export const STAFF_SLOT_LEVELS = [2, 4, 6, 9, 10, 11, 12, 13, 14] as const;
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
/** Ten expansions, each one tile longer on both sides and one more staff slot (up to the maximum). */
export const EXPAND_COSTS = [300, 500, 750, 1000, 1300, 1650, 2050, 2500, 3000, 3600] as const;
export const EXPAND_LEVELS = [3, 4, 5, 6, 7, 8, 9, 10, 12, 14] as const;

// ---------- Shop upgrades ----------
export type UpgradeId = "sign" | "shoes" | "chairs" | "tipjar" | "breakroom" | "dishwasher" | "plating" | "tray" | "training" | "chefhat" | "neon" | "station" | "pass";
/** Beans upgrades bought one level at a time; `levels` is the café level each step needs. */
export type Upgrade = Readonly<{ id: UpgradeId; name: string; text: string; costs: readonly number[]; levels: readonly number[] }>;
export const UPGRADES: readonly Upgrade[] = [
  { id: "sign", name: "Window sign", text: "+6% walk-ins per level.", costs: [90, 300, 1000], levels: [2, 5, 8] },
  { id: "shoes", name: "Running shoes", text: "You walk 8% faster per level.", costs: [110, 300], levels: [2, 6] },
  { id: "chairs", name: "Comfy cushions", text: "Guests wait 8% longer per level.", costs: [140, 450, 1300], levels: [3, 6, 9] },
  { id: "tipjar", name: "Tip jar", text: "+5% tips per level.", costs: [160, 500, 1500], levels: [3, 6, 10] },
  { id: "breakroom", name: "Break-room coffee", text: "Staff tire 12% slower and rest 20% faster per level.", costs: [200, 480], levels: [4, 8] },
  { id: "dishwasher", name: "Dishwasher", text: "Guests finish eating 20% sooner per level, freeing tables.", costs: [240, 560], levels: [4, 8] },
  { id: "plating", name: "Fancy plating", text: "Every dish sells for 6% more per level.", costs: [300, 900, 2400], levels: [5, 9, 12] },
  { id: "tray", name: "Big serving tray", text: "You carry one more dish.", costs: [2500], levels: [11] },
  { id: "pass", name: "Second pass", text: "A second serving spot on the counter: chefs plate and staff pick up at either, so dishes get out faster. Between days.", costs: [1200], levels: [8] },
  // Late game.
  { id: "training", name: "Staff training", text: "Staff move 5% faster per level.", costs: [700, 1600, 3200], levels: [7, 10, 13] },
  { id: "chefhat", name: "Chef's hats", text: "Dishes cook 6% faster per level.", costs: [900, 2000, 4000], levels: [8, 11, 14] },
  { id: "neon", name: "Neon storefront", text: "+10% walk-ins per level.", costs: [1400, 3200], levels: [10, 14] },
  { id: "station", name: "Second station", text: "One more dish cooks at a time, per level.", costs: [2800, 6000], levels: [12, 15] },
];
export const upgradeById = (id: UpgradeId) => UPGRADES.find(item => item.id === id)!;

// ---------- Manager skills ----------
/** Every café level past the first gives your manager one skill point. */
export type SkillId = "quick" | "hands" | "charm" | "service" | "leader" | "calm";
export const MANAGER_SKILLS: readonly { id: SkillId; name: string; text: string; max: number }[] = [
  { id: "quick", name: "Quick feet", text: "You walk 8% faster per point.", max: 3 },
  { id: "hands", name: "Steady hands", text: "Carry one more dish per point.", max: 2 },
  { id: "service", name: "Snappy service", text: "Taking orders and serving take 20% less time per point.", max: 2 },
  { id: "charm", name: "Charm", text: "+4% tips on dishes you serve yourself, per point.", max: 3 },
  { id: "calm", name: "Calm presence", text: "Guests wait 5% longer per point.", max: 3 },
  { id: "leader", name: "Leadership", text: "Staff move 5% faster and tire 5% slower per point.", max: 3 },
];

// ---------- RF boosts ----------
/**
 * Boosts are paid with Rare Capsules (bought with RF through the SDK). The capsules still open and settle into recipes as
 * usual, but give the boost instead of a collectible or duplicate Beans. `days` counts shop days, including one in progress.
 */
export type BoostId = "tireless" | "perfect" | "festival" | "golden";
export const BOOSTS: readonly { id: BoostId; name: string; text: string; capsules: number; days: number }[] = [
  { id: "tireless", name: "Tireless crew", text: "Staff don't tire at all.", capsules: 2, days: 3 },
  { id: "perfect", name: "Perfect service", text: "No guest leaves unhappy: patience never runs out.", capsules: 2, days: 1 },
  { id: "festival", name: "Street festival", text: "Twice as many Friends walk down the street.", capsules: 3, days: 2 },
  { id: "golden", name: "Golden hour", text: "Every dish pays 25% more.", capsules: 3, days: 2 },
];

// ---------- Build mode ----------
export type ExclusiveId = "luckycat" | "gumball" | "crane" | "jukebox" | "fountain" | "telescope" | "starlamp" | "statue";
export type RugKind = "rug" | "runner" | "roundrug";
export type ItemKind = "table" | "tabletwo" | "tablefour" | "plant" | "lamp" | "shelf" | "record" | "piano" | RugKind
  | "candelabra" | "dessertcart" | "grandpiano" | "koipond" | "globe" | "bonsai" | "teddy" | "harp" | "fireplace" | "rfneon" | "carousel" | "cactus" | "coatrack" | "chalkboard" | "flowers" | "armchair" | "catbed" | "birdcage" | "cakecase" | "sofa" | "clock" | "arcade" | "aquarium" | ExclusiveId;
/**
 * `tier` marks an RF exclusive: collected from Rare Recipe Capsules (0 House Secret … 3 Golden Recipe), then placed for free.
 * Items that don't block are rugs: flat, walkable, and furniture can stand on them.
 */
/** `seats` marks a table: 1 (chair on the `dir` side), 2 (opposite sides) or 4 (every side). */
export type CatalogItem = Readonly<{ kind: ItemKind; name: string; cost: number; ambience: number; blocks: boolean; text: string; tier?: number; seats?: number }>;
export const CATALOG: readonly CatalogItem[] = [
  { kind: "table", name: "Table & chair", cost: 60, ambience: 0, blocks: true, seats: 1, text: "Seats one guest. R / Rotate turns the chair to any side." },
  { kind: "tabletwo", name: "Table for two", cost: 110, ambience: 0, blocks: true, seats: 2, text: "Seats a pair across the table; one order for both." },
  { kind: "tablefour", name: "Table for four", cost: 190, ambience: 1, blocks: true, seats: 4, text: "A chair on every side for groups of up to four; one order for the table." },
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
  // Mid-game pieces.
  { kind: "globe", name: "Antique globe", cost: 380, ambience: 3, blocks: true, text: "+3 ambience · it turns, slowly" },
  { kind: "bonsai", name: "Bonsai", cost: 520, ambience: 3, blocks: true, text: "+3 ambience · a patient little tree" },
  { kind: "teddy", name: "Giant teddy bear", cost: 650, ambience: 4, blocks: true, text: "+4 ambience · for hugs" },
  // Luxury pieces for a well-off café.
  { kind: "dessertcart", name: "Dessert trolley", cost: 750, ambience: 4, blocks: true, text: "+4 ambience · three tiers of cakes" },
  { kind: "candelabra", name: "Crystal candelabra", cost: 950, ambience: 5, blocks: true, text: "+5 ambience · twinkling crystals" },
  { kind: "grandpiano", name: "Grand piano", cost: 1600, ambience: 7, blocks: true, text: "+7 ambience · lid up, candles lit" },
  { kind: "koipond", name: "Koi pond", cost: 2200, ambience: 8, blocks: true, text: "+8 ambience · koi circling a lily pad" },
  { kind: "harp", name: "Golden harp", cost: 1100, ambience: 5, blocks: true, text: "+5 ambience" },
  { kind: "fireplace", name: "Stone fireplace", cost: 1300, ambience: 6, blocks: true, text: "+6 ambience · a crackling fire" },
  { kind: "rfneon", name: "Neon RF sign", cost: 1800, ambience: 7, blocks: true, text: "+7 ambience · glows pink" },
  { kind: "carousel", name: "Mini carousel", cost: 2800, ambience: 10, blocks: true, text: "+10 ambience · the centrepiece of a legendary café" },
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
export const isTable = (kind: ItemKind) => (catalogItem(kind).seats ?? 0) > 0;
export const START_TABLES = 3;
/** Most tables allowed at a shop level (more room after expanding helps fit them). */
export const tableLimit = (level: number) => Math.min(100, 5 + 7 * (level - 1));
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
  { id: "damask", name: "Dusty-blue damask", cost: 520, ambience: 3, colors: ["#b3bcc6", "#c4ccd4"] },
  { id: "scallop", name: "Rose scallops", cost: 680, ambience: 3, colors: ["#d6c1bf", "#e3d2d0"] },
  { id: "starry", name: "Starry night", cost: 950, ambience: 4, colors: ["#4e5566", "#5c6477"] },
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
  { id: "marble", name: "Rose marble", cost: 560, ambience: 3, colors: ["#e6dcda", "#d8cbc8"] },
  { id: "mosaic", name: "Blue mosaic", cost: 900, ambience: 4, colors: ["#c3cdd8", "#dde3e9"] },
];
/** Ambience points needed for ambience levels 1–5 (raises tips, patience and arrivals). */
export const AMBIENCE_LEVELS = [3, 8, 15, 24, 36] as const;

// ---------- Outside: the world around the building ----------
/** Sceneries dress the ground beyond the walls and sidewalks. Beans ones are bought outright; RF ones are paid with capsules. */
export type SceneryId = "lot" | "garden" | "park" | "forest" | "beach" | "snow" | "blossom" | "market";
export type Scenery = Readonly<{ id: SceneryId; name: string; text: string; cost: number; capsules?: number; ambience: number }>;
export const SCENERIES: readonly Scenery[] = [
  { id: "lot", name: "Quiet lot", text: "Paving stones, shrubs and a bike rack.", cost: 0, ambience: 0 },
  { id: "garden", name: "Cottage garden", text: "Lawns, a picket fence, flower beds and apple trees.", cost: 1200, ambience: 2 },
  { id: "park", name: "City park", text: "Paths, benches, a duck pond and round trees.", cost: 2600, ambience: 3 },
  { id: "forest", name: "Pine woods", text: "Tall pines, mushrooms and mossy logs.", cost: 4200, ambience: 4 },
  { id: "beach", name: "Seaside", text: "Sand, palms, beach umbrellas and the sea.", cost: 0, capsules: 3, ambience: 4 },
  { id: "snow", name: "Snowy village", text: "Snowy pines, a snowman and lamplit cottages.", cost: 0, capsules: 3, ambience: 4 },
  { id: "blossom", name: "Cherry blossom lane", text: "Pink trees, fallen petals and stone lanterns.", cost: 0, capsules: 4, ambience: 5 },
  { id: "market", name: "Night market", text: "Striped stalls under strings of lanterns.", cost: 0, capsules: 5, ambience: 6 },
];
export const sceneryById = (id: string) => SCENERIES.find(item => item.id === id) ?? SCENERIES[0];

// ---------- Random events ----------
/** Most days, something happens partway through: `duration` 0 means a special guest rather than a timed spell. */
export type EventId = "critic" | "bus" | "rain" | "rush" | "celebrity" | "hiccup";
export const EVENTS: readonly { id: EventId; name: string; icon: string; text: string; duration: number }[] = [
  { id: "critic", name: "Food critic", icon: "✎", text: "A food critic is coming in. Serve them happily for a big rating boost and a ☕ 80 tip.", duration: 0 },
  { id: "celebrity", name: "Celebrity Friend", icon: "★", text: "A famous Friend is on the way! Serve them for ☕ 150 and a rating bump.", duration: 0 },
  { id: "bus", name: "Tour bus", icon: "»", text: "A tour bus stops outside: passers-by come thick and fast for a minute.", duration: 60 },
  { id: "rain", name: "Rain shower", icon: "☂", text: "Rain for 90 s: fewer passers-by, but guests inside are extra patient.", duration: 90 },
  { id: "rush", name: "Lunch rush", icon: "✦", text: "Lunch rush for 90 s: guests tip 20% more.", duration: 90 },
  { id: "hiccup", name: "Kitchen hiccup", icon: "!", text: "The stove sulks: cooking is 25% slower for 45 s.", duration: 45 },
];
export const eventById = (id: EventId) => EVENTS.find(item => item.id === id)!;

// ---------- Daily challenges ----------
/** Three challenges a day, picked from these by the day number; each pays Beans and shop XP when done. */
export type ChallengeId = "served" | "happy" | "beans" | "tips" | "walkIns" | "group" | "perfect" | "rating";
export const CHALLENGES: readonly { id: ChallengeId; text: (target: number) => string; target: (day: number) => number }[] = [
  { id: "served", text: n => `Serve ${n} guests`, target: day => Math.min(60, 10 + day * 2) },
  { id: "happy", text: n => `Serve ${n} happy guests`, target: day => Math.min(45, 6 + day * 2) },
  { id: "beans", text: n => `Earn ☕ ${n} Beans`, target: day => Math.min(1200, 120 + day * 25) },
  { id: "tips", text: n => `Earn ☕ ${n} in tips`, target: day => Math.min(300, 20 + day * 6) },
  { id: "walkIns", text: n => `Welcome ${n} walk-ins`, target: day => Math.min(70, 12 + day * 2) },
  { id: "group", text: n => `Serve ${n} guests at group tables`, target: day => Math.min(30, 4 + day) },
  { id: "perfect", text: () => "No guest leaves unhappy all day", target: () => 1 },
  { id: "rating", text: () => "Close with a ★ 4.5 rating or better", target: () => 1 },
];
export const challengeReward = (day: number) => ({ beans: Math.min(400, 40 + day * 6), xp: 6 });

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
