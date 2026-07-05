import { beforeEach, describe, expect, it } from "vitest";
import { LookupResolver } from "./LookupResolver";
import { MetadataService } from "./MetadataService";
import { FakeDataverseClient } from "@/data/FakeDataverseClient";
import { EMPTY_CONDITION_GROUP } from "@/domain/conditions";
import type { LookupConfig } from "@/domain/config";
import type { ConditionGroup } from "@/domain/conditions";

/** Two accounts share the name "Contoso GmbH"; one is stale. */
function seed() {
  return new FakeDataverseClient({
    records: {
      accounts: [
        { accountid: "a1", name: "Contoso GmbH", accountnumber: "100230", modifiedon: "2026-07-02T10:00:00.000Z" },
        { accountid: "a2", name: "Contoso GmbH", accountnumber: "200981", modifiedon: "2026-06-20T10:00:00.000Z" },
        { accountid: "a3", name: "Fabrikam Inc.", accountnumber: "500", modifiedon: "2026-07-01T10:00:00.000Z" },
      ],
    },
  });
}

function lookup(overrides: Partial<LookupConfig> = {}): LookupConfig {
  return {
    id: "lk1",
    lookupAttribute: "parentcustomerid",
    targetEntities: ["account"],
    visibleColumn: "Mutterkonto",
    guidColumn: "Mutterkonto__id",
    logicalNameColumn: "Mutterkonto__logicalname",
    businessKeyColumn: "Mutterkonto__accountnumber",
    searchAttribute: "name",
    businessKeyAttribute: "accountnumber",
    strategy: { useGuidColumn: true, useBusinessKey: true, useSearchMatch: true },
    conditions: EMPTY_CONDITION_GROUP(),
    conflictStrategy: "escalate",
    candidateDisplayAttributes: ["name", "accountnumber", "modifiedon"],
    ...overrides,
  };
}

const NOW = new Date("2026-07-04T00:00:00Z");

describe("LookupResolver", () => {
  let resolver: LookupResolver;
  beforeEach(() => {
    const client = seed();
    resolver = new LookupResolver(client, new MetadataService(client));
  });

  it("prefers the GUID column even when the name is ambiguous", async () => {
    const r = await resolver.resolve(lookup(), { Mutterkonto: "Contoso GmbH", "Mutterkonto__id": "a2" }, { now: NOW });
    expect(r.status).toBe("resolved");
    expect(r.method).toBe("guid");
    expect(r.resolvedId).toBe("a2");
    expect(r.resolvedEntity).toBe("account");
  });

  it("reports ambiguity with all candidates when name matches several", async () => {
    const r = await resolver.resolve(lookup(), { Mutterkonto: "Contoso GmbH" }, { now: NOW });
    expect(r.status).toBe("ambiguous");
    expect(r.candidates).toHaveLength(2);
    expect(r.appliedFilter).toBe("name eq 'Contoso GmbH'");
    expect(r.candidates?.map((c) => c.id).sort()).toEqual(["a1", "a2"]);
    expect(r.candidates?.[0].recordUrl).toContain("etn=account");
  });

  it("disambiguates via a relative-date condition and logs the anchor", async () => {
    const conditions: ConditionGroup = {
      id: "g", logic: "and", groups: [],
      conditions: [{ id: "c1", attribute: "modifiedon", operator: "ge", value: { kind: "relativeDate", offsetDays: -7 } }],
    };
    const r = await resolver.resolve(lookup({ conditions }), { Mutterkonto: "Contoso GmbH" }, { now: NOW });
    expect(r.status).toBe("resolved");
    expect(r.method).toBe("searchMatch");
    expect(r.resolvedId).toBe("a1"); // a2 is stale (modified before 2026-06-27)
    expect(r.appliedFilter).toContain("modifiedon ge 2026-06-27T00:00:00.000Z");
    expect(r.resolvedTimeAnchors?.["modifiedon ge @utcToday(-7d)"]).toBe("2026-06-27T00:00:00.000Z");
  });

  it("resolves via business key before falling back to name search", async () => {
    const r = await resolver.resolve(
      lookup(),
      { Mutterkonto: "Contoso GmbH", "Mutterkonto__accountnumber": "200981" },
      { now: NOW },
    );
    expect(r.status).toBe("resolved");
    expect(r.method).toBe("businessKey");
    expect(r.resolvedId).toBe("a2");
  });

  it("returns NotFound when nothing matches", async () => {
    const r = await resolver.resolve(lookup(), { Mutterkonto: "Unbekannt AG" }, { now: NOW });
    expect(r.status).toBe("notFound");
  });

  it("flags a wrong target type when the pinned logical name is not allowed", async () => {
    const r = await resolver.resolve(
      lookup(),
      { Mutterkonto: "Contoso GmbH", "Mutterkonto__logicalname": "contact" },
      { now: NOW },
    );
    expect(r.status).toBe("wrongTargetType");
  });

  it("uses per-target search fields for polymorphic lookups", async () => {
    const client = new FakeDataverseClient({
      records: {
        accounts: [{ accountid: "a1", name: "Contoso GmbH" }],
        contacts: [{ contactid: "c1", fullname: "Jane Doe" }],
      },
    });
    const resolver2 = new LookupResolver(client, new MetadataService(client));
    const lk = lookup({
      targetEntities: ["account", "contact"],
      searchAttribute: "name",
      // account searched by name, contact by fullname (different logical names)
      targetOverrides: { account: { searchAttribute: "name" }, contact: { searchAttribute: "fullname" } },
      strategy: { useGuidColumn: false, useBusinessKey: false, useSearchMatch: true },
    });
    const r = await resolver2.resolve(lk, { Mutterkonto: "Jane Doe" }, { now: NOW });
    expect(r.status).toBe("resolved");
    expect(r.resolvedEntity).toBe("contact");
    expect(r.resolvedId).toBe("c1");
  });

  it("falls through from an invalid GUID to name resolution", async () => {
    const r = await resolver.resolve(lookup(), { Mutterkonto: "Fabrikam Inc.", "Mutterkonto__id": "does-not-exist" }, { now: NOW });
    expect(r.status).toBe("resolved");
    expect(r.method).toBe("searchMatch");
    expect(r.resolvedId).toBe("a3");
  });
});
