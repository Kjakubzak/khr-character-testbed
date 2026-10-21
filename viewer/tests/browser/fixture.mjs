import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));

export function createFixture() {
  const pieces = [];
  const bufferViews = [];
  const accessors = [];
  let length = 0;
  function floats(values, type, count, min, max) {
    const data = Buffer.alloc(values.length * 4);
    values.forEach((value, index) => data.writeFloatLE(value, index * 4));
    bufferViews.push({ buffer: 0, byteOffset: length, byteLength: data.length });
    pieces.push(data); length += data.length;
    accessors.push({ bufferView: bufferViews.length - 1, componentType: 5126, type, count,
      ...(min ? { min, max } : {}) });
    return accessors.length - 1;
  }
  const position = floats([-.25,-.25,0, .25,-.25,0, .25,.25,0, -.25,-.25,0, .25,.25,0, -.25,.25,0],
    'VEC3', 6, [-.25,-.25,0], [.25,.25,0]);
  const morphPosition = floats(new Array(18).fill(0), 'VEC3', 6, [0,0,0], [0,0,0]);
  const time = floats([0, 1], 'SCALAR', 2, [0], [1]);
  const translation = floats([0,0,0, 1,0,0], 'VEC3', 2);
  bufferViews.push({ buffer: 0, byteOffset: length, byteLength: 2 });
  accessors.push({ bufferView: bufferViews.length - 1, componentType: 5121, type: 'SCALAR', count: 2 });
  const visible = accessors.length - 1; pieces.push(Buffer.from([0, 1, 0, 0])); length += 4;
  const animation = () => ({ samplers: [{ input: time, output: translation, interpolation: 'LINEAR' }],
    channels: [{ sampler: 0, target: { node: 2, path: 'translation' } }] });
  const json = {
    asset: { version: '2.0', generator: 'Normative browser integration fixture' },
    scene: 0, scenes: [{ nodes: [0, 3, 6] }],
    nodes: [
      { name: 'ThirdAncestor', children: [1], extensions: { KHR_node_visibility_hint: { role: 'third_person' } } },
      { name: 'AlwaysDescendant', children: [2], extensions: { KHR_node_visibility_hint: { role: 'always' } } },
      { name: 'ExpressionMesh', mesh: 0, extensions: { KHR_node_visibility_hint: { role: 'first_person' } } },
      { name: 'CoreFalse', children: [4, 5], extensions: { KHR_node_visibility: { visible: false } } },
      { name: 'CoreTrueChild', mesh: 0, translation: [-1,0,0], extensions: { KHR_node_visibility: { visible: true } } },
      { name: 'CameraUnderCoreFalse', camera: 0 },
      { name: 'UnknownAncestor', children: [7], extensions: { KHR_node_visibility_hint: { role: 'ACME_preview' } } },
      { name: 'CustomMesh', mesh: 0, translation: [1,0,0] },
    ],
    meshes: [{ primitives: [{ attributes: { POSITION: position }, material: 0,
      extensions: { KHR_mesh_primitive_visibility_hint: { role: 'always' } } }] }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [1,0,0,1] }, doubleSided: true,
      extensions: { KHR_materials_unlit: {} } }],
    cameras: [{ type: 'perspective', perspective: { yfov: .6, znear: .1 } }],
    animations: [animation(), animation(), { name: 'CoreVisibility',
      samplers: [{ input: time, output: visible, interpolation: 'STEP' }],
      channels: [{ sampler: 0, target: { path: 'pointer', extensions: {
        KHR_animation_pointer: { pointer: '/nodes/3/extensions/KHR_node_visibility/visible' },
      } } }],
    }], accessors, bufferViews, buffers: [{ byteLength: length }],
    extensionsUsed: ['KHR_materials_unlit', 'KHR_character', 'KHR_character_expression',
      'KHR_character_expression_joint', 'KHR_character_expression_mapping', 'KHR_node_visibility_hint',
      'KHR_mesh_primitive_visibility_hint', 'KHR_node_visibility', 'KHR_animation_pointer'],
    extensions: {
      KHR_character: {},
      KHR_character_expression: { expressions: [
        { name: 'MoveA', animation: 0, extensions: { KHR_character_expression_joint: { channels: [0] } } },
        { name: 'MoveB', animation: 1, extensions: { KHR_character_expression_joint: { channels: [0] } } },
      ] },
      KHR_character_expression_mapping: { expressionSetMappings: { demo_v1: {
        Together: [{ source: 0, weight: .5, name: 'independent' }, { source: 1, weight: .5, name: '' }],
      } } },
    },
  };
  const bin = Buffer.concat(pieces);
  function glb(document) {
    const encoded = Buffer.from(JSON.stringify(document));
    const padded = Buffer.alloc((encoded.length + 3) & ~3, 0x20); encoded.copy(padded);
    const result = Buffer.alloc(28 + padded.length + bin.length);
    result.writeUInt32LE(0x46546c67, 0); result.writeUInt32LE(2, 4); result.writeUInt32LE(result.length, 8);
    result.writeUInt32LE(padded.length, 12); result.writeUInt32LE(0x4e4f534a, 16); padded.copy(result, 20);
    result.writeUInt32LE(bin.length, 20 + padded.length); result.writeUInt32LE(0x004e4942, 24 + padded.length);
    bin.copy(result, 28 + padded.length); return result;
  }
  fs.mkdirSync(path.join(directory, 'fixtures'), { recursive: true });
  const output = path.join(directory, 'fixtures/integration.glb'); fs.writeFileSync(output, glb(json));
  // A complete humanoid vocabulary and a morph expression exercise VRM-specific conversion in CI.
  const vrm = structuredClone(json);
  const humanBones = {};
  function bone(role, translation, parentRole) {
    const node = vrm.nodes.length; vrm.nodes.push({ name: role, translation }); humanBones[role] = { node };
    if (parentRole) (vrm.nodes[humanBones[parentRole].node].children ??= []).push(node);
    else vrm.scenes[0].nodes.push(node);
  }
  bone('hips', [0,1,0]); bone('spine', [0,.15,0], 'hips'); bone('chest', [0,.15,0], 'spine');
  bone('neck', [0,.15,0], 'chest'); bone('head', [0,.15,0], 'neck');
  for (const side of ['left', 'right']) {
    const sign = side === 'left' ? 1 : -1;
    bone(side + 'UpperArm', [sign * .2,.1,0], 'chest');
    bone(side + 'LowerArm', [sign * .3,0,0], side + 'UpperArm');
    bone(side + 'Hand', [sign * .25,0,0], side + 'LowerArm');
    bone(side + 'UpperLeg', [sign * .1,-.1,0], 'hips');
    bone(side + 'LowerLeg', [0,-.4,0], side + 'UpperLeg');
    bone(side + 'Foot', [0,-.4,.1], side + 'LowerLeg');
  }
  vrm.nodes[2].name = 'Face'; vrm.nodes[2].weights = [.25];
  vrm.meshes[0].primitives[0].targets = [{ POSITION: morphPosition }];
  delete vrm.meshes[0].primitives[0].extensions;
  for (const node of vrm.nodes) if (node.extensions) delete node.extensions.KHR_node_visibility_hint;
  vrm.extensionsUsed = ['KHR_materials_unlit', 'KHR_node_visibility', 'KHR_animation_pointer', 'VRMC_vrm'];
  vrm.extensions = { VRMC_vrm: { specVersion: '1.0',
    meta: { name: 'Browser fixture', version: '1', authors: ['Normative testbed'], licenseUrl: 'https://vrm.dev/licenses/1.0/' },
    humanoid: { humanBones }, expressions: { preset: { happy: {
      morphTargetBinds: [{ node: 2, index: 0, weight: .8 }],
    } } },
  } };
  const converterInput = path.join(directory, 'fixtures/converter-input.vrm'); fs.writeFileSync(converterInput, glb(vrm));
  return { output, converterInput, json };
}
