/**
 * Permission helper for the renderer.
 *
 * Mirrors the backend's `hasPermission` logic: admins pass everything;
 * non-admins need either a wildcard grant or a resource-scoped grant when a
 * resource is requested.
 *
 * Keep both sides in sync — if the model changes here, change it in
 * backend/src/services/permissions.ts too.
 */
import type { Permission, User } from "@shared/types";

export type Feature = Permission["feature"];

export function hasPermission(
  user: User | null,
  permissions: Permission[],
  feature: Feature,
  resourceId?: string,
): boolean {
  if (!user) return false;
  if (user.is_admin) return true;
  for (const p of permissions) {
    if (p.feature !== feature) continue;
    if (resourceId === undefined) {
      if (p.resource_id === null) return true;
    } else {
      if (p.resource_id === null || p.resource_id === resourceId) return true;
    }
  }
  return false;
}
