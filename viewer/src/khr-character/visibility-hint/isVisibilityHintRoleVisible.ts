export type ViewTags = string | Iterable<string>;

export interface VisibilityRoleOptions {
  resolveCustomRole?: (role: string, tags: ReadonlySet<string>) => boolean | undefined;
  renderUnsupportedRoles?: boolean;
}

/** Evaluate one local hint. Tags and roles are exact, case-sensitive strings. */
export function isVisibilityHintRoleVisible(
  role: string | undefined, view: ViewTags, options: VisibilityRoleOptions = {},
): boolean {
  const tags = new Set(typeof view === 'string' ? [view] : view);
  if (role == null || role === 'always') return true;
  if (role === 'first_person' || role === 'third_person') return tags.has(role);
  return options.resolveCustomRole?.(role, tags) ?? options.renderUnsupportedRoles ?? false;
}
