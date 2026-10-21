import type { GLTF, GLTFLoaderPlugin, GLTFParser, GLTFReference } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { GLTF as GLTFSchema } from '@gltf-transform/core';
import { BooleanKeyframeTrack } from 'three';

/** Core Boolean visibility controls draw traversal without disabling node transforms or cameras. */
export class KHRCoreNodeVisibilityLoaderPlugin implements GLTFLoaderPlugin {
  public readonly name = 'KHR_node_visibility';
  public readonly parser: GLTFParser;
  public constructor(parser: GLTFParser) { this.parser = parser; }

  public async afterRoot(gltf: GLTF): Promise<void> {
    // The pointer helper maps Uint8Array values with Boolean(), which retains
    // numeric 0/1. Three.js draw traversal requires the actual boolean false.
    for (const clip of gltf.animations ?? []) {
      clip.tracks = clip.tracks.map((track) => track.ValueTypeName === 'bool'
        ? new BooleanKeyframeTrack(track.name, track.times, Array.from(track.values, Boolean))
        : track);
    }
    const json = this.parser.json as GLTFSchema.IGLTF;
    for (const scene of gltf.scenes) scene.traverse((object) => {
      const index = (this.parser.associations.get(object) as (GLTFReference & { nodes?: number }) | undefined)?.nodes;
      if (index == null) return;
      const extension = json.nodes?.[index].extensions?.[this.name] as { visible?: boolean } | undefined;
      if (extension != null) object.visible = extension.visible ?? true;
    });
  }
}
