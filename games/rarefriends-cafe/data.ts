/** Static café rules. Beans are an in-café soft currency; only Rare Blend Capsules touch (simulated) RF. */

export type DishId = "espresso" | "latte" | "matcha" | "mochi" | "pancakes" | "omurice" | "parfait" | "silver" | "moonlight";
export type Dish = Readonly<{
  id: DishId; name: string; price: number; cook: number; unlockCost: number; level: number;
  /** Held capsule blend (outcome index) required instead of a Beans unlock. */
  blend?: number; color: string; accent: string;
}>;

export const DISHES: readonly Dish[] = [
  { id: "espresso", name: "Espresso", price: 8, cook: 3, unlockCost: 0, level: 1, color: "#6f6a64", accent: "#e8e4dc" },
  { id: "latte", name: "Latte ♡", price: 12, cook: 4, unlockCost: 0, level: 1, color: "#b8a894", accent: "#f4efe6" },
  { id: "matcha", name: "Matcha Latte", price: 16, cook: 5, unlockCost: 60, level: 2, color: "#a9b99a", accent: "#eef1e6" },
  { id: "mochi", name: "Strawberry Mochi", price: 20, cook: 6, unlockCost: 120, level: 3, color: "#d9b3b3", accent: "#f6ecec" },
  { id: "pancakes", name: "Fluffy Pancakes", price: 28, cook: 8, unlockCost: 200, level: 4, color: "#dccb9c", accent: "#f7f1de" },
  { id: "omurice", name: "Omurice (ketchup heart)", price: 40, cook: 10, unlockCost: 350, level: 5, color: "#e2d49e", accent: "#c98f8f" },
  { id: "parfait", name: "Cloud Parfait", price: 50, cook: 9, unlockCost: 500, level: 6, color: "#c5bdd6", accent: "#f3f0f8" },
  { id: "silver", name: "Silver Latte", price: 60, cook: 6, unlockCost: 0, level: 1, blend: 1, color: "#b9bfc6", accent: "#ffffff" },
  { id: "moonlight", name: "Moonlight Parfait", price: 95, cook: 11, unlockCost: 0, level: 1, blend: 2, color: "#9fabc2", accent: "#e9e3c4" },
];
export const dishById = (id: DishId) => DISHES.find(dish => dish.id === id)!;

/** XP needed to reach level n + 2 (index 0 is level 2). */
export const LEVEL_XP = [8, 22, 40, 64, 95, 135, 185, 250, 330, 430] as const;
export const MAX_LEVEL = LEVEL_XP.length + 1;

export const MAX_TABLES = 8;
export const START_TABLES = 3;
/** Cost of table number (index + START_TABLES + 1). */
export const TABLE_COSTS = [45, 90, 160, 250, 380] as const;
export const MACHINE_COSTS = [70, 150, 260, 420, 650] as const;
export const DECOR_COSTS = [90, 200, 360, 600, 950] as const;
export const DECOR_NAMES = ["Bare walls", "Potted monstera", "Faded rose rug", "Paper lanterns", "Record player", "Moon chandelier"] as const;
export const WAITER_COSTS = [140, 380] as const;
export const CHEF_COSTS = [220, 520] as const;

/** Each espresso machine level cuts cook time 12%. */
export const machineFactor = (level: number) => 1 - 0.12 * level;
export const DAY_LENGTH = 150;
export const ORDER_PATIENCE = 18;
export const FOOD_PATIENCE = 34;
export const EAT_TIME = 4;

export type FamilyPerk = Readonly<{ title: string; text: string }>;
/** Indexed by Generations family ID (Skeleton … Hollow). */
export const FAMILY_PERKS: readonly FamilyPerk[] = [
  { title: "Bare-bones kitchen", text: "Dishes cook 15% faster." },
  { title: "Mysterious charm", text: "Guests tip 10% more." },
  { title: "Family business", text: "Hired helpers move 25% faster." },
  { title: "Multitasker", text: "Carry one extra dish at a time." },
  { title: "Happy accidents", text: "12% chance a guest pays double." },
  { title: "Floats between tables", text: "You move 30% faster." },
  { title: "Calming presence", text: "Guests are 25% more patient." },
  { title: "Dazzling", text: "Café rating starts half a star higher." },
  { title: "Echoing welcome", text: "Guests arrive 15% more often." },
];

/** Café bonuses while a capsule blend is kept (outcome order matches game.json). Redeeming trades the bonus for RF. */
export const BLEND_BONUSES = [
  { name: "House Blend", text: "+3% tips per bag kept (up to 5)." },
  { name: "Silver Roast", text: "Unlocks the Silver Latte special (60 Beans)." },
  { name: "Moonlight Roast", text: "Unlocks the Moonlight Parfait (95 Beans); guests +10% patient." },
  { name: "Golden Bean", text: "Genesis VIP guests visit and pay 3×." },
] as const;

export const GUEST_NAMES = ["Mochi", "Pip", "Nori", "Tofu", "Yuzu", "Kumo", "Bun", "Miso", "Suki", "Hana", "Azuki", "Kiki",
  "Momo", "Taro", "Ume", "Sora", "Riku", "Nana", "Koko", "Toto", "Mimi", "Pudding", "Dango", "Chai"] as const;

export const FAMILY_NAMES = ["Skeleton", "Mask", "Family", "Cellular", "Asymmetry", "Hoverer", "Colossus", "Sparkling", "Hollow"] as const;
