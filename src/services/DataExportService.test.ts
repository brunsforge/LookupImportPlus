import { describe, expect, it } from "vitest";
import { DataExportService } from "./DataExportService";
import { MetadataService } from "./MetadataService";
import { FakeDataverseClient } from "@/data/FakeDataverseClient";
import { makeContactConfig } from "@/testing/configFixture";

describe("DataExportService", () => {
  const client = new FakeDataverseClient();
  const svc = new DataExportService(client, new MetadataService(client));
  const config = makeContactConfig();

  it("selects business attributes and lookup value fields", () => {
    const cols = svc.crmColumns(config);
    expect(cols).toContain("firstname");
    expect(cols).toContain("lastname");
    expect(cols).toContain("_parentcustomerid_value");
    expect(cols).toContain("contactid");
    expect(cols).not.toContain("parentcustomerid"); // lookups use the _value field
  });

  it("maps a record to the Excel schema row (visible + technical columns)", () => {
    const row = svc.toSchemaRow(config, {
      contactid: "c1",
      firstname: "Max",
      lastname: "Mustermann",
      _parentcustomerid_value: "guid-1",
      "_parentcustomerid_value@OData.Community.Display.V1.FormattedValue": "Contoso GmbH",
      "_parentcustomerid_value@Microsoft.Dynamics.CRM.lookuplogicalname": "account",
    });
    expect(row["First Name"]).toBe("Max");
    expect(row["Last Name"]).toBe("Mustermann");
    expect(row["Parent Account"]).toBe("Contoso GmbH"); // formatted value
    expect(row["Parent Account Id"]).toBe("guid-1");
    expect(row["Parent Account Type"]).toBe("account");
    expect(row["lip__recordid"]).toBe("c1");
  });

  it("builds a view-based query by translating FetchXML to OData", () => {
    const viewConfig = makeContactConfig({ exportSource: { kind: "savedView", reference: "v1" } });
    const q = svc.buildQuery(viewConfig, `<fetch><entity name="contact"><attribute name="fullname"/><filter><condition attribute="statecode" operator="eq" value="0"/></filter></entity></fetch>`);
    expect(q.filter).toBe("statecode eq 0");
    expect(q.select).toContain("fullname");
    expect(q.select).toContain("firstname"); // config columns still included
  });
});
