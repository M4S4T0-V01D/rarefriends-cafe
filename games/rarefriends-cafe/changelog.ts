/** The in-game update log (Settings → What's new), newest first. */
export type Release = Readonly<{ version: string; date: string; title: string; notes: readonly string[] }>;

export const CHANGELOG: readonly Release[] = [
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
