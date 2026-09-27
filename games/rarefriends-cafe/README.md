# RareFriends Cafe — game component

FriendSDK **v0.1.2** game. A black-and-white, greyscale and faded-colour 2.5D isometric shop on a street. Your
verified Rare Friend manages it, your other owned Friends staff it, and Friends walking by become customers.

The SDK runtime handles wallet connection, owned-Friend selection, the fresh ownership and generation check, and the
fixed, **simulated** RF action client. This component has no wallet code and no identity gate of its own. The trusted
host page (`host/runtime.tsx`) adds the owned-Friend roster (with generations), per-wallet saves and day-card sharing.
See [the root README](../../README.md#how-the-host-extends-the-sdk).

## Controls

| Input | Action |
| --- | --- |
| Tap / click a guest | Take their order. If their dish is ready, fetch it and serve it. |
| Tap / click the counter | Pick up every ready dish (up to your carry limit). Carried dishes are delivered automatically. |
| Tap a staff Friend | Tired (*zzz*): send them to the break room. Otherwise, show their level and energy. |
| Tap the floor · the capsule machine | Walk there · open the **Rare Capsule Machine** |
| WASD / arrow keys · E / Space / Enter | Walk tile by tile · act on whatever is next to you |
| 1–9, 0 · C · X · T · B | Table 1–10 · pick up · clear task list · send the most tired Friend on a break · build mode |
| **Build mode:** tap a tile, or arrows + Enter | Place the selected item. **Move**: tap an item, then a tile. **Sell**: tap an item. |
| R · Delete · Esc | Rotate the chair · sell the item under the cursor · leave build mode |

Tasks queue up with numbered markers. The shop pauses while a menu, build mode or a runtime confirmation is open.
Sound starts on your first tap. The **♪** button mutes everything. Settings and Build → **Music** have the track
picker, music and effects toggles, and volume. **Reduce motion** is in Settings and follows the system setting.

## The shop

- **Plan:** the building is 10 × 10 tiles at first. The **kitchen** is a room along the back wall, closed off by the **counter**, which is its wall: guests order at the pass. A **break room** with a sofa sits behind it, joined to the kitchen by a door and to the dining room by its own door. The dining room is your tile grid. Outside the front wall run a **sidewalk and street**.
- **Expansion:** grow the shop **2 × 2 at a time**: 10 → 12 → 14 → 16. Costs are 400 / 900 / 1,600 Beans at levels 3 / 5 / 7, and you can expand only between days. The kitchen counter lengthens and the camera zooms to fit. Furniture that would land on a reserved tile is refunded in full.
- **Shops:** choose one before your first day. All five play alike, with their own menu, dish art, kitchen station, sign and awning colour.

| Shop | Menu (slots 1–7) · capsule specials |
| --- | --- |
| RareFriends Cafe (coffee & sweets) | Espresso, Latte ♡, Matcha Latte, Strawberry Mochi, Fluffy Pancakes, Omurice, Cloud Parfait · Silver Latte, Moonlight Parfait |
| Tide & Shell (seafood) | Clam Chowder, Fish & Chips, Grilled Squid, Shrimp Tempura, Oyster Plate, Lobster Roll, Seafood Paella · Silver Pearl Oysters, Moonlight Bouillabaisse |
| Flour Moon (pastry) | Croissant, Cinnamon Roll, Macarons, Strawberry Shortcake, Éclair, Mille-feuille, Lemon Tart · Silver Soufflé, Moonlight Mont Blanc |
| Patty Friends (burgers) | Fries, Milkshake, Classic Burger, Cheeseburger, Onion Rings, Double Stack, Friend Deluxe · Silver Smash, Moonlight Melt |
| Lantern Noodle House (Asian) | Green Tea, Gyoza, Onigiri, Miso Ramen, Sushi Set, Bao Buns, Katsu Curry · Silver Tempura Udon, Moonlight Bento |

| Menu slot | 1 | 2 | 3 | 4 | 5 | 6 | 7 | Silver | Moonlight |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Price (Beans) | 8 | 12 | 16 | 20 | 28 | 40 | 50 | 60 | 95 |
| Cook time | 3 s | 4 s | 5 s | 6 s | 8 s | 10 s | 9 s | 6 s | 11 s |
| Unlock | start | start | Lv 2 · 60 | Lv 3 · 120 | Lv 4 · 200 | Lv 5 · 350 | Lv 6 · 500 | kept Silver Recipe | kept Moonlight Recipe |

## A day of service

- A day lasts **150 s** (08:00–20:00 on the shop clock). After closing, guests already inside finish, then a summary and day card appear.
- **The street:** a Friend walks by about every 1.6 s. At your door, each one steps in with a **34% base chance**. Ambience (+10% per level), rating (+8% per star above 3), the Hollow perk (×1.15) and promoters (+12% × promoter power each) raise it, capped at 90%. A table must be free. Guests leave back onto the street.
- **Patience:** 18 s to order, 34 s for food (+6% per ambience level). If it runs out, the guest leaves unhappy and the rating drops.
- **Payment** = price × (1 + tip). Tip = 30% × remaining patience + 3% per ambience level + House Secret bonus. Rating is a rolling average (5 happy, 4 slow, 1 left).
- **Shop XP:** +1 per guest served, +1 if happy, +2 for a Genesis VIP. Levels unlock dishes, more tables (3 + level, up to 16), staff slots and expansions.
- **Kitchen:** 1 dish at a time, plus 1 per working chef. Station levels (70 / 150 / 260 / 420 / 650 Beans) cut cook time 12% each. You carry 2 dishes (3 with the Cellular perk).

## Staff

- **Slots:** start with 1. More cost 120 / 280 / 520 / 900 Beans at levels 2 / 3 / 5 / 7, up to **5**. Fill each slot with **one of your own Friends** (other eligible Generations NFTs in the wallet, shown with their canonical sprite and token number) or one of six guest applicants.
- **Roles:** **Waiters** take orders and deliver on their own. **Chefs** work the kitchen: each adds a cooking slot and cuts cook time by 6% × (power − 0.5), with a 35% cap. **Promoters** stand on the sidewalk and pull passers-by in.
- **Generation tier** (from the Friend's on-chain `generation`; Gen 1 is the highest, Gen 6 the lowest):

| Tier | Gen 1 Legendary | Gen 2 Epic | Gen 3 Rare | Gen 4 Uncommon | Gen 5 Common | Gen 6 Rookie | Guest applicant |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Power | ×1.30 | ×1.25 | ×1.20 | ×1.15 | ×1.10 | ×1.05 | ×1.00 |

- **Worker levels 1–10:** +1 worker XP per order taken, dish served, dish cooked or guest brought in. Levels need 10 / 25 / 45 / 70 / 100 / 140 / 190 / 250 / 320 XP. Each level adds 4% power and 4% fatigue relief. Power scales walking speed, chef speed and promoter pull. Waiters carry 2 dishes at Gen 1–3 or worker level 5+.
- **Fatigue:** +4 per waiter task, +3 per dish cooked, +0.3 per second on the sidewalk. At 70 a worker is **tired** (15% slower, *zzz* bubble); at 100 they are **exhausted** and stop. Tap them (or press T) and they walk to the break room for **15 s rested … 30 s exhausted** (15 + 15 × fatigue ÷ 100), then return with full energy. Everyone starts each day rested.

## Build mode

| Item | Cost | Ambience | Notes |
| --- | --- | --- | --- |
| Table & chair | 60 | – | Seats one guest; the chair sits behind the table; R flips it. |
| Potted monstera · Faded rose rug | 35 · 45 | +1 · +1 | The rug is walkable |
| Paper floor lamp · Bookshelf | 70 · 90 | +2 · +2 | |
| Record player · Upright piano | 150 · 260 | +3 · +4 | |
| **RF exclusives** (from capsules) | free | +3 to +8 | Each placed once; see below |

- Move is free and Sell refunds 50%. You always keep one table, and a table with a guest can't move. A placement is refused if it would stop guests reaching any chair, or staff reaching any table, the counter, the capsule machine or the break room.
- **Wallpapers:** plain, faded stripes 60 (+1), polka dots 90 (+1), white brick 140 (+2), wood panelling 180 (+2), dusty-blue damask 240 (+3). **Floors:** grey checker, oak planks 80 (+1), sage hex 120 (+1), terrazzo 150 (+2), herringbone 190 (+2), rose marble 260 (+3). Once bought, a design is free to switch back to.
- **Ambience level** 1–5 at 2 / 5 / 9 / 14 / 20 points. It raises tips, patience and walk-ins, and hangs framed art, paper lanterns (level 3) and a moon chandelier (level 5).
- **Music** tab: pick the jazz track and set volume (see Audio).

## Manager family perks

| Skeleton | Mask | Family | Cellular | Asymmetry | Hoverer | Colossus | Sparkling | Hollow |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Cook 15% faster | +10% tips | Staff 25% faster | Carry 3 | 12% double pay | Move 30% faster | +25% patience | +0.5★ start | +15% walk-ins |

## Rare Capsule Machine (simulated RF)

Capsules use the SDK's chance-game client (`buy`, `play`, `settle`, `redeem`); each action is confirmed in the
runtime's own dialog. The preview wallet starts with 20 simulated RF. Buy ×1 or ×5, then **turn the crank** to
open one capsule or **open all**.

| Tier | Chance | RF value | Kept recipe bonus | RF-exclusive collectibles |
| --- | --- | --- | --- | --- |
| House Secret | 60% (6,000 bps) | 0.5 RF | +3% tips per recipe (max 5) | Lucky Cat, Gumball Machine, Paper Crane Stand (+3 ambience) |
| Silver Recipe | 28% (2,800 bps) | 1 RF | your shop's silver special | Chrome Jukebox (unlocks *Neon Nights*), Silver Fountain (+4) |
| Moonlight Recipe | 10% (1,000 bps) | 2 RF | moonlight special, +10% patience | Moon Telescope (unlocks *Midnight Moon*), Star Lamp (+5) |
| Golden Recipe | 2% (200 bps) | 5 RF | Genesis VIP guests (18% of walk-ins) pay 3× | Golden Friend Statue of your manager (+8) |

- **Price:** 1 RF (`1000000000000000000` base units). **Expected RF value:** 0.88 RF. Each purchased or pending capsule reserves 5 RF; kept recipes keep their fixed RF backing with no expiry. Redeeming removes that recipe's bonus.
- **Collectibles:** each opened capsule also grants a random uncollected exclusive of its tier, or bonus Beans for a duplicate (40 / 80 / 160 / 400). Collectibles carry no RF value and are saved with your shop. The **Collection** tab shows all 8 and can jump to placing them.
- Kept recipes live in the SDK's session ledger and reset on reload.

## Share your day on X

Each summary draws a **1200 × 675 day card** with a mid-day photo of your shop, the numbers and your manager, and
*@RareFriendsNFT #RareFriends #RareFriendsCafe* in the footer. **Post to X** uses the share sheet on phones. On
desktop it copies the picture (or saves it) and opens a prefilled X post: paste the picture, then press Post. **Copy
picture** and **Save picture** are also offered. The post links to https://rarefriends.com/ and always fits in 280 characters.

## Saving

Progress saves automatically every few seconds and at closing, **per wallet address** on this device. The save covers
shop, day, Beans, levels, rating, dishes, station, size, furniture, designs, staff (with worker XP), collectibles and
audio preferences. A closed day resumes at the next day. Saves are validated on load; older saves migrate, and
furniture that no longer fits is refunded.

## Audio

All music and sound effects are synthesized with WebAudio in the sandbox; there are no audio files.
- **Tracks:** *Café au Lait* (warm swing), *Rainy Window* (slow minor), *Sunday Stroll* (bright swing), *Street Bossa* (bossa nova), *Neon Nights* (Chrome Jukebox) and *Midnight Moon* (Moon Telescope). Each has electric-piano comping, a walking bass, brushed drums and vibraphone phrases.
- **Mix:** a gentle compressor keeps the mix loud enough for laptop and phone speakers without clipping. Audio starts on any tap, click or key; on iPhone it plays as media, so the ringer switch doesn't mute it (iOS 17+).
- **Sound effects:** a station-specific ready sound (espresso steam, bubbling tank, oven ding, grill sizzle, steamer) with a bell; a door bell for walk-ins; guest chirps and coins when they pay; grumbles when they leave; staff sighs when tired and trills when rested; melodies for level-ups and closing; thunks, cranks and pops for building and capsules. UI cues come from the FriendSDK sound kit.

## Art and credits

- Scenery, rooms, street, furniture, RF exclusives, 23 dish icon shapes, wallpapers and floors are canvas code in this directory. There are no image files.
- The manager and your owned staff use their **canonical Generations sprites** (the SDK's `createFriendReader`). Regulars #7730 and #3412 use canonical frames from FriendSDK v0.1.2 `examples/fishing/sample-sprites.ts`.
- Guest Friends are original procedural 16 × 16 one-bit masks, one archetype per family. Rare Friends artwork is used under FriendSDK [NOTICE.md](https://github.com/spokesz/friendsdk/blob/v0.1.2/NOTICE.md).
