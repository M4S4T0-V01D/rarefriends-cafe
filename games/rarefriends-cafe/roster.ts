/**
 * Messages between the sandboxed game and its trusted host page (host/runtime.tsx).
 *
 * - The game asks with HOST_HELLO. The host answers with HOST_STATE: the connected account's eligible Friend IDs
 *   (found with the SDK's `readOwnedFriends`) and that wallet's saved progress from the host page's localStorage.
 * - The game sends SAVE_WRITE with its progress; the host stores it under the connected wallet address.
 *
 * The game accepts HOST_STATE only from its parent window, and only when the roster contains the runtime-verified
 * manager, so roster and save belong to the same wallet. It writes saves only after such a confirmation.
 */
export const HOST_HELLO = "rarefriends-cafe:hello";
export const HOST_STATE = "rarefriends-cafe:state";
export const SAVE_WRITE = "rarefriends-cafe:save";

/** One roster entry per owned Friend: `"<token id>:<generation>"` (generation 1 is the top worker tier). */
export type RosterFriend = { id: number; generation: number | null };
/**
 * Parse the host's roster. Returns the manager's generation and the other owned Friends, or null when the roster
 * does not belong to the manager's wallet (the verified manager must be listed).
 */
export function parseStaffRoster(ids: unknown, managerId: bigint, limit = 40): { manager: number | null; staff: RosterFriend[] } | null {
  if (!Array.isArray(ids)) return null;
  const seen = new Set<number>(), friends: RosterFriend[] = [];
  for (const entry of ids) {
    const match = typeof entry === "string" ? /^([0-9]{1,15})(?::([0-9]{1,3}))?$/.exec(entry) : null;
    if (!match) continue;
    const id = Number(match[1]), generation = match[2] === undefined ? null : Number(match[2]);
    if (!Number.isSafeInteger(id) || id < 1 || seen.has(id)) continue;
    seen.add(id); friends.push({ id, generation: generation !== null && generation >= 1 && generation <= 255 ? generation : null });
  }
  const managerEntry = friends.find(friend => friend.id === Number(managerId));
  if (!managerEntry) return null;
  return { manager: managerEntry.generation, staff: friends.filter(friend => friend !== managerEntry).slice(0, limit) };
}

/**
 * Sharing the end-of-day card. The sandbox can't copy, download or open tabs, so on a click the game sends
 * SHARE_REQUEST (action, post text, PNG blob) and the trusted host performs it, replying with SHARE_RESULT.
 */
export const SHARE_REQUEST = "rarefriends-cafe:share";
export const SHARE_RESULT = "rarefriends-cafe:share-result";
export type ShareAction = "post" | "copy" | "save";
export type ShareOutcome = "shared" | "copied-and-opened" | "saved-and-opened" | "copied" | "saved" | "cancelled" | "failed";
