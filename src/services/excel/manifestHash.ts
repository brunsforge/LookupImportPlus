/**
 * Small, dependency-free string hash (djb2) used to detect tampered/edited
 * templates. Not cryptographic — just an integrity signal for the manifest.
 */

import type { TemplateManifest } from "@/domain/template";

export function djb2(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** Hash of everything in the manifest except the `hash`/`generatedOn` fields. */
export function hashManifest(m: Omit<TemplateManifest, "hash" | "generatedOn">): string {
  return djb2(
    JSON.stringify({
      configId: m.configId,
      configVersion: m.configVersion,
      schemaVersion: m.schemaVersion,
      targetEntity: m.targetEntity,
      entitySetName: m.entitySetName,
      operation: m.operation,
      columns: m.columns,
    }),
  );
}
