import type { GLTF as GLTFSchema } from '@gltf-transform/core';

/**
 * Read `roles` from a visibility hint extension object. Returns undefined, with
 * a warning, when the value is not a nonempty array of nonempty strings (for
 * example a pre-normative single `role`); such a hint is ignored and imposes
 * no restriction. Duplicate roles are reported and removed.
 */
export function parseVisibilityHintRoles(extension: unknown, where: string): string[] | undefined {
  const roles = (extension as { roles?: unknown } | null)?.roles;
  if (!Array.isArray(roles) || roles.length === 0
    || !roles.every((role): role is string => typeof role === 'string' && role.length > 0)) {
    const legacy = (extension as { role?: unknown } | null)?.role !== undefined ? ' (found a single "role"; expected "roles")' : '';
    console.warn(`${where}: "roles" must be a nonempty array of nonempty strings${legacy}. Ignoring this hint.`);
    return undefined;
  }
  const unique = [...new Set(roles)];
  if (unique.length !== roles.length) console.warn(`${where}: "roles" contains duplicates.`);
  return unique;
}

/** Visibility hint extensions MUST NOT be listed in extensionsRequired; report it and continue. */
export function warnIfVisibilityHintRequired(json: GLTFSchema.IGLTF, extensionName: string): void {
  if (json.extensionsRequired?.includes(extensionName)) {
    console.warn(`${extensionName} must not be listed in extensionsRequired. Loading continues.`);
  }
}
