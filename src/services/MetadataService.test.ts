import { describe, expect, it } from "vitest";
import {
  MetadataService,
  mapAttributeKind,
  normalizeEntityMetadata,
} from "./MetadataService";
import { FakeDataverseClient } from "@/data/FakeDataverseClient";
import { FAKE_METADATA } from "@/data/fakeFixtures";

describe("mapAttributeKind", () => {
  it("maps lookup variants to Lookup", () => {
    expect(mapAttributeKind("LookupType")).toBe("Lookup");
    expect(mapAttributeKind("CustomerType")).toBe("Lookup");
    expect(mapAttributeKind("OwnerType")).toBe("Lookup");
  });
  it("maps scalar types", () => {
    expect(mapAttributeKind("StringType")).toBe("String");
    expect(mapAttributeKind("DateTimeType")).toBe("DateTime");
    expect(mapAttributeKind("PicklistType")).toBe("Choice");
  });
  it("falls back to Unknown", () => {
    expect(mapAttributeKind("SomethingWeird")).toBe("Unknown");
    expect(mapAttributeKind(undefined)).toBe("Unknown");
  });
});

describe("normalizeEntityMetadata (contact)", () => {
  const contact = normalizeEntityMetadata(FAKE_METADATA.contact);

  it("carries entity-level identity", () => {
    expect(contact.entitySetName).toBe("contacts");
    expect(contact.primaryIdAttribute).toBe("contactid");
    expect(contact.primaryNameAttribute).toBe("fullname");
  });

  it("flags required + primary attributes", () => {
    const byName = Object.fromEntries(
      (contact.attributes ?? []).map((a) => [a.logicalName, a]),
    );
    expect(byName.lastname.isRequired).toBe(true);
    expect(byName.firstname.isRequired).toBe(false);
    expect(byName.contactid.isPrimaryId).toBe(true);
    expect(byName.contactid.isWritable).toBe(false);
  });

  it("derives polymorphic lookup targets + navigation properties from M:1 metadata", () => {
    const lookup = (contact.attributes ?? []).find(
      (a) => a.logicalName === "parentcustomerid",
    );
    expect(lookup?.kind).toBe("Lookup");
    expect(lookup?.lookup?.kind).toBe("polymorphic");
    const targets = Object.fromEntries(
      (lookup?.lookup?.targets ?? []).map((t) => [t.logicalName, t]),
    );
    expect(Object.keys(targets).sort()).toEqual(["account", "contact"]);
    // Nav property must come from metadata, never be guessed.
    expect(targets.account.navigationProperty).toBe("parentcustomerid_account");
    expect(targets.contact.navigationProperty).toBe("parentcustomerid_contact");
  });
});

describe("MetadataService", () => {
  it("enriches lookup targets with the target entity set + primary attributes", async () => {
    const svc = new MetadataService(new FakeDataverseClient());
    const contact = await svc.getEntity("contact");
    const lookup = (contact.attributes ?? []).find(
      (a) => a.logicalName === "parentcustomerid",
    );
    const account = lookup?.lookup?.targets.find(
      (t) => t.logicalName === "account",
    );
    expect(account?.entitySetName).toBe("accounts");
    expect(account?.primaryNameAttribute).toBe("name");
    expect(account?.primaryIdAttribute).toBe("accountid");
  });

  it("filters lookup-only attributes", async () => {
    const svc = new MetadataService(new FakeDataverseClient());
    const lookups = await svc.getLookupAttributes("contact");
    expect(lookups.map((a) => a.logicalName)).toEqual(["parentcustomerid"]);
  });
});
