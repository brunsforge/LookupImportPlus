import { describe, expect, it } from "vitest";
import { AppContainer } from "./container";
import { MemoryStore } from "@/services/PersistedStore";
import { FakeDataverseClient } from "@/data/FakeDataverseClient";
import { makeContactConfig } from "@/testing/configFixture";

describe("AppContainer persistence", () => {
  it("seeds on first run, then loads persisted configs and reflects edits", () => {
    const store = new MemoryStore();
    const client = new FakeDataverseClient();

    // First run: seeds the demo config and persists it.
    const c1 = new AppContainer(client, [makeContactConfig()], [], store);
    expect(c1.listConfigs()).toHaveLength(1);

    // Add + delete are written through to the store.
    c1.saveConfig(makeContactConfig({ id: "cfg-2", name: "Second" }));
    c1.deleteConfig("cfg-contact-parent-account");
    expect(c1.listConfigs().map((c) => c.id)).toEqual(["cfg-2"]);

    // A fresh container over the same store loads the persisted state (no reseed).
    const c2 = new AppContainer(client, [makeContactConfig()], [], store);
    expect(c2.listConfigs().map((c) => c.id)).toEqual(["cfg-2"]);
    expect(c2.getConfig("cfg-2")?.name).toBe("Second");
  });
});
