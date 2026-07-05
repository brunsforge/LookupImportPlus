import { describe, expect, it } from "vitest";
import { parseFetchXmlColumns } from "./fetchxml";
import { ViewService } from "./ViewService";
import { FakeDataverseClient } from "@/data/FakeDataverseClient";

describe("parseFetchXmlColumns", () => {
  it("extracts the entity and its attributes", () => {
    const xml = `
      <fetch>
        <entity name="account">
          <attribute name="name" />
          <attribute name="accountnumber" />
          <attribute name="modifiedon" />
        </entity>
      </fetch>`;
    const r = parseFetchXmlColumns(xml);
    expect(r.entity).toBe("account");
    expect(r.attributes).toEqual(["name", "accountnumber", "modifiedon"]);
  });

  it("dedupes and handles single quotes", () => {
    const xml = `<fetch><entity name='contact'><attribute name='firstname'/><attribute name='firstname'/></entity></fetch>`;
    expect(parseFetchXmlColumns(xml).attributes).toEqual(["firstname"]);
  });
});

describe("ViewService", () => {
  it("lists main views for an entity and parses their columns", async () => {
    const client = new FakeDataverseClient({
      records: {
        savedqueries: [
          { savedqueryid: "v1", name: "Active Accounts", returnedtypecode: "account", querytype: 0, fetchxml: `<fetch><entity name="account"><attribute name="name"/><attribute name="accountnumber"/></entity></fetch>` },
          { savedqueryid: "v2", name: "Contacts view", returnedtypecode: "contact", querytype: 0, fetchxml: `<fetch><entity name="contact"><attribute name="fullname"/></entity></fetch>` },
        ],
      },
    });
    const views = await new ViewService(client).listViews("account");
    expect(views).toHaveLength(1);
    expect(views[0].name).toBe("Active Accounts");
    expect(views[0].columns).toEqual(["name", "accountnumber"]);
  });

  it("degrades to empty when savedqueries is unavailable", async () => {
    const views = await new ViewService(new FakeDataverseClient()).listViews("account");
    expect(views).toEqual([]);
  });
});
