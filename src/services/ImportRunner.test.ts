import { beforeEach, describe, expect, it, vi } from "vitest";
import { ImportRunner } from "./ImportRunner";
import { LookupResolver } from "./LookupResolver";
import { MetadataService } from "./MetadataService";
import { FakeDataverseClient } from "@/data/FakeDataverseClient";
import { makeContactConfig } from "@/testing/configFixture";
import type { ParsedRow } from "./excel/ExcelParserService";
import type { ResolutionDecision } from "@/domain/import";

const NOW = new Date("2026-07-04T00:00:00Z");

function seed() {
  return new FakeDataverseClient({
    records: {
      accounts: [
        { accountid: "a1", name: "Contoso GmbH", accountnumber: "100230", modifiedon: "2026-07-02T10:00:00.000Z" },
        { accountid: "a2", name: "Contoso GmbH", accountnumber: "200981", modifiedon: "2026-07-01T10:00:00.000Z" },
        { accountid: "a3", name: "Fabrikam Inc.", accountnumber: "500", modifiedon: "2026-07-01T10:00:00.000Z" },
      ],
      contacts: [{ contactid: "existing-1", firstname: "Alt", lastname: "Klein" }],
    },
  });
}

const ROWS: ParsedRow[] = [
  { rowNumber: 1, values: { "First Name": "Max", "Last Name": "Mustermann", "Parent Account": "Fabrikam Inc." } },
  { rowNumber: 2, values: { "First Name": "Erika", "Last Name": "Schmidt", "Parent Account": "Contoso GmbH" } },
  { rowNumber: 3, values: { "First Name": "Tom", "Parent Account": "Fabrikam Inc." } }, // missing Last Name
  { rowNumber: 4, values: { "First Name": "Anna", "Last Name": "Klein", "Parent Account": "Fabrikam Inc.", "lip__recordid": "existing-1" } },
];

function build() {
  const client = seed();
  const metadata = new MetadataService(client);
  const resolver = new LookupResolver(client, metadata);
  const runner = new ImportRunner(client, metadata, resolver);
  return { client, runner };
}

describe("ImportRunner.dryRun", () => {
  it("assigns per-row statuses and counts", async () => {
    const { runner } = build();
    const job = await runner.dryRun(makeContactConfig(), ROWS, { now: NOW });
    const byRow = Object.fromEntries(job.rows.map((r) => [r.rowNumber, r.status]));
    expect(byRow[1]).toBe("LookupResolved");
    expect(byRow[2]).toBe("LookupAmbiguous");
    expect(byRow[3]).toBe("MissingRequiredValue");
    expect(byRow[4]).toBe("LookupResolved");
    expect(job.readyCount).toBe(2);
    expect(job.conflictCount).toBe(1);
    expect(job.errorCount).toBe(1);
    expect(job.status).toBe("awaitingConflicts");
  });
});

describe("ImportRunner dry run scaling", () => {
  it("dedups identical lookup values (one query for many rows) and reports progress", async () => {
    const client = seed();
    const spy = vi.spyOn(client, "retrieveMultiple");
    const metadata = new MetadataService(client);
    const runner = new ImportRunner(client, metadata, new LookupResolver(client, metadata));

    const manyContoso: ParsedRow[] = Array.from({ length: 20 }, (_, i) => ({
      rowNumber: i + 1,
      values: { "First Name": `V${i}`, "Last Name": `N${i}`, "Parent Account": "Contoso GmbH" },
    }));

    const progress: number[] = [];
    const job = await runner.dryRun(makeContactConfig(), manyContoso, {
      now: NOW,
      onProgress: (done, total) => progress.push(done / total),
    });

    // 20 identical rows → a single candidate query, not 20.
    expect(spy).toHaveBeenCalledTimes(1);
    expect(job.rows).toHaveLength(20);
    expect(job.rows.every((r) => r.status === "LookupAmbiguous")).toBe(true);
    expect(progress.at(-1)).toBe(1); // reached 100%
  });
});

describe("ImportRunner strict mode", () => {
  it("refuses to write while blocking rows remain", async () => {
    const { client, runner } = build();
    const job = await runner.dryRun(makeContactConfig(), ROWS, { now: NOW, mode: "strict" });
    await runner.commit(job);
    expect(job.rows.every((r) => r.status !== "Committed")).toBe(true);
    expect(client.dump("contacts")).toHaveLength(1); // only the seeded record
  });
});

describe("ImportRunner conflict decision + partial commit", () => {
  let ctx: ReturnType<typeof build>;
  beforeEach(() => { ctx = build(); });

  it("applies a decision to all matching rows and clears the conflict", async () => {
    const job = await ctx.runner.dryRun(makeContactConfig(), ROWS, { now: NOW });
    const decision: ResolutionDecision = {
      id: "d1", rowNumber: 2, lookupAttribute: "parentcustomerid", sourceValue: "Contoso GmbH",
      candidates: [], chosenId: "a1", chosenEntity: "account", decidedBy: "u", decidedOn: NOW.toISOString(), appliedToAll: true,
    };
    ctx.runner.applyDecision(job, decision);
    expect(job.rows.find((r) => r.rowNumber === 2)?.status).toBe("LookupResolved");
    expect(job.conflictCount).toBe(0);
    expect(job.status).toBe("validated");
    expect(job.decisions).toHaveLength(1);
  });

  it("writes resolved rows in partial mode and binds lookups via @odata.bind", async () => {
    const job = await ctx.runner.dryRun(makeContactConfig(), ROWS, { now: NOW, mode: "partial" });
    ctx.runner.applyDecision(job, {
      id: "d1", rowNumber: 2, lookupAttribute: "parentcustomerid", sourceValue: "Contoso GmbH",
      candidates: [], chosenId: "a1", chosenEntity: "account", decidedBy: "u", decidedOn: NOW.toISOString(), appliedToAll: true,
    });

    await ctx.runner.commit(job);

    const committed = job.rows.filter((r) => r.status === "Committed").map((r) => r.rowNumber).sort();
    expect(committed).toEqual([1, 2, 4]);
    expect(job.rows.find((r) => r.rowNumber === 3)?.status).toBe("MissingRequiredValue");

    const contacts = ctx.client.dump("contacts");
    // row1 (Fabrikam→a3) and row2 (Contoso→a1) were created; row4 updated existing-1
    const binds = contacts
      .map((c) => c["parentcustomerid_account@odata.bind"])
      .filter(Boolean);
    expect(binds).toContain("/accounts(a3)");
    expect(binds).toContain("/accounts(a1)");
    const updated = contacts.find((c) => c.contactid === "existing-1");
    expect(updated?.firstname).toBe("Anna");
    expect(updated?.["parentcustomerid_account@odata.bind"]).toBe("/accounts(a3)");
  });
});
