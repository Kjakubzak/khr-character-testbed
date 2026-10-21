import { appendKHRCharacter } from './appendKHRCharacter.ts';
import { appendKHRCharacterSkeleton } from './appendKHRCharacterSkeleton.ts';
import { appendKHRNodeCameraHint } from './appendKHRNodeCameraHint.ts';
import { appendKHRNodeVisibilityHint } from './appendKHRNodeVisibilityHint.ts';
import { appendKHRXmpJsonLd } from './appendKHRXmpJsonLd.ts';
import { appendVRMCCharacterExpressionLookat } from './appendVRMCCharacterExpressionLookat.ts';
import { collectNodeBoneMap } from './collectNodeBoneMap.ts';
import { constructGLB } from './constructGLB.ts';
import { appendKHRCharacterExpression } from './expressions/appendKHRCharacterExpression.ts';
import { extractGLB } from './extractGLB.ts';
import { logVerbose } from './logVerbose.ts';
import { type ConvertVRMToKHRCharacterOptions } from './ConvertVRMToKHRCharacterOptions.ts';
import { type ConvertVRMToKHRCharacterResult } from './ConvertVRMToKHRCharacterResult.ts';
import { type GLBInput } from './GLBInput.ts';

function toUint8Array(input: GLBInput): Uint8Array {
  return input instanceof Uint8Array ? input : new Uint8Array(input);
}

function presentExtensions(value: unknown, result = new Set<string>()): Set<string> {
  if (value == null || typeof value !== 'object') return result;
  if (!Array.isArray(value)) {
    const extensions = (value as { extensions?: Record<string, unknown> }).extensions;
    if (extensions && typeof extensions === 'object') Object.keys(extensions).forEach((name) => result.add(name));
  }
  for (const child of Object.values(value)) presentExtensions(child, result);
  return result;
}

export function convertVRMToKHRCharacter(
  input: GLBInput,
  options: ConvertVRMToKHRCharacterOptions = {},
): ConvertVRMToKHRCharacterResult {
  logVerbose.handler = options.verboseHandler;

  logVerbose('Extracting GLB');

  const [gltf, binChunk] = extractGLB(toUint8Array(input));
  const binChunkBox: [Uint8Array] = [binChunk];

  const nodeBoneMap = collectNodeBoneMap(gltf);

  logVerbose('Appending KHR extensions');

  appendKHRXmpJsonLd(gltf);
  appendKHRCharacter(gltf);
  appendKHRCharacterSkeleton(gltf);
  appendKHRCharacterExpression(gltf, binChunkBox, nodeBoneMap);
  appendVRMCCharacterExpressionLookat(gltf, nodeBoneMap);
  appendKHRNodeCameraHint(gltf, nodeBoneMap);
  if (options.autoVisibility === true) {
    appendKHRNodeVisibilityHint(gltf, ['Face', 'Hair']);
  }
  // Retire declarations only when re-generation replaced every actual payload.
  // Without usable VRM expression data, preserve legacy objects and declarations.
  const present = presentExtensions(gltf);
  const retired = new Set(['KHR_character_expression_mask', 'KHR_character_expression_texture']);
  const retain = (name: string) => !retired.has(name) || present.has(name);
  gltf.extensionsUsed = gltf.extensionsUsed?.filter(retain);
  gltf.extensionsRequired = gltf.extensionsRequired?.filter(retain);
  gltf.extensionsUsed = [...new Set(gltf.extensionsUsed)];
  if (gltf.extensionsRequired) gltf.extensionsRequired = [...new Set(gltf.extensionsRequired)];

  logVerbose('Constructing new GLB');

  const glb = constructGLB(gltf, binChunkBox[0]);

  return {
    glb,
    gltf,
    binChunk: binChunkBox[0],
  };
}
