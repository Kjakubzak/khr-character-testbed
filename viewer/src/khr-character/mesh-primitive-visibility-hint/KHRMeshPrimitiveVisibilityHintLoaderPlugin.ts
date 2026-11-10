import type * as THREE from 'three';
import {
  type GLTF,
  type GLTFLoaderPlugin,
  type GLTFParser,
  type GLTFReference,
} from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { GLTF as GLTFSchema } from '@gltf-transform/core';
import type { KHRMeshPrimitiveVisibilityHint as KHRMeshPrimitiveVisibilityHintSchema } from '../../../../schematypes/KHRMeshPrimitiveVisibilityHint.ts';
import { KHRMeshPrimitiveVisibilityHint } from './KHRMeshPrimitiveVisibilityHint.ts';
import { parseVisibilityHintRoles, warnIfVisibilityHintRequired } from '../visibility-hint/parseVisibilityHintRoles.ts';
import type { KHRMeshPrimitiveVisibilityHintItem } from './KHRMeshPrimitiveVisibilityHintItem.ts';

const EXTENSION_NAME = 'KHR_mesh_primitive_visibility_hint';

/**
 * `GLTFReference` should have a `primitives` property, but it is not currently
 * defined in the Three.js type declaration.
 */
interface GLTFPrimitiveReference extends GLTFReference {
  primitives?: number;
}

export class KHRMeshPrimitiveVisibilityHintLoaderPlugin
  implements GLTFLoaderPlugin {
  public readonly parser: GLTFParser;

  public get name(): string {
    return EXTENSION_NAME;
  }

  public constructor(parser: GLTFParser) {
    this.parser = parser;
  }

  public async afterRoot(gltf: GLTF): Promise<void> {
    gltf.userData.khrMeshPrimitiveVisibilityHint = await this._import(gltf);
  }

  public async _import(gltf: GLTF): Promise<KHRMeshPrimitiveVisibilityHint | null> {
    const json = gltf.parser.json as GLTFSchema.IGLTF;

    if (!json.extensionsUsed?.includes(EXTENSION_NAME)) {
      return null;
    }
    warnIfVisibilityHintRequired(json, EXTENSION_NAME);

    const items: KHRMeshPrimitiveVisibilityHintItem[] = [];
    const parsed = new Map<string, string[] | undefined>();

    for (const scene of gltf.scenes) {
      scene.traverse((object: THREE.Object3D) => {
        const reference = this.parser.associations.get(object) as GLTFPrimitiveReference | undefined;
        if (reference?.meshes == null || reference.primitives == null) {
          return;
        }

        const primitiveDef = json.meshes?.[reference.meshes]?.primitives?.[reference.primitives];
        const extension = primitiveDef?.extensions?.[EXTENSION_NAME] as KHRMeshPrimitiveVisibilityHintSchema | undefined;
        if (extension == null) {
          return;
        }

        // Parse once per primitive definition so a malformed hint warns once, not once per instance.
        const key = `${reference.meshes}/${reference.primitives}`;
        if (!parsed.has(key)) {
          parsed.set(key, parseVisibilityHintRoles(extension, `${EXTENSION_NAME} on mesh #${reference.meshes} primitive #${reference.primitives}`));
        }
        const roles = parsed.get(key);
        if (roles == null) {
          return;
        }

        items.push({
          object,
          roles,
          label: extension.label,
        });
      });
    }

    return new KHRMeshPrimitiveVisibilityHint(items);
  }
}
