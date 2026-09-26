# RareFriends Cafe — game component

FriendSDK **v0.1.2** game. A black-and-white, greyscale and faded-colour 2.5D
isometric shop sim inspired by *Moe Girl Cafe 2*. Your verified Rare Friend manages the shop,
your other owned Friends can join as staff, and guest Friends are the customers.

The SDK runtime handles wallet connection, owned-Friend selection and the fresh ownership and
generation check. It also supplies the fixed, **simulated** RF action client. This component
has no wallet code, no routes and no identity gate of its own. The project's trusted host page
(`host/runtime.tsx`) adds the owned-Friend staff roster and per-wallet saves. See
[the root README](../../README.md#how-the-host-extends-the-sdk).

## Controls

| Input | Action |
| --- | --- |
| Tap / click a guest | Take their order. If their dish is ready, fetch it and serve it. |
| Tap / click the counter | Pick up every ready dish (up to your carry limit). Carried dishes are delivered automatically. |
| Tap / click the floor | Walk there |
| Tap the capsule machine | Open **Rare Recipe Capsules** (simulated RF) |
| WASD / arrow keys | Walk tile by tile |
| E / Space / Enter | Act on whatever is next to you (table, counter, capsule machine) |
| 1–9, 0 | Act on the guest at table 1–10 |
| C · X | Pick up at the counter · clear your task list |
| B | Build mode |
| **Build mode:** tap a tile, or arrows + Enter | Place the selected item. **Move**: tap an item, then a tile. **Sell**: tap an item. |
| R · Delete · Esc | Rotate the chair · sell the item under the cursor · leave build mode |

Tasks queue up, and numbered markers show their order. The shop pauses while a menu, build mode
or a runtime confirmation is open. Sound is off by default (♪ button or Settings). Settings also
has **Reduce motion**, and the game follows the system `prefers-reduced-motion` setting.

## Rules

### Shops
Choose one before your first day. All five play the same way and have the same balance, but each has its own
menu, dish art, kitchen station, sign and awning colour.

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

### A day of service
- A day lasts **150 seconds** (08:00–20:00 on the shop clock). After closing, guests already inside finish, then a day summary appears.
- A guest arrives about every 5 s while a table is free. Arrivals speed up with ambience and rating.
- **Order patience:** 18 s. **Food patience:** 34 s after ordering, +6% per ambience level. If patience runs out, the guest leaves unhappy and the rating drops.
- **Payment** = price × (1 + tip). Tip = 30% × remaining patience + 3% per ambience level + House Secret bonus. Rating is a rolling average (5 happy, 4 slow, 1 left).
- **XP:** +1 per guest served, +1 if happy, +2 for a Genesis VIP. Levels unlock dishes, more tables and staff slots.
- The kitchen cooks 1 dish at a time, plus 1 per chef. Station levels (70 / 150 / 260 / 420 / 650 Beans) cut cook time 12% each. You carry 2 dishes (3 with the Cellular perk).

### Staff
- You start with **1 staff slot**. More slots cost 120 / 280 / 520 / 900 Beans at levels 2 / 3 / 5 / 7, up to **5 slots**.
- Fill a slot with **one of your own Friends**: any other eligible Generations NFT in the connected wallet. They appear with their canonical sprite and token number. Or pick one of six guest Friend applicants.
- Give each staff Friend a role. **Waiters** take orders and deliver on their own. **Chefs** add one kitchen slot each.
- **Owned Friends are experienced:** as waiters they move 25% faster and carry 2 dishes; as chefs they cook 10% faster (stacking to a 30% cap). Guest staff carry 1 dish at base speed.
- A Friend that leaves the wallet leaves the staff.

### Build mode (the tile grid)
The floor is an 11 × 11 tile grid. The door, counter, kitchen, pickup spot and capsule machine are fixed. Everything else is yours.

| Item | Cost | Ambience | Notes |
| --- | --- | --- | --- |
| Table & chair | 60 | – | Seats one guest. The chair sits behind the table; R flips it. Max tables = 3 + level (up to 10). |
| Potted monstera | 35 | +1 | |
| Faded rose rug | 45 | +1 | Walkable, can go under furniture |
| Paper floor lamp | 70 | +2 | |
| Bookshelf | 90 | +2 | |
| Record player | 150 | +3 | |
| Upright piano | 260 | +4 | |

- **Move** is free. **Sell** refunds 50%. You always keep at least one table, and a table with a guest can't be moved.
- A placement is refused if it would stop guests reaching any chair, or staff reaching any table, the counter or the capsule machine.
- **Wallpapers:** plain (free), faded stripes 60 (+1), polka dots 90 (+1), white brick 140 (+2), wood panelling 180 (+2), dusty-blue damask 240 (+3).
- **Floors:** grey checker (free), oak planks 80 (+1), sage hex tiles 120 (+1), terrazzo 150 (+2), herringbone 190 (+2), rose marble 260 (+3). Once bought, a design is free to switch back to.
- **Ambience level** 1–5 at 2 / 5 / 9 / 14 / 20 points raises tips, patience and arrivals. It also hangs framed art, paper lanterns (level 3) and a moon chandelier (level 5).

### Manager family perks
| Family | Perk |
| --- | --- |
| Skeleton | Dishes cook 15% faster |
| Mask | Guests tip 10% more |
| Family | Staff helpers move 25% faster |
| Cellular | Carry one extra dish |
| Asymmetry | 12% chance a guest pays double |
| Hoverer | You move 30% faster (and gently hover) |
| Colossus | Guests are 25% more patient |
| Sparkling | Rating starts half a star higher |
| Hollow | Guests arrive 15% more often |

### Saving
Progress saves automatically every few seconds and at closing time. It is saved **per wallet address** on this device, in the host page's local storage. Saved: shop, day, Beans, XP, level, rating, dishes, station level, furniture layout, wallpaper, floor, owned designs, staff slots and staff. Reconnecting the same wallet shows **Welcome back** with everything restored. A day in progress restarts from its opening. Saves are checked on load, and a broken or tampered save is ignored.

### Share your day on X
Every day summary draws a **1200 × 675 day card**: a photo of your shop mid-afternoon, the day's numbers, and your
manager's portrait and family, with `@RareFriendsNFT #RareFriends #RareFriendsCafe` in the footer.

- **Post to X:** on phones, the share sheet gets the picture and the post text, so pick X. On desktop, the picture is copied to your clipboard (saved instead if copying is blocked) and a prefilled X post opens: paste the picture (Ctrl/Cmd+V) and press Post.
- **Copy picture** / **Save picture:** just the card.
- Post text: *"Day N at <shop> ☕ served X guests, earned Y Beans, ★★★★☆ 4.2. My Rare Friend #ID (<family>) runs the shop! Play: <link> @RareFriendsNFT #RareFriends #RareFriendsCafe"* (always ≤ 280 characters).
- Sharing uses the trusted host page. It is unavailable under the plain SDK CLI runtime.

## Rare Recipe Capsules (simulated RF)
Capsules use the SDK's chance-game client (`buy`, `play`, `settle`, `redeem`). Each action is confirmed in the
runtime's own dialog. All RF is **simulated** in the preview; the preview wallet starts with 20 RF. Capsule
balances live in the SDK's session ledger and reset on reload.

| Rule | Exact value |
| --- | --- |
| Capsule price | 1 RF (`1000000000000000000` base units) |
| House Secret | 60% / 6,000 bps · 0.5 RF · kept: +3% tips per recipe (max 5) |
| Silver Recipe | 28% / 2,800 bps · 1 RF · kept: your shop's silver special |
| Moonlight Recipe | 10% / 1,000 bps · 2 RF · kept: your shop's moonlight special, +10% patience |
| Golden Recipe | 2% / 200 bps · 5 RF · kept: Genesis VIP guests (18% of arrivals) pay 3× |
| Expected value | 0.88 RF per capsule |
| Consumable | One capsule opens into exactly one recipe; single settlement, no reroll |
| Backing | Each purchased or pending capsule reserves 5 RF; kept recipes keep their fixed RF backing |
| Redemption | Fixed value, no expiry. Redeeming a recipe removes its bonus. |

## Art and credits
- All scenery is canvas code in this directory: the shop, furniture, 23 dish icon shapes, wallpapers, floors and the faded palette. There are no image files.
- The manager and your owned staff use their **canonical Generations sprites**, read with the SDK's `createFriendReader`.
- Regulars #7730 and #3412 use canonical frames copied from FriendSDK v0.1.2 `examples/fishing/sample-sprites.ts` (`regulars.ts`).
- Guest Friends are original procedural 16 × 16 one-bit masks, one archetype per family (`guests.ts`). They are not on-chain token art.
- Sound is the FriendSDK procedural sound kit. Rare Friends artwork is used under FriendSDK [NOTICE.md](https://github.com/spokesz/friendsdk/blob/v0.1.2/NOTICE.md).
