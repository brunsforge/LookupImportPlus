import { describe, expect, it } from "vitest";
import { ConfigValidationService } from "./ConfigValidationService";
import { MetadataService } from "./MetadataService";
import { FakeDataverseClient } from "@/data/FakeDataverseClient";
import { makeContactConfig } from "@/testing/configFixture";
import type { ConfigIssueCode } from "@/domain/issues";

function svc() {
  const client = new FakeDataverseClient();
  return new ConfigValidationService(new MetadataService(client));
}

const codes = (r: { issues: { code: ConfigIssueCode }[] }) => r.issues.map((i) => i.code);

describe("ConfigValidationService", () => {
  it("passes a valid config with no errors", async () => {
    const r = await svc().validate(makeContactConfig());
    expect(r.hasErrors).toBe(false);
    expect(r.issues).toEqual([]);
    expect(r.fingerprint).not.toBe("");
  });

  it("flags a removed column", async () => {
    const config = makeContactConfig();
    config.columns.push({ attribute: "ghostfield", header: "Ghost", usage: "importExport", kind: "String", order: 9 });
    const r = await svc().validate(config);
    expect(r.hasErrors).toBe(true);
    expect(codes(r)).toContain("attributeMissing");
  });

  it("flags a lookup target that is no longer allowed", async () => {
    const config = makeContactConfig();
    config.lookups[0].targetEntities = ["lead"]; // not an allowed target of parentcustomerid
    const r = await svc().validate(config);
    expect(codes(r)).toContain("lookupTargetNotAllowed");
  });

  it("flags a condition attribute that no longer exists", async () => {
    const config = makeContactConfig();
    config.lookups[0].conditions.conditions.push({ id: "x", attribute: "vanished", operator: "eq", value: { kind: "literal", value: "y" } });
    const r = await svc().validate(config);
    expect(codes(r)).toContain("conditionAttributeMissing");
  });

  it("flags a missing search attribute on the target", async () => {
    const config = makeContactConfig();
    config.lookups[0].searchAttribute = "notaname";
    const r = await svc().validate(config);
    expect(codes(r)).toContain("searchAttributeMissing");
  });

  it("reports schema drift when the stored fingerprint differs", async () => {
    const config = makeContactConfig({ metadataFingerprint: "stale00" });
    const r = await svc().validate(config);
    expect(codes(r)).toContain("schemaChangedSinceSave");
    expect(r.hasErrors).toBe(false); // info-level only
  });
});
