/**
 * The roles that apply in one render view, as decided by the application's
 * logic. Roles are exact, case-sensitive strings. `always` applies in every
 * view and does not need to be listed.
 */
export type ViewTags = string | Iterable<string>;

/** Standard visibility roles an application can have logic for (`always` needs none). */
export const STANDARD_VIEW_ROLES: readonly string[] = ['first_person', 'third_person'];

export interface VisibilityRoleOptions {
  /**
   * Standard roles (`first_person`, `third_person`) the application has logic
   * for. A standard role without logic applies in every view. Defaults to
   * both; pass `[]` for an application with no visibility-role logic.
   */
  standardRolesWithLogic?: Iterable<string>;
  /**
   * Custom roles the application recognizes. A recognized custom role applies
   * in a view when it is among that view's roles. Unrecognized custom roles
   * are ignored. Defaults to none.
   */
  recognizedCustomRoles?: Iterable<string>;
}

/**
 * Evaluate one local hint (KHR_node_visibility_hint or
 * KHR_mesh_primitive_visibility_hint) for one view.
 *
 * - No hint, or a hint whose roles include `always`: no restriction.
 * - OR within the hint: it allows the view when at least one recognized role
 *   applies there. A standard role without application logic applies in
 *   every view.
 * - Unrecognized custom roles are ignored; a hint with no recognized role
 *   imposes no restriction.
 *
 * Callers AND the result across ancestors, with primitive hints and with
 * KHR_node_visibility.
 */
export function isVisibilityHintRoleVisible(
  roles: readonly string[] | undefined, view: ViewTags, options: VisibilityRoleOptions = {},
): boolean {
  if (roles == null) return true;
  const applied = new Set(typeof view === 'string' ? [view] : view);
  const withLogic = new Set(options.standardRolesWithLogic ?? STANDARD_VIEW_ROLES);
  const customs = new Set(options.recognizedCustomRoles ?? []);
  let anyRecognized = false;
  for (const role of roles) {
    if (role === 'always') return true;
    if (STANDARD_VIEW_ROLES.includes(role)) {
      if (!withLogic.has(role) || applied.has(role)) return true;
      anyRecognized = true;
    } else if (customs.has(role)) {
      if (applied.has(role)) return true;
      anyRecognized = true;
    }
  }
  return !anyRecognized;
}
