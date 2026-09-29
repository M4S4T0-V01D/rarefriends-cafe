# RareFriends Cafe — game component

FriendSDK **v0.1.4** game. A black-and-white, greyscale and faded-colour 2.5D isometric shop on a street. Your
verified Rare Friend manages it, your other owned Friends staff it, and Friends walking by become customers.

The SDK runtime handles wallet connection, owned-Friend selection, the fresh ownership and generation check, and the
fixed, **simulated** RF action client. This component has no wallet code and no identity gate of its own. The trusted
host page (`host/runtime.tsx`) adds the owned-Friend roster (with generations), a save per managing Friend and day-card sharing.
See [the root README](../../README.md#how-the-host-extends-the-sdk).

## Controls

| Input | Action |
| --- | --- |
| Tap / click a guest | Take their order. If their dish is ready, fetch it and serve it. |
| Tap / click the counter | Pick up every ready dish (up to your carry limit). Carried dishes are delivered automatically. |
| Tap a staff Friend | Tired (*zzz*): send them to the break room. Otherwise, show their level and energy. |
| Tap the floor · the capsule machine | Walk there · open the **Rare Capsule Machine** |
| Drag · scroll / pinch · arrow keys · + / − · ⤢ | Move the view · zoom · pan · zoom · reset the view |
| ⟲ ⟳ · [ ] · right-drag | Turn the view a quarter (walls, furniture and Friends turn with it; WASD and the build cursor follow the view) |
| WASD · E / Space / Enter | Walk tile by tile · act on whatever is next to you |
| 1–9, 0 · C · X · T · B | Table 1–10 · pick up · clear task list · send the most tired Friend on a break · build mode |
| ⏸ · Esc · P | Pause (Esc again resumes) |
| **Build mode:** tap a tile, or arrows / WASD + Enter | Place the selected item (Beans purchases ask first). **Move**: tap an item (or the capsule machine), then a tile. **Turn**: tap any placed item to turn it a quarter. **Sell**: tap an item. |
| R · Shift+R · Delete · Esc | Turn the item you're placing or moving · back · sell the item under the cursor · leave build mode |

Tasks queue up with numbered markers. The shop pauses while paused, while a menu or build mode is open, or during a runtime confirmation.
Settings has **dark mode** (auto, light or dark), **Ask before spending Beans**, and **What's new** (the update log).
Sound starts on your first tap. The **♪** button mutes everything. Settings and Build → **Music** have the track
picker, ⏮ / ⏭ skip buttons, **Shuffle every 1 / 2 / 3 / 5 min** (a random unlocked track; 2 min by default), music and
effects toggles, and volume. A **now playing** card pops up in the bottom-left corner when the song changes, then folds to a
small chip that keeps the skip buttons (hover it to see the track's mood). **Reduce motion** is in Settings and follows the system setting.

## The shop

- **Plan:** the **kitchen** is a room against a back wall, closed off by the **counter**, which is its wall: guests order at the pass. A **break room** with a sofa sits in the front-left corner behind its own door. Every other tile is the dining room, your grid. Outside, a long **street** runs past the door to the edge of the world, with a sidewalk on each side. Along the building's other front a **side road** with its own two sidewalks runs into the main road at a T-junction, with a zebra crossing where your sidewalk meets it. Friends from the side-street shops cross at the corner. Rows of **neighbouring shops** (bakery, books, flowers, tea house and more) line the streets: you can't go in, but Friends come out of their doors and pop into them. A shop standing between you and the café turns see-through.
- **The world outside:** Build → **Outside** dresses the ground beyond the walls and sidewalks. *Quiet lot* (free), *Cottage garden* (☕ 1,200, +2 ambience), *City park* (☕ 2,600, +3) and *Pine woods* (☕ 4,200, +4) cost Beans. *Seaside* and *Snowy village* (3 capsules, +4), *Cherry blossom lane* (4, +5) and *Night market* (5, +6) are paid with RF capsules in Capsules → Boosts. Owned sceneries switch for free.
- **Buildings:** pick one at setup; change it in Build → **Building** between days (furniture that no longer fits is refunded).

| Building | Size at start | Layout |
| --- | --- | --- |
| Corner café | 10 × 10 | Kitchen along the left wall, with a door straight into the break room. |
| Long diner | 10 × 14 | Four tiles longer on the street, door in the middle. A short kitchen opens into a dining nook; the break room is at the far end. |
| Townhouse | 10 × 10 | Kitchen on the back wall beside the sign, across the room from the break room. |
| Café with parlour | 10 × 12 | Like the corner café, two tiles deeper. A half wall with planters closes off a front parlour, reached through one opening by the door, far from the pass. |
| Slim bistro | 8 × 16 | Narrow and long down the street, door in the middle: a row of tables past a short kitchen, the break room at the far end. |
| L-shaped café | 12 × 12 | Two wings round a paved patio (benches and flowers) on the street corner. The kitchen runs down the left wall into the break room. |
| U-shaped café | 12 × 11 | Two wings either side of a back courtyard. The kitchen sits in the middle of the U against the courtyard wall, with a door out into each wing. |

- **Expansion:** ten expansions, each one tile longer on both sides (10 → 20 wide) and each adding a free staff slot (up to 10). Costs are 300 / 500 / 750 / 1,000 / 1,300 / 1,650 / 2,050 / 2,500 / 3,000 / 3,600 Beans at levels 3–10, 12 and 14, between days only. The kitchen counter lengthens. Furniture that would land on a reserved tile is refunded in full.
- **Capsule machine:** starts in the back corner by the window. In Build → **Move**, tap it, then a tile; **R** (or **Turn**) turns the side you use it from (the crank shows which).
- **Shops:** choose one before your first day. All five play alike, with their own menu, dish art, kitchen station, sign and awning colour.

| Shop | Menu (slots 1–7) · capsule specials · late-game signatures · master menu (levels 16–22) |
| --- | --- |
| RareFriends Cafe (coffee & sweets) | Espresso, Latte ♡, Matcha Latte, Strawberry Mochi, Fluffy Pancakes, Omurice, Cloud Parfait · Silver Latte, Moonlight Parfait · Honey Butter Toast, Strawberry Crêpe Cake, Latte Art Flight · Affogato, Tiramisu, Soufflé Pancake Tower, Black Sesame Parfait, Truffle Omurice, Gold-Leaf Mocha, Friendship High Tea |
| Tide & Shell (seafood) | Clam Chowder, Fish & Chips, Grilled Squid, Shrimp Tempura, Oyster Plate, Lobster Roll, Seafood Paella · Silver Pearl Oysters, Moonlight Bouillabaisse · Grilled Lobster, Crab Pot, Grand Seafood Tower · Scallop Carpaccio, Seared Tuna Steak, Uni Risotto, Lobster Thermidor, King Crab Legs, Caviar Blini, Ocean Grand Platter |
| Flour Moon (pastry) | Croissant, Cinnamon Roll, Macarons, Strawberry Shortcake, Éclair, Mille-feuille, Lemon Tart · Silver Soufflé, Moonlight Mont Blanc · Opera Cake, Macaron Tower, Gold-Leaf Éclair · Kouign-amann, Paris-Brest, Saint-Honoré, Chocolate Soufflé, Fraisier, Croquembouche, Moon Palace Pièce Montée |
| Patty Friends (burgers) | Fries, Milkshake, Classic Burger, Cheeseburger, Onion Rings, Double Stack, Friend Deluxe · Silver Smash, Moonlight Melt · Loaded Nachos, Truffle Burger, Tower of Friendship · Chili Cheese Fries, Wagyu Burger, Lobster Slider Trio, Triple Truffle Shake, BBQ Brisket Stack, Onion Ring Tower, Golden Friend Burger |
| Lantern Noodle House (Asian) | Green Tea, Gyoza, Onigiri, Miso Ramen, Sushi Set, Bao Buns, Katsu Curry · Silver Tempura Udon, Moonlight Bento · Peking Duck, Omakase Box, Dragon Ramen · Tonkotsu Ramen, Xiao Long Bao, Unagi Don, Wagyu Hot Pot, Lobster Dim Sum, Toro Nigiri Flight, Imperial Banquet |

| Menu slot | 1 | 2 | 3 | 4 | 5 | 6 | 7 | Silver | Moonlight | 10 | 11 | 12 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Price (Beans) | 5 | 7 | 9 | 12 | 16 | 23 | 29 | 35 | 55 | 38 | 48 | 62 |
| Cook time | 3 s | 4 s | 5 s | 6 s | 8 s | 10 s | 9 s | 6 s | 11 s | 11 s | 12 s | 14 s |
| Unlock | start | start | Lv 2 · 60 | Lv 3 · 120 | Lv 5 · 200 | Lv 7 · 350 | Lv 9 · 500 | kept Silver Recipe | kept Moonlight Recipe | Lv 11 · 900 | Lv 13 · 1,500 | Lv 15 · 2,400 |

**Master menu** (slots 13–19, one a level):

| Menu slot | 13 | 14 | 15 | 16 | 17 | 18 | 19 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Price (Beans) | 72 | 84 | 96 | 110 | 126 | 145 | 170 |
| Cook time | 15 s | 16 s | 17 s | 18 s | 19 s | 20 s | 22 s |
| Unlock | Lv 16 · 3,400 | Lv 17 · 4,600 | Lv 18 · 6,000 | Lv 19 · 7,800 | Lv 20 · 10,000 | Lv 21 · 13,000 | Lv 22 · 17,000 |

## A day of service

- A day lasts **5 minutes** (08:00–20:00 on the shop clock). After closing, guests already inside finish, then a summary and day card appear.
- **The street:** a Friend walks by about every 1.6 s. At your door, each one steps in with a **34% base chance**. Ambience (+10% per level), rating (+8% per star above 3), the Hollow perk (×1.15), the window sign and neon storefront, and promoters (+12% × promoter power each) raise it, capped at 90%. A table must be free. Guests leave back onto the street.
- **Parties:** a table for two usually seats a pair; a table for four seats two to four friends. The party orders together once everyone has sat down (one tap), and one tap on a ready dish fetches the whole table's.
- **Daily challenges:** three a day, picked by the day number, from: serve N guests, serve N happy guests, earn N Beans, earn N in tips, welcome N walk-ins, serve N at group tables, no unhappy guest all day, close with ★ 4.5+. Targets grow with the day; each pays ☕ 40 + 6 × day (up to 400) and 6 XP.
- **Random events** (from day two, most days, partway through): *Food critic* (serve them happily for +0.3 rating and ☕ 80; if they leave unhappy, −0.4), *Celebrity Friend* (☕ 150 and +0.15 rating), *Tour bus* (a minute of passers-by galore), *Rain shower* (90 s: fewer walkers, +30% patience), *Lunch rush* (90 s: +20% tips), *Kitchen hiccup* (45 s: cooking 25% slower).
- **Patience:** 18 s to order, 34 s for food (+6% per ambience level). If it runs out, the guest leaves unhappy and the rating drops.
- **Payment** = price × (1 + tip), with Fancy plating raising the price. Tip = 20% × remaining patience + 2% per ambience level + House Secret bonus + tip jar + the serving waiter's skill. Rating is a rolling average (5 happy, 4 slow, 1 left).
- **Shop XP:** +1 per guest served, +1 if happy, +2 for a Genesis VIP. **22 levels** (15 / 40 / 75 / 120 / 180 / 255 / 345 / 450 / 575 / 720 / 885 / 1,070 / 1,275 / 1,500 / 1,750 / 2,030 / 2,340 / 2,685 / 3,065 / 3,485 / 3,945 XP). Levels unlock dishes, more tables (5 at level 1, +7 a level, up to 100), staff slots, expansions and upgrades. Every level past the first also gives your **manager a skill point** (Upgrades → You): *Quick feet* (+8% walk, ×3), *Steady hands* (+1 dish carried, ×2), *Snappy service* (−20% order/serve time, ×2), *Charm* (+4% tips on dishes you serve, ×3), *Calm presence* (+5% patience, ×3), *Leadership* (staff +5% speed and −5% fatigue, ×3).
- **Kitchen:** 1 dish at a time, plus 1 per working chef and per Second station level. Station levels (70 / 150 / 260 / 420 / 650 Beans) cut cook time 12% each. While dishes cook, a chef works their way along the chef row (a short stop at the fridge, a range, the sink or the prep top, now and then turning to the counter), and drifts back to their own station when the kitchen is quiet. As soon as a dish is done they drop what they're doing and carry it from the stove to the pass; with no chef, dishes appear on the pass. You carry 2 dishes (3 with the Cellular perk, +1 with the big tray).

## Shop upgrades

Bought one level at a time in Upgrades → **Shop**:

| Upgrade | Per level | Beans (café level) |
| --- | --- | --- |
| Window sign | +6% walk-ins | 90 (2) · 300 (5) · 1,000 (8) |
| Running shoes | you walk 8% faster | 110 (2) · 300 (6) |
| Comfy cushions | guests wait 8% longer | 140 (3) · 450 (6) · 1,300 (9) |
| Tip jar | +5% tips | 160 (3) · 500 (6) · 1,500 (10) |
| Break-room coffee | staff tire 12% slower, rest 20% faster | 200 (4) · 480 (8) |
| Dishwasher | guests finish eating 20% sooner | 240 (4) · 560 (8) |
| Fancy plating | dishes sell for 6% more | 300 (5) · 900 (9) · 2,400 (12) |
| Big serving tray | you carry one more dish | 2,500 (11) |
| Second pass | a second serving spot at the far end of the counter: chefs set dishes down at the nearest pass, and staff pick up wherever dishes are waiting (between days) | 1,200 (8) |
| Staff training | staff move 5% faster | 700 (7) · 1,600 (10) · 3,200 (13) |
| Chef's hats | dishes cook 6% faster | 900 (8) · 2,000 (11) · 4,000 (14) |
| Neon storefront | +10% walk-ins | 1,400 (10) · 3,200 (14) |
| Second station | one more dish cooks at a time | 2,800 (12) · 6,000 (15) |

## RF boosts

Capsules → **Boosts**. Paid with capsules bought with (simulated) RF: they open and settle into recipes through the SDK as
usual, but give the boost instead of a collectible. Boosts count shop days, including one in progress; buying again adds days.

| Boost | Capsules | Days | Effect |
| --- | --- | --- | --- |
| Tireless crew | 2 | 3 | Staff don't tire at all |
| Perfect service | 2 | 1 | No guest leaves unhappy; after closing, unserved guests head home content |
| Street festival | 3 | 2 | Twice as many Friends walk down the street |
| Golden hour | 3 | 2 | Every dish pays 25% more |

## Staff

- **Slots:** start with 1, up to **10**. Each expansion adds one free; the rest cost 120 / 280 / 520 / 900 / 1,300 / 1,800 / 2,400 / 3,100 / 4,000 Beans at levels 2 / 4 / 6 / 9 / 10–14. Fill each slot with **one of your own Friends** (other eligible Generations NFTs in the wallet, shown with their canonical sprite and token number) or one of six guest applicants.
- **Roles:** **Waiters** take orders and deliver on their own. **Chefs** work the kitchen: each adds a cooking slot and cuts cook time by 6% × (power − 0.5), with a 35% cap. **Promoters** stand on the sidewalk and pull passers-by in.
- **Generation tier** (from the Friend's on-chain `generation`; Gen 1 is the highest, Gen 6 the lowest):

| Tier | Gen 1 Legendary | Gen 2 Epic | Gen 3 Rare | Gen 4 Uncommon | Gen 5 Common | Gen 6 Rookie | Guest applicant |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Power | ×1.30 | ×1.25 | ×1.20 | ×1.15 | ×1.10 | ×1.05 | ×1.00 |

- **Worker levels 1–10:** +1 worker XP per order taken, dish served, dish cooked or guest brought in. Levels need 10 / 25 / 45 / 70 / 100 / 140 / 190 / 250 / 320 XP. Each level adds 4% power and 4% fatigue relief. Power scales walking speed, chef speed and promoter pull. Waiters carry 2 dishes at Gen 1–3 or worker level 5+.
- **Attribute points:** each worker level past the first earns a point to spend in the Staff tab, up to 5 per attribute. **Speed** +6% walking speed; **Stamina** tires 8% slower; **Skill** depends on the role: chefs cook 4% faster, waiters earn +3% tips on dishes they serve, promoters pull 8% harder. Points stay with the Friend when their role changes.
- **Fatigue:** +4 per waiter task, +3 per dish cooked, +0.3 per second on the sidewalk. At 70 a worker is **tired** (15% slower, *zzz* bubble); at 100 they are **exhausted** and stop. Tap them (or press T) and they walk to the break room for **15 s rested … 30 s exhausted** (15 + 15 × fatigue ÷ 100), then return with full energy. Everyone starts each day rested.

## Build mode

| Item | Cost | Ambience | Notes |
| --- | --- | --- | --- |
| Table & chair · Table for two · Table for four | 60 · 110 · 190 | – · – · +1 | One chair on any side · a chair either side · a chair on every side (parties order together) |
| Little cactus · Potted monstera · Coat rack | 25 · 35 · 40 | +1 each | |
| A-frame menu board · Flower stand | 55 · 65 | +1 each | The board reads MENU on the front, OPEN on the back |
| Faded rose rug · Sage runner · Braided round rug | 45 · 55 · 80 | +1 · +1 · +2 | Rugs are walkable; furniture can stand on them |
| Paper floor lamp · Bookshelf · Velvet armchair | 70 · 90 · 110 | +2 each | |
| Sleepy cat · Birdcage | 130 · 140 | +2 each | A cat asleep in its basket; a canary that hops on its perch |
| Record player · Cake display · Lavender loveseat | 150 · 160 · 180 | +3 each | |
| Grandfather clock · Arcade cabinet | 200 · 220 | +3 each | Swinging pendulum; a blinking screen |
| Fish tank · Upright piano | 240 · 260 | +4 each | |
| Antique globe · Bonsai · Giant teddy bear | 380 · 520 · 650 | +3 · +3 · +4 | Mid-game |
| Dessert trolley · Crystal candelabra · Golden harp | 750 · 950 · 1,100 | +4 · +5 · +5 | |
| Stone fireplace · Grand piano · Neon RF sign | 1,300 · 1,600 · 1,800 | +6 · +7 · +7 | A crackling fire; the lid up; a pink glow |
| Koi pond · Mini carousel | 2,200 · 2,800 | +8 · +10 | The end-game centrepieces |
| **RF exclusives** (from capsules) | free | +3 to +8 | Each placed once; see below |

- **Tabs:** Tables, Rugs and Décor. **Rotation:** every item turns four ways (**R**, **Shift+R** back, or the Rotate button, whose arrow shows the facing), and the **Turn** tool turns anything already placed. Fronts, backs and sides are drawn: turn a bookshelf to the wall and you see its back; even round pieces show their facing (a tablecloth's vase, a rug's heart, a pond's lily pad).

- Move is free and Sell refunds 50%. You always keep one table, and a table with a guest can't move. A placement is refused if it would stop guests reaching any chair, or staff reaching any table, the counter, the capsule machine or the break room.
- **Wallpapers (12):** plain, faded stripes 60 (+1), sage gingham 70 (+1), polka dots 90 (+1), subway tile 110 (+1), white brick 140 (+2), butter florals 150 (+2), wood panelling 180 (+2), lavender chevron 200 (+2), dusty-blue damask 520 (+3), rose scallops 680 (+3), starry night 950 (+4).
- **Floors (12):** grey checker, strawberry checker 70 (+1), oak planks 80 (+1), tatami mats 110 (+1), sage hex 120 (+1), slate flagstones 140 (+2), terrazzo 150 (+2), parquet squares 170 (+2), herringbone 190 (+2), lavender carpet 210 (+2), rose marble 560 (+3), blue mosaic 900 (+4). Once bought, a design is free to switch back to.
- **Ambience level** 1–5 at 3 / 8 / 15 / 24 / 36 points (décor, wallpaper, floor and scenery). It raises tips, patience and walk-ins, and hangs framed art, paper lanterns (level 3) and a moon chandelier (level 5).
- **Music** tab: pick the jazz track, skip, turn on shuffle and set volume (see Audio).

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

Progress saves automatically every few seconds and at closing, **per managing Friend** (by token number) on this device:
every Friend you pick as manager runs its own shop, and the save is only used while that Friend is in the connected wallet. The save covers
shop, day, Beans, levels, rating, dishes, station, size, building, furniture (with facing), the capsule machine's spot,
designs, upgrades, staff (with worker XP and attribute points), collectibles and audio preferences. A closed day resumes at the next day. Saves are validated on load; older saves migrate, and
furniture that no longer fits is refunded.

## Audio

All music and sound effects are synthesized with WebAudio in the sandbox; there are no audio files.
- **Tracks (16):** *Café au Lait* (warm swing), *Rainy Window* (slow minor), *Sunday Stroll* (bright swing), *Street Bossa* (bossa nova), *Neon Nights* (Chrome Jukebox), *Midnight Moon* (Moon Telescope), *Morning Pour-Over* (lo-fi), *Sugar Waltz* (jazz waltz), *Tide Pool* (seaside bossa), *Pastry Case Blues* (12-bar shuffle), *Lantern Glow* (lo-fi), *Rooftop Bounce* (up-tempo bebop), *Paper Cranes* (gentle waltz), *Night Bus Home* (minor lo-fi), *Samba de Café* (quick bossa) and *Last Order* (closing-time ballad).
- **Styles:** swing tracks walk the bass under electric-piano comping and brushed drums; bossa plays a dotted bass with rim clave; waltzes are in 3/4; lo-fi holds one chord a bar over a lazy kick and snare with a little vinyl crackle. Vibraphone phrases drift over all of them.
- **Mix:** a gentle compressor keeps the mix loud enough for laptop and phone speakers without clipping. Audio starts on any tap, click or key; on iPhone it plays as media, so the ringer switch doesn't mute it (iOS 17+).
- **Sound effects:** a station-specific ready sound (espresso steam, bubbling tank, oven ding, grill sizzle, steamer) with a bell; a door bell for walk-ins; guest chirps and coins when they pay; grumbles when they leave; staff sighs when tired and trills when rested; melodies for level-ups and closing; thunks, cranks and pops for building and capsules. UI cues come from the FriendSDK sound kit.

## Art and credits

- Scenery, the four buildings, street, furniture (drawn in four facings), RF exclusives, 23 dish icon shapes, wallpapers and floors are canvas code in this directory. There are no image files.
- The manager and your owned staff use their **canonical Generations sprites** (the SDK's `createFriendReader`). Regulars #7730 and #3412 use canonical frames from FriendSDK v0.1.2 `examples/fishing/sample-sprites.ts`.
- Guest Friends are original procedural 16 × 16 one-bit masks, one archetype per family. Rare Friends artwork is used under FriendSDK [NOTICE.md](https://github.com/spokesz/friendsdk/blob/v0.1.4/NOTICE.md).
