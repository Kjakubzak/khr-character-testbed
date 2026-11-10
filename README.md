# VRM 1.0 to KHR Character Compatibility Testbed

This repository is 0b5vr's testbed for checking compatibility between [VRM 1.0](https://github.com/vrm-c/vrm-specification/tree/master/specification/VRMC_vrm-1.0) models and the ongoing [KHR_character](https://github.com/KhronosGroup/glTF/pull/2512) draft extension for glTF.
This repository aims to support the development of the KHR_character extension by applying it to real-world models and verifying its functionality.

## What it contains

- [converter](./converter): A browser and Deno converter that converts VRM 1.0 models to KHR_character glTF files.
- [provisional](./provisional): A collection of provisional documents and prototypes related to the KHR_character extension.
- [schematypes](./schematypes): TypeScript type definitions for the KHR_character extension schema.
- [specification](./specification): The public specification submodule, pinned to the normative revision recorded in [normative-contract.json](./normative-contract.json).
- [viewer](./viewer): A Three.js-based web viewer for testing KHR_character models.
    - It contains a sample KHR_character model converted from a VRM 1.0 model: [viewer/src/assets/khr-character-example.glb](./viewer/src/assets/khr-character-example.glb).

## Current contract

The converter and viewer follow the normative revision 314c95c5, published as
[`Kjakubzak/glTF@7ab5368a`](https://github.com/Kjakubzak/glTF/tree/7ab5368a87d1d303dff33ec5f9aad42752e84c78/extensions/2.0/Khronos)
for [KhronosGroup/glTF#2512](https://github.com/KhronosGroup/glTF/pull/2512).
The `specification/glTF` submodule is pinned to that commit. The dated
`provisional` documents remain historical references; they do not define the
current wire format.

- `KHR_character` is a marker; conversion preserves multiple scene roots.
- `vrm1_humanoid` and `vrm1_expressions` are exact identifiers. Array and node
  indices identify targets; optional names are independent labels.
- `expressionSetMappings` maps external inputs to native expression indices.
- Suppressions use `KHR_character_expression_suppression`: all attenuation
  contributions to a target are summed and clamped,
  `v = u * (1 - clamp(sum, 0, 1))`; `blend` adds `amount * u[source]`, `block`
  adds `amount` when `u[source] > threshold`, and a custom type adds 0 (no
  companion extensions are supported). Targets resolve by index; a
  suppression's `name` is never used.
- UV responses use `KHR_character_expression_texture_transform`. Authored morph
  and UV neutral samples are retained.
- Composition choices for shared targets: translation, morph weights and UV
  offset/rotation use the required `b + sum(s - n)`. Node scale and UV scale use
  the same formula per component (recommended by the joint and texture-transform
  extensions). Node rotation adds each response's change from its own neutral
  sample, `delta = s * n^-1`, pre-multiplied in ascending entry order; this is
  approximately additive for small rotations (10 degrees right plus 10 degrees up
  gives about 10 degrees each; two 10-degree turns about one axis give 20
  degrees). At runtime the total change is applied onto the live base rotation.
  Boolean and integer targets use the highest active entry index.
- Visibility hints carry a `roles` array. A hint allows a view when any
  recognized role applies there (OR); `always`, a standard role the viewer has
  no logic for, or a hint with no recognized role imposes no restriction, and
  unrecognized custom roles are ignored. Each ancestor hint, the primitive hint
  and actual `KHR_node_visibility` are ANDed. The viewer's logic applies
  `first_person` in its first-person view and `third_person` otherwise; its
  `no_role_logic` option shows an application without role logic. The hints
  are never written to `extensionsRequired`. Rendering scopes restore authored
  visibility; animation and camera transforms keep updating.
- Reference poses: every animation tagged with `KHR_character_reference_pose`
  is validated and exposed with its `poseType` (`t_pose`, `a_pose`, `i_pose` or
  a custom label) and its resolved per-node values; untargeted nodes and
  properties use authored values, never the live state. The viewer's
  "Reference Pose" menu previews a pose while rendering and restores the live
  state afterwards. When a `t_pose` is tagged, VRM animation retargeting reads
  its rest data from it. The converter emits a `t_pose` from the VRM rest pose,
  which VRM 1.0 defines as the VRM T-pose facing +Z.
- Look-at targets: every `KHR_node_lookat_target` marker is exposed with its
  optional `hint` and its instances; the target point is each instance's global
  translation. The viewer's "Look-at Targets" toggle shows them as a debug
  overlay. Markers have no other effect.
- Camera hints expose the scale-free global initial frame. `targetNode` does
  not rotate that frame; singular transforms produce no initial pose.

## What it currently supports

Following extensions are supported in this testbed:

- [x] [`KHR_character`](https://github.com/Kjakubzak/glTF/tree/7ab5368a87d1d303dff33ec5f9aad42752e84c78/extensions/2.0/Khronos/KHR_character)
- [x] [`KHR_character_expression`](https://github.com/Kjakubzak/glTF/tree/7ab5368a87d1d303dff33ec5f9aad42752e84c78/extensions/2.0/Khronos/KHR_character_expression)
- [x] [`KHR_character_expression_joint`](https://github.com/Kjakubzak/glTF/tree/7ab5368a87d1d303dff33ec5f9aad42752e84c78/extensions/2.0/Khronos/KHR_character_expression_joint)
- [x] [`KHR_character_expression_mapping`](https://github.com/Kjakubzak/glTF/tree/7ab5368a87d1d303dff33ec5f9aad42752e84c78/extensions/2.0/Khronos/KHR_character_expression_mapping)
- [x] [`KHR_character_expression_suppression`](https://github.com/Kjakubzak/glTF/tree/7ab5368a87d1d303dff33ec5f9aad42752e84c78/extensions/2.0/Khronos/KHR_character_expression_suppression)
- [x] [`KHR_character_expression_morphtarget`](https://github.com/Kjakubzak/glTF/tree/7ab5368a87d1d303dff33ec5f9aad42752e84c78/extensions/2.0/Khronos/KHR_character_expression_morphtarget)
- [x] [`KHR_character_expression_texture_transform`](https://github.com/Kjakubzak/glTF/tree/7ab5368a87d1d303dff33ec5f9aad42752e84c78/extensions/2.0/Khronos/KHR_character_expression_texture_transform)
- [x] [`KHR_character_reference_pose`](https://github.com/Kjakubzak/glTF/tree/7ab5368a87d1d303dff33ec5f9aad42752e84c78/extensions/2.0/Khronos/KHR_character_reference_pose)
- [x] [`KHR_character_skeleton_mapping`](https://github.com/Kjakubzak/glTF/tree/7ab5368a87d1d303dff33ec5f9aad42752e84c78/extensions/2.0/Khronos/KHR_character_skeleton_mapping)
- [x] [`KHR_mesh_primitive_visibility_hint`](https://github.com/Kjakubzak/glTF/tree/7ab5368a87d1d303dff33ec5f9aad42752e84c78/extensions/2.0/Khronos/KHR_mesh_primitive_visibility_hint)
- [x] [`KHR_node_camera_hint`](https://github.com/Kjakubzak/glTF/tree/7ab5368a87d1d303dff33ec5f9aad42752e84c78/extensions/2.0/Khronos/KHR_node_camera_hint)
- [x] [`KHR_node_lookat_target`](https://github.com/Kjakubzak/glTF/tree/7ab5368a87d1d303dff33ec5f9aad42752e84c78/extensions/2.0/Khronos/KHR_node_lookat_target)
- [x] [`KHR_node_visibility`](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_node_visibility)
- [x] [`KHR_node_visibility_hint`](https://github.com/Kjakubzak/glTF/tree/7ab5368a87d1d303dff33ec5f9aad42752e84c78/extensions/2.0/Khronos/KHR_node_visibility_hint)
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
