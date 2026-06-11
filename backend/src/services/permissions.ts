/**
 * Permissions service.
 *
 * Model: rows in `permissions` represent grants. No row = no access.
 * Admins are exempt — every check returns true for them without hitting the
 * table.
 *
 * Feature ids are short strings. Anywhere we'd inline a literal twice, we
 * use the FEATURES constant instead to avoid typos.
 *
 * `resource_id` lets a single feature be scoped: e.g. (`lighting`, NULL) grants
 * every room, while (`lighting`, "room-uuid") grants one. A NULL row makes any
 * scoped check pass automatically — see `hasPermission`.
 */
import { db } from "../db/index.js";
import { newId } from "./auth.js";

export const FEATURES = {
  CHAT: "chat",
  LIGHTING: "lighting",
  GROUP_CHAT: "group_chat",
  CAMERAS: "cameras",
} as const;

export type FeatureId = (typeof FEATURES)[keyof typeof FEATURES];

export interface Permission {
  id: string;
  user_id: string;
  feature: string;
  resource_id: string | null;
  created_at: number;
}

const stmts = {
  insert: db.prepare(`
    INSERT OR IGNORE INTO permissions (id, user_id, feature, resource_id, created_at)
    VALUES (?, ?, ?, ?, ?)
  `),
  deleteOne: db.prepare(`
    DELETE FROM permissions
    WHERE user_id = ? AND feature = ?
      AND ((resource_id IS NULL AND ? IS NULL) OR resource_id = ?)
  `),
  deleteAllForUserFeature: db.prepare(`
    DELETE FROM permissions WHERE user_id = ? AND feature = ?
  `),
  listForUser: db.prepare(`
    SELECT id, user_id, feature, resource_id, created_at
    FROM permissions WHERE user_id = ?
  `),
  hasFeatureWildcard: db.prepare(`
    SELECT 1 FROM permissions
    WHERE user_id = ? AND feature = ? AND resource_id IS NULL
    LIMIT 1
  `),
  hasFeatureResource: db.prepare(`
    SELECT 1 FROM permissions
    WHERE user_id = ? AND feature = ?
      AND (resource_id IS NULL OR resource_id = ?)
    LIMIT 1
  `),
  isAdmin: db.prepare(`SELECT is_admin FROM users WHERE id = ?`),
};

function isAdminUser(userId: string): boolean {
  const row = stmts.isAdmin.get(userId) as { is_admin: number } | undefined;
  return !!row?.is_admin;
}

export function grantPermission(
  userId: string,
  feature: FeatureId,
  resourceId: string | null = null,
): Permission {
  // If a wildcard already exists, granting a specific resource is redundant.
  // We still insert it (UNIQUE prevents duplicates), but a wildcard check
  // covers it for free.
  const id = newId();
  const now = Date.now();
  stmts.insert.run(id, userId, feature, resourceId, now);
  return { id, user_id: userId, feature, resource_id: resourceId, created_at: now };
}

export function revokePermission(
  userId: string,
  feature: FeatureId,
  resourceId: string | null = null,
): void {
  stmts.deleteOne.run(userId, feature, resourceId, resourceId);
}

/**
 * Replace a user's grants for one feature with a fresh list. Pass:
 *  - resourceIds: [] to deny everything
 *  - resourceIds: [null] to grant the wildcard (all resources)
 *  - resourceIds: ["a", "b"] to grant only those specific resources
 *
 * One transaction so the admin UI sees an atomic update.
 */
export function setUserFeaturePermissions(
  userId: string,
  feature: FeatureId,
  resourceIds: Array<string | null>,
): void {
  const tx = db.transaction(() => {
    stmts.deleteAllForUserFeature.run(userId, feature);
    const now = Date.now();
    for (const rid of resourceIds) {
      stmts.insert.run(newId(), userId, feature, rid, now);
    }
  });
  tx();
}

export function listUserPermissions(userId: string): Permission[] {
  return stmts.listForUser.all(userId) as Permission[];
}

/**
 * Does this user have permission to use a feature?
 *
 * If `resourceId` is given (e.g. a specific Hue room), the user passes when
 * they have either a wildcard grant or a grant for that exact resource. If
 * `resourceId` is omitted, only a wildcard grant counts — that's used for
 * features that aren't scoped (`chat`, `group_chat`).
 */
export function hasPermission(
  userId: string,
  feature: FeatureId,
  resourceId?: string,
): boolean {
  if (isAdminUser(userId)) return true;
  if (resourceId === undefined) {
    return !!stmts.hasFeatureWildcard.get(userId, feature);
  }
  return !!stmts.hasFeatureResource.get(userId, feature, resourceId);
}
