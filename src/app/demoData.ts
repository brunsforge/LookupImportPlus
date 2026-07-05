/**
 * In-memory demo seed so the app runs fully offline (local dev, no Dataverse).
 * Two "Contoso GmbH" accounts intentionally collide to exercise the conflict
 * flow. When a real Dataverse data source is wired, the SDK client replaces
 * this seed (see clientFactory).
 */

import { FakeDataverseClient } from "@/data/FakeDataverseClient";
import type { JobConfiguration } from "@/domain/config";
import { makeContactConfig } from "@/testing/configFixture";

/** Entities the editor offers locally (mirrors added data sources in the host). */
export const DEMO_ENTITIES = ["account", "contact"];

export function makeDemoClient(): FakeDataverseClient {
  return new FakeDataverseClient({
    records: {
      accounts: [
        { accountid: "11111111-1111-1111-1111-000000000001", name: "Contoso GmbH", accountnumber: "100230", modifiedon: "2026-07-02T10:00:00.000Z" },
        { accountid: "11111111-1111-1111-1111-000000000002", name: "Contoso GmbH", accountnumber: "200981", modifiedon: "2026-07-01T09:00:00.000Z" },
        { accountid: "22222222-2222-2222-2222-000000000003", name: "Fabrikam Inc.", accountnumber: "500100", modifiedon: "2026-07-03T08:00:00.000Z" },
        { accountid: "33333333-3333-3333-3333-000000000004", name: "Adventure Works", accountnumber: "700900", modifiedon: "2026-06-15T08:00:00.000Z" },
      ],
      contacts: [
        { contactid: "c-0001", firstname: "Alice", lastname: "Weber", "_parentcustomerid_value": "22222222-2222-2222-2222-000000000003", "_parentcustomerid_value@OData.Community.Display.V1.FormattedValue": "Fabrikam Inc.", "_parentcustomerid_value@Microsoft.Dynamics.CRM.lookuplogicalname": "account" },
        { contactid: "c-0002", firstname: "Bob", lastname: "Meier", "_parentcustomerid_value": "11111111-1111-1111-1111-000000000001", "_parentcustomerid_value@OData.Community.Display.V1.FormattedValue": "Contoso GmbH", "_parentcustomerid_value@Microsoft.Dynamics.CRM.lookuplogicalname": "account" },
        { contactid: "c-0003", firstname: "Carla", lastname: "Schulz" },
      ],
      savedqueries: [
        { savedqueryid: "sq-1", name: "Active Contacts", returnedtypecode: "contact", querytype: 0, fetchxml: `<fetch><entity name="contact"><attribute name="firstname"/><attribute name="lastname"/><attribute name="parentcustomerid"/></entity></fetch>` },
        { savedqueryid: "sq-2", name: "Active Accounts", returnedtypecode: "account", querytype: 0, fetchxml: `<fetch><entity name="account"><attribute name="name"/><attribute name="accountnumber"/></entity></fetch>` },
      ],
    },
  });
}

export function demoConfigs(): JobConfiguration[] {
  return [makeContactConfig()];
}
