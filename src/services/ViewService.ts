/**
 * ViewService — lists saved Dataverse views (main views) for an entity, so a
 * configuration can be based on an existing view instead of hand-picking every
 * column. Requires the `savedqueries` table to be available as a data source;
 * if it isn't, `listViews` degrades gracefully to an empty list.
 */

import type { DataverseClient } from "@/data/DataverseClient";
import { parseFetchXmlColumns } from "./fetchxml";

export interface SavedView {
  id: string;
  name: string;
  fetchXml: string;
  /** Column logical names parsed from the view's FetchXML. */
  columns: string[];
}

export class ViewService {
  constructor(private readonly client: DataverseClient) {}

  async listViews(entityLogicalName: string): Promise<SavedView[]> {
    try {
      const res = await this.client.retrieveMultiple("savedqueries", {
        select: ["savedqueryid", "name", "fetchxml", "returnedtypecode", "querytype"],
        filter: `returnedtypecode eq '${entityLogicalName}' and querytype eq 0`,
        orderBy: ["name"],
        top: 100,
      });
      return res.records.map((r) => {
        const fetchXml = String(r.fetchxml ?? "");
        return {
          id: String(r.savedqueryid ?? ""),
          name: String(r.name ?? ""),
          fetchXml,
          columns: parseFetchXmlColumns(fetchXml).attributes,
        };
      });
    } catch {
      return [];
    }
  }
}
