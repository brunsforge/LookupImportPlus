/**
 * Minimal FetchXML column extraction — pure and dependency-free (regex, so it
 * runs in node tests without a DOM). Used to derive the column selection from a
 * saved Dataverse view when a configuration is based on a view.
 */

export interface ParsedFetchXml {
  entity: string | null;
  /** Attribute logical names selected by the (top-level) entity. */
  attributes: string[];
}

export function parseFetchXmlColumns(fetchXml: string): ParsedFetchXml {
  const entity = /<entity\s+name=["']([^"']+)["']/i.exec(fetchXml)?.[1] ?? null;
  const attributes: string[] = [];
  const re = /<attribute\s+name=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fetchXml))) attributes.push(m[1]);
  return { entity, attributes: [...new Set(attributes)] };
}
