/** The in-game update log (Settings → What's new), newest first. */
export type Release = Readonly<{ version: string; date: string; title: string; notes: readonly string[] }>;

export const CHANGELOG: readonly Release[] = [
  {
    version: "1.10", date: "2026-09-30", title: "A cosier café, and tables that cost more",
    notes: [
      "The shop floor glows: a warm cast over the whole room, soft pools of light under lamps, candles, the fireplace and the counter, and slanted daylight from every window.",
      "Toward closing time the daylight fades and the lamplight grows, so evenings feel snug.",
      "Every table has a little pendant lamp hanging above it, in the table's colour.",
      "A wooden skirting board and a picture rail on the walls, and soft shade where the floor meets them.",
      "Tables cost more: 100 Beans for a table and chair, 210 for two, 380 for four, and each table past your first three costs 15% more for every table you already have. Selling still refunds half the base price.",
      "The top bar always fits: big numbers shorten (123.4k, 98.7M, with the exact amount on hover), Beans sit over RF, and on a narrow screen the buttons drop their labels instead of sliding off the edge.",
      "Levels come slower: your café (and so your manager's skill points) earns half the XP it did, and staff earn 40%. Nobody loses a level they already have.",
    ],
  },
  {
    version: "1.9", date: "2026-09-30", title: "A polished new look",
    notes: [
      "Every panel, button and menu has a new look: chunky ink edges, soft corners, and keycap buttons that press down.",
      "Pixel-art icons for Beans, RF, stars, challenges and every button, in place of text symbols.",
      "Your shop's colour runs along the top of the manager card and every menu header.",
      "Striped day and XP bars, a level badge on your manager's portrait, and price tags in butter yellow.",
      "Menus are tidier: tabs as a segmented control, and each upgrade, staff slot and dish in its own card.",
      "A new loading screen with a steaming pixel cup, and the page around the game is dressed to match, with links to the about page, gallery and soundtrack.",
      "On a phone the top bar uses icon buttons and today's challenges start folded, so more of the shop floor shows.",
      "Dark mode covers all of it.",
    ],
  },
  {
    version: "1.8", date: "2026-09-28", title: "A shop per manager and a second pass",
    notes: [
      "Every manager has their own shop: progress saves by the managing Friend's token number. Pick another of your Friends as manager to open a new shop; switch back and the first is waiting. An existing shop moves to the first manager you open it with.",
      "Second pass (Upgrades → Shop, level 8): a second serving spot at the far end of the counter. Chefs set dishes down at the nearest pass and staff pick up wherever dishes wait, so food gets out faster.",
    ],
  },
  {
    version: "1.7", date: "2026-09-28", title: "Shuffle, skip and now playing",
    notes: [
      "Music can shuffle: Settings or Build → Music → Shuffle every 1, 2, 3 or 5 minutes plays a random unlocked track.",
      "⏮ ⏭ skip buttons in the music controls.",
      "A now playing card pops up in the bottom-left corner when the song changes, then folds to a small chip with the skip buttons.",
    ],
  },
  {
    version: "1.6", date: "2026-09-28", title: "Two roads, three new buildings, a busy kitchen and a master menu",
    notes: [
      "A side road now runs along the café's other front into the main road, with its own sidewalks, curbs, lamps and a zebra crossing. The side-street shops sit across it, and their Friends cross at the corner.",
      "Prettier outdoors: leafy shaded trees, lit pines with snow caps, petalled flowers, mossy rocks, grass tufts, fallen leaves, pebbles, sand ripples and snow drifts.",
      "Three new buildings: a slim bistro, an L-shaped café round a paved corner patio, and a U-shaped café with its kitchen in the middle of the U.",
      "The kitchen looks like one: a two-door fridge, ranges with oven doors, a steaming stockpot and a sizzling pan, a sink and a prep board, a tiled splashback with hanging utensils, and wooden counter tops.",
      "Chefs keep busy, moving between the stoves, fridge, sink and prep top while dishes cook, and still bring every dish to the pass.",
      "A master menu: seven more dishes for every shop, one a level from 16 to 22. The café now climbs to level 22.",
      "Thick scrollbars in the game's colours, easy to see and grab in build mode and menus.",
    ],
  },
  {
    version: "1.5", date: "2026-09-28", title: "Turn the view, a neighbourhood, random events and a longer climb",
    notes: [
      "Turn the whole view a quarter at a time: ⟲ ⟳ buttons, [ and ], or right-drag. Walls, furniture, Friends and the street all turn with it, and WASD keeps walking the way you look.",
      "A neighbourhood: the street and sidewalks run to the edge of the world, with a sidewalk across the road and rows of neighbouring shops. Friends come out of their doors and pop into them; shops between you and the café turn see-through.",
      "Random events most days: a food critic, a celebrity Friend, a tour bus, rain showers, a lunch rush or a kitchen hiccup.",
      "Build → ⟳ Turn: tap any placed item (or the capsule machine) to turn it where it stands. Every piece now looks different each way it faces.",
      "Seven new pieces for the mid and late game: antique globe, bonsai, giant teddy bear, golden harp, stone fireplace, neon RF sign and a mini carousel.",
      "Three late-game dishes for every shop (levels 11, 13 and 15).",
      "Four more upgrade tracks: staff training, chef's hats, neon storefront and a second station.",
      "Fixes: role buttons in the staff screen now show which is picked in dark mode; the challenges list sits under your card.",
    ],
  },
  {
    version: "1.4", date: "2026-09-28", title: "A world outside, a camera and daily challenges",
    notes: [
      "The world around the shop: pick a scenery in Build → Outside. Quiet lot, cottage garden, city park and pine woods cost Beans; seaside, snowy village, cherry blossom lane and night market are paid with RF capsules (Capsules → Boosts).",
      "A longer street, and the sidewalk now wraps round the building's other front. Some Friends come round the corner.",
      "Camera: drag to move the view, scroll or pinch to zoom, arrow keys to pan, + / − to zoom, ⤢ to reset. WASD walks your manager.",
      "Daily challenges: three a day (serve, happy guests, Beans, tips, walk-ins, group tables, a perfect day or a top rating), each paying Beans and XP.",
      "Luxury pieces: dessert trolley, crystal candelabra, grand piano and koi pond.",
      "The high end costs more: top wallpapers and floors, the last upgrade levels, and ambience levels that need more décor.",
    ],
  },
  {
    version: "1.3", date: "2026-09-28", title: "Group tables, boosts and a proper pause",
    notes: [
      "Tables for two and for four: parties sit together, and one tap takes the whole table's order.",
      "Prettier tables and chairs (tablecloths, cushions, a candle, gingham), soft bevels on furniture, and pots with little faces.",
      "Music: 11 composed melodies in song form, a flute for bossa and a music box for waltzes, so tracks don't loop the same tune.",
      "Beans and RF sit in their own boxes beside a sharper manager portrait.",
      "Build mode has Tables, Rugs and Décor tabs.",
      "Pause any time with ⏸, Esc or P.",
      "Your manager earns a skill point every café level: Quick feet, Steady hands, Snappy service, Charm, Calm presence and Leadership (Upgrades → You).",
      "RF boosts: pay with capsules for Tireless crew, Perfect service, Street festival or Golden hour (Capsules → Boosts).",
      "Ten shop expansions, one tile each way, up to 20 × 20. Each adds a free staff slot; up to 10 staff.",
      "Up to 100 tables (5 at level 1, 7 more each level).",
      "Purchases ask before spending Beans (turn this off in Settings).",
      "Dark mode (Settings), and this update log.",
    ],
  },
  {
    version: "1.2", date: "2026-09-28", title: "Buildings, rotation and a slower climb",
    notes: [
      "Four buildings: corner café, long diner, townhouse and café with parlour. Pick one at setup or in Build → Building.",
      "Every item turns four ways (R, Shift+R back). Move the capsule machine too.",
      "12 new décor pieces, 2 new rugs, 6 new wallpapers and 6 new floors.",
      "Ten new tracks: lo-fi, jazz waltzes, bossa, blues and bebop (16 in all).",
      "Five-minute days, lower prices and tips, and 15 café levels.",
      "Eight shop upgrade tracks, and worker attribute points for speed, stamina and skill.",
      "Chefs carry each dish from the stove to the pass.",
    ],
  },
  {
    version: "1.1", date: "2026-09-27", title: "Music and sound",
    notes: [
      "Procedural jazz tracks, a coffee-ready chime, a door bell and Friends who chirp, sigh and yawn.",
      "The capsule machine got a crank, a collection and RF-exclusive décor.",
      "Audio starts on any tap and plays through the iPhone ringer switch.",
    ],
  },
  {
    version: "1.0", date: "2026-09-26", title: "Opening day",
    notes: [
      "Five shop types, owned Friends as staff tiered by generation, and a living street.",
      "Kitchen and break rooms, promoters, worker levels and expansions.",
      "Build mode, per-wallet saves and a day card to post on X.",
    ],
  },
];
export const VERSION = CHANGELOG[0].version;
