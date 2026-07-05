import { describe, expect, it } from "vitest";
import { buildTemplateColumns } from "./templateColumns";
import { ExcelTemplateService } from "./ExcelTemplateService";
import { ExcelParserService } from "./ExcelParserService";
import { makeContactConfig } from "@/testing/configFixture";

describe("buildTemplateColumns", () => {
  it("emits visible + technical lookup columns in order, plus lip__recordid", () => {
    const cols = buildTemplateColumns(makeContactConfig());
    expect(cols.map((c) => c.header)).toEqual([
      "First Name",
      "Last Name",
      "Parent Account",
      "Parent Account Id",
      "Parent Account Type",
      "Parent Account Number",
      "lip__recordid",
    ]);
    const tech = cols.filter((c) => c.technical).map((c) => c.header);
    expect(tech).toContain("Parent Account Id");
    expect(tech).toContain("lip__recordid");
    expect(cols.find((c) => c.header === "Parent Account")?.technical).toBe(false);
  });

  it("omits lip__recordid for create-only configs", () => {
    const cols = buildTemplateColumns(makeContactConfig({ operation: "create" }));
    expect(cols.map((c) => c.header)).not.toContain("lip__recordid");
  });
});

describe("Excel template round-trip", () => {
  it("writes a manifest + data and parses them back", async () => {
    const config = makeContactConfig();
    const template = new ExcelTemplateService();
    const buffer = await template.build(config, [
      { "First Name": "Max", "Last Name": "Mustermann", "Parent Account": "Contoso GmbH", "Parent Account Type": "account" },
    ]);

    const parsed = await new ExcelParserService().parse(buffer);

    expect(parsed.manifestValid).toBe(true);
    expect(parsed.manifest?.configId).toBe(config.id);
    expect(parsed.manifest?.configVersion).toBe(4);
    expect(parsed.manifest?.targetEntity).toBe("contact");
    expect(parsed.warnings).toEqual([]);

    expect(parsed.headers).toContain("Parent Account");
    expect(parsed.headers).toContain("Parent Account Id");
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].rowNumber).toBe(1);
    expect(parsed.rows[0].values["Last Name"]).toBe("Mustermann");
    expect(parsed.rows[0].values["Parent Account"]).toBe("Contoso GmbH");
  });

  it("flags a tampered manifest via the hash", async () => {
    const config = makeContactConfig();
    const buffer = await new ExcelTemplateService().build(config, []);

    // Corrupt the manifest cell by rewriting the workbook's hidden sheet.
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const sheet = wb.getWorksheet("_LookupImportPlus")!;
    const m = JSON.parse(String(sheet.getCell("A2").value));
    m.targetEntity = "lead"; // change without fixing the hash
    sheet.getCell("A2").value = JSON.stringify(m);
    const tampered = await wb.xlsx.writeBuffer();

    const parsed = await new ExcelParserService().parse(tampered);
    expect(parsed.manifestValid).toBe(false);
    expect(parsed.warnings.join(" ")).toMatch(/Hash/);
  });
});
