# RareFriends Cafe — game component

FriendSDK **v0.1.2** game. A black-and-white, greyscale and faded-colour 2.5D
isometric café sim inspired by *Moe Girl Cafe 2*. Your verified Rare Friend is the café manager.
Guest Friends are your customers.

The SDK runtime handles wallet connection, owned-Friend selection and the fresh ownership and
generation check. It also supplies the fixed, **simulated** RF action client. This component
has no wallet code, no routes and no identity gate of its own.

## Controls

| Input | Action |
| --- | --- |
| Tap / click a guest | Take their order. If their dish is ready, fetch it and serve it. |
| Tap / click the counter | Pick up every ready dish (up to your carry limit). Carried dishes are delivered automatically. |
| Tap / click the floor | Walk there |
| Tap the capsule machine | Open **Rare Blend Capsules** (simulated RF) |
| WASD / arrow keys | Walk tile by tile |
| E / Space / Enter | Act on whatever is next to you (table, counter, capsule machine) |
| 1–8 | Act on that table's guest |
| C | Pick up at the counter |
| X | Clear your task list |
| Esc | Close a menu |

Tasks queue up, and numbered markers show their order, so you can tap several guests in a row.
The café pauses while any menu or runtime confirmation is open. The ♪ button and Settings
toggle sound (off by default). Settings also has **Reduce motion**, and the game follows the
system `prefers-reduced-motion` setting.

## Rules

- A day lasts **150 seconds** (08:00–20:00 on the café clock). After closing, guests already inside finish, then a day summary appears.
- A guest arrives about every 5 s while a table is free. Arrivals speed up with ambience and rating. Each guest takes a free table.
- **Order patience:** 18 s. **Food patience:** 34 s after ordering. Ambience adds 6% per level. If patience runs out, the guest leaves unhappy and the rating drops.
- **Payment** = dish price × (1 + tip). Tip = 30% × remaining patience fraction + 3% per ambience level + House Blend bonus. The rating is a rolling average: 5 for happy service, 4 for slow service, 1 for a guest who leaves.
- **XP:** +1 per guest served, +1 if they were happy, +2 for a Genesis VIP. Levels unlock dishes and later upgrades.
- The kitchen cooks one dish at a time, plus one more per hired chef. Espresso machine levels cut cook time by 12% each.
- You carry 2 dishes (3 with the Cellular perk). Helper Friends carry 1, and they take orders and deliver on their own.

### Menu (Beans)

| Dish | Price | Cook | Unlock |
| --- | --- | --- | --- |
| Espresso | 8 | 3 s | start |
| Latte ♡ | 12 | 4 s | start |
| Matcha Latte | 16 | 5 s | Lv 2 · 60 |
| Strawberry Mochi | 20 | 6 s | Lv 3 · 120 |
| Fluffy Pancakes | 28 | 8 s | Lv 4 · 200 |
| Omurice (ketchup heart) | 40 | 10 s | Lv 5 · 350 |
| Cloud Parfait | 50 | 9 s | Lv 6 · 500 |
| Silver Latte | 60 | 6 s | while a Silver Roast is kept |
| Moonlight Parfait | 95 | 11 s | while a Moonlight Roast is kept |

### Upgrades (Beans)

| Upgrade | Costs | Level gates |
| --- | --- | --- |
| Tables 4–8 (start with 3) | 45, 90, 160, 250, 380 | Lv 1, 2, 3, 5, 7 |
| Espresso machine Lv 1–5 | 70, 150, 260, 420, 650 | — |
| Ambience Lv 1–5 (monstera, rose rug, paper lanterns, record player, moon chandelier) | 90, 200, 360, 600, 950 | — |
| Helper Friends 1–2 | 140, 380 | Lv 2, 5 |
| Chef Friends 1–2 | 220, 520 | Lv 3, 6 |

**Beans are an in-café soft currency, not RF.** You start with 30. Beans, upgrades and
levels last for the runtime session; reloading starts over (the SDK has no save API).

### Manager family perks

The perk comes from the selected Friend's on-chain Generations family:

| Family | Perk |
| --- | --- |
| Skeleton | Dishes cook 15% faster |
| Mask | Guests tip 10% more |
| Family | Helpers move 25% faster |
| Cellular | Carry one extra dish |
| Asymmetry | 12% chance a guest pays double |
| Hoverer | You move 30% faster (and gently hover) |
| Colossus | Guests are 25% more patient |
| Sparkling | Rating starts half a star higher |
| Hollow | Guests arrive 15% more often |

## Rare Blend Capsules (simulated RF)

Capsules use the SDK's chance-game client (`buy`, `play`, `settle`, `redeem`). Each action is
confirmed in the runtime's own dialog. All RF is **simulated** in the preview. The preview
wallet starts with 20 simulated RF.

| Rule | Exact value |
| --- | --- |
| Capsule price | 1 RF (`1000000000000000000` base units) |
| House Blend | 60% / 6,000 bps · 0.5 RF · kept bonus: +3% tips per bag (max 5) |
| Silver Roast | 28% / 2,800 bps · 1 RF · kept bonus: Silver Latte special |
| Moonlight Roast | 10% / 1,000 bps · 2 RF · kept bonus: Moonlight Parfait + 10% patience |
| Golden Bean | 2% / 200 bps · 5 RF · kept bonus: Genesis VIP guests (18% of arrivals) pay 3× |
| Expected value | 0.88 RF per capsule (12% RF sink) |
| Consumable | One capsule opens into exactly one blend; settlement happens once, with no reroll |
| Backing | Each purchased or pending capsule reserves 5 RF; kept blends reserve their fixed RF value |
| Redemption | Fixed value, no expiry. Redeeming a blend removes its café bonus. |

## Art and credits

- Rendering is all canvas code in this directory: the café, furniture, dish icons and the faded palette. No image files.
- Manager: the selected Friend's **canonical Generations sprites**, read with the SDK's `createFriendReader`.
- Regulars #7730 and #3412: canonical frames copied from FriendSDK v0.1.2 `examples/fishing/sample-sprites.ts` (`regulars.ts`).
- Guest Friends: original procedural 16 × 16 one-bit masks, one archetype per family (`guests.ts`). They are not on-chain token art.
- Sound: FriendSDK procedural sound kit (`createFriendSoundKit`).
- Rare Friends artwork is used under FriendSDK [NOTICE.md](https://github.com/spokesz/friendsdk/blob/v0.1.2/NOTICE.md).
