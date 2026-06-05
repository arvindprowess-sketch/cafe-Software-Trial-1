// Multi-store real-time room helper.
//
// The backend emits a store's order events to per-store rooms
// (`kitchen:<store_id>`, `cashier:<store_id>`, `manager:<store_id>`) plus the
// global `hq` room. A staff client must join only the rooms for its own
// store(s) so it never receives other stores' events.

type RoomUser = {
  role: string;
  store_id?: string | null;
  cluster_store_ids?: string[] | null;
} | null;

/**
 * Rooms a panel page should join for the given channel ('kitchen' | 'cashier').
 * - HQ super-admin (or legacy admin): the global `hq` room (sees every store).
 * - area_manager: the channel room for each store in its cluster.
 * - store-bound staff: the channel room for its single store.
 * Falls back to the bare channel name for legacy/un-migrated users.
 */
export function roomsForUser(user: RoomUser, channel: 'kitchen' | 'cashier'): string[] {
  if (!user) return [channel];
  if (user.role === 'super_admin' || user.role === 'admin') return ['hq'];
  if (user.role === 'area_manager') {
    const ids = user.cluster_store_ids || [];
    return ids.length ? ids.map((id) => `${channel}:${id}`) : ['hq'];
  }
  return user.store_id ? [`${channel}:${user.store_id}`] : [channel];
}
