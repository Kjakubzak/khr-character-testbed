# VRM 1.0 to KHR Character Compatibility Testbed

This repository is 0b5vr's testbed for checking compatibility between [VRM 1.0](https://github.com/vrm-c/vrm-specification/tree/master/specification/VRMC_vrm-1.0) models and the ongoing [KHR_character](https://github.com/KhronosGroup/glTF/pull/2512) draft extension for glTF.
This repository aims to support the development of the KHR_character extension by applying it to real-world models and verifying its functionality.

## What it contains

- [converter](./converter): A browser and Deno converter that converts VRM 1.0 models to KHR_character glTF files.
- [provisional](./provisional): A collection of provisional documents and prototypes related to the KHR_character extension.
- [schematypes](./schematypes): TypeScript type definitions for the KHR_character extension schema.
- [specification](./specification): A historical public proposal submodule. The current implementation contract is recorded in [normative-contract.json](./normative-contract.json).
- [viewer](./viewer): A Three.js-based web viewer for testing KHR_character models.
    - It contains a sample KHR_character model converted from a VRM 1.0 model: [viewer/src/assets/khr-character-example.glb](./viewer/src/assets/khr-character-example.glb).

## Current contract

The converter and viewer follow the normative branch at
[`9dc0781cebd1a24a0869aa98d2a3b902754ecd92`](https://github.com/Kjakubzak/glTF-private/commit/9dc0781cebd1a24a0869aa98d2a3b902754ecd92).
This includes expression input mappings, shared targets, and cumulative ancestor
visibility. The public `specification/glTF` submodule and dated `provisional`
documents remain historical references; they do not define the current wire format.

- `KHR_character` is a marker; conversion preserves multiple scene roots.
- `vrm1_humanoid` and `vrm1_expressions` are exact identifiers. Array and node
  indices identify targets; optional names are independent labels.
- `expressionSetMappings` maps external inputs to native expression indices.
  Shared non-additive targets use an explicit viewer composition policy.
- Suppressions use `KHR_character_expression_suppression`; UV responses use
  `KHR_character_expression_texture_transform`. Authored morph and UV neutral
  samples are retained.
- Each ancestor visibility hint contributes a local AND predicate. Primitive
  hints and actual `KHR_node_visibility` also apply. Rendering scopes restore
  authored visibility; animation and camera transforms keep updating.
- Camera hints expose the scale-free global initial frame. `targetNode` does
  not rotate that frame; singular transforms produce no initial pose.

## What it currently supports

Following extensions are supported in this testbed:

- [x] [`KHR_character`](https://github.com/Kjakubzak/glTF-private/tree/9dc0781cebd1a24a0869aa98d2a3b902754ecd92/extensions/2.0/Khronos/KHR_character)
- [x] [`KHR_character_expression`](https://github.com/Kjakubzak/glTF-private/tree/9dc0781cebd1a24a0869aa98d2a3b902754ecd92/extensions/2.0/Khronos/KHR_character_expression)
- [x] [`KHR_character_expression_joint`](https://github.com/Kjakubzak/glTF-private/tree/9dc0781cebd1a24a0869aa98d2a3b902754ecd92/extensions/2.0/Khronos/KHR_character_expression_joint)
- [x] [`KHR_character_expression_mapping`](https://github.com/Kjakubzak/glTF-private/tree/9dc0781cebd1a24a0869aa98d2a3b902754ecd92/extensions/2.0/Khronos/KHR_character_expression_mapping)
- [x] [`KHR_character_expression_suppression`](https://github.com/Kjakubzak/glTF-private/tree/9dc0781cebd1a24a0869aa98d2a3b902754ecd92/extensions/2.0/Khronos/KHR_character_expression_suppression)
- [x] [`KHR_character_expression_morphtarget`](https://github.com/Kjakubzak/glTF-private/tree/9dc0781cebd1a24a0869aa98d2a3b902754ecd92/extensions/2.0/Khronos/KHR_character_expression_morphtarget)
- [x] [`KHR_character_expression_texture_transform`](https://github.com/Kjakubzak/glTF-private/tree/9dc0781cebd1a24a0869aa98d2a3b902754ecd92/extensions/2.0/Khronos/KHR_character_expression_texture_transform)
- [ ] [`KHR_character_reference_pose`](https://github.com/Kjakubzak/glTF-private/tree/9dc0781cebd1a24a0869aa98d2a3b902754ecd92/extensions/2.0/Khronos/KHR_character_reference_pose)
- [x] [`KHR_character_skeleton_mapping`](https://github.com/Kjakubzak/glTF-private/tree/9dc0781cebd1a24a0869aa98d2a3b902754ecd92/extensions/2.0/Khronos/KHR_character_skeleton_mapping)
- [x] [`KHR_mesh_primitive_visibility_hint`](https://github.com/Kjakubzak/glTF-private/tree/9dc0781cebd1a24a0869aa98d2a3b902754ecd92/extensions/2.0/Khronos/KHR_mesh_primitive_visibility_hint)
- [x] [`KHR_node_camera_hint`](https://github.com/Kjakubzak/glTF-private/tree/9dc0781cebd1a24a0869aa98d2a3b902754ecd92/extensions/2.0/Khronos/KHR_node_camera_hint)
- [ ] [`KHR_node_lookat_target`](https://github.com/Kjakubzak/glTF-private/tree/9dc0781cebd1a24a0869aa98d2a3b902754ecd92/extensions/2.0/Khronos/KHR_node_lookat_target)
- [x] [`KHR_node_visibility`](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_node_visibility)
- [x] [`KHR_node_visibility_hint`](https://github.com/Kjakubzak/glTF-private/tree/9dc0781cebd1a24a0869aa98d2a3b902754ecd92/extensions/2.0/Khronos/KHR_node_visibility_hint)
- [x] [`VRMC_character_expression_lookat`](./provisional/20260319_VRMC_character_expression_lookat/README.md)

## Local checks

Use Node 22.23 or later. In each of `converter` and `viewer`, run `npm ci`,
`npm test`, and `npm run build`. The converter also provides `npm run check`.
Run `npm run dev` in either directory for its local UI. CI runs these checks on
branches and pull requests; Pages deploys only after a push to `main`.

## Quick links

- [Web converter](https://0b5vr.github.io/khr-character-testbed/converter/dist/)
- [Web viewer](https://0b5vr.github.io/khr-character-testbed/viewer/dist/)

## License

[Apache License 2.0](./LICENSE)
