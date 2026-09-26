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

/** Owned Friend IDs other than the manager, or null when the roster does not belong to the manager's wallet. */
export function parseStaffRoster(ids: unknown, managerId: bigint, limit = 40): number[] | null {
  if (!Array.isArray(ids)) return null;
  const clean = [...new Set(ids.map(id => typeof id === "string" && /^[0-9]{1,15}$/.test(id) ? Number(id) : NaN))].filter(id => Number.isSafeInteger(id) && id > 0);
  if (!clean.includes(Number(managerId))) return null;
  return clean.filter(id => id !== Number(managerId)).slice(0, limit);
}
