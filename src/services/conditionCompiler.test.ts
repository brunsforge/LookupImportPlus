import { describe, expect, it } from "vitest";
import {
  andFilters,
  compileConditionGroup,
  resolveRelativeDate,
} from "./conditionCompiler";
import type { Condition, ConditionGroup } from "@/domain/conditions";

function group(...conditions: Condition[]): ConditionGroup {
  return { id: "g", logic: "and", conditions, groups: [] };
}

describe("resolveRelativeDate", () => {
  it("shifts UTC midnight by the offset", () => {
    expect(resolveRelativeDate(-7, new Date("2026-07-04T13:22:00Z"))).toBe(
      "2026-06-27T00:00:00.000Z",
    );
    expect(resolveRelativeDate(0, new Date("2026-07-04T13:22:00Z"))).toBe(
      "2026-07-04T00:00:00.000Z",
    );
  });
});

describe("compileConditionGroup", () => {
  const ctx = { row: { Mutterkonto: "Contoso GmbH" }, now: new Date("2026-07-04T00:00:00Z") };

  it("returns empty filter for no conditions", () => {
    expect(compileConditionGroup(undefined, ctx).filter).toBe("");
    expect(compileConditionGroup(group(), ctx).filter).toBe("");
  });

  it("compiles a literal equality", () => {
    const c: Condition = { id: "1", attribute: "name", operator: "eq", value: { kind: "literal", value: "Acme" } };
    expect(compileConditionGroup(group(c), ctx).filter).toBe("name eq 'Acme'");
  });

  it("escapes single quotes in string literals", () => {
    const c: Condition = { id: "1", attribute: "name", operator: "eq", value: { kind: "literal", value: "O'Brien" } };
    expect(compileConditionGroup(group(c), ctx).filter).toBe("name eq 'O''Brien'");
  });

  it("pulls values from the Excel row", () => {
    const c: Condition = { id: "1", attribute: "name", operator: "eq", value: { kind: "excelColumn", column: "Mutterkonto" } };
    expect(compileConditionGroup(group(c), ctx).filter).toBe("name eq 'Contoso GmbH'");
  });

  it("drops an excelColumn condition when the cell is empty", () => {
    const c: Condition = { id: "1", attribute: "name", operator: "eq", value: { kind: "excelColumn", column: "Fehlt" } };
    expect(compileConditionGroup(group(c), ctx).filter).toBe("");
  });

  it("compiles contains() and null operators", () => {
    const contains: Condition = { id: "1", attribute: "name", operator: "contains", value: { kind: "literal", value: "Cont" } };
    const isNull: Condition = { id: "2", attribute: "parentaccountid", operator: "null" };
    expect(compileConditionGroup(group(contains), ctx).filter).toBe("contains(name,'Cont')");
    expect(compileConditionGroup(group(isNull), ctx).filter).toBe("parentaccountid eq null");
  });

  it("resolves a relative date and records the anchor", () => {
    const c: Condition = { id: "1", attribute: "modifiedon", operator: "ge", value: { kind: "relativeDate", offsetDays: -7 } };
    const res = compileConditionGroup(group(c), ctx);
    expect(res.filter).toBe("modifiedon ge 2026-06-27T00:00:00.000Z");
    expect(res.timeAnchors["modifiedon ge @utcToday(-7d)"]).toBe("2026-06-27T00:00:00.000Z");
  });

  it("AND-joins multiple conditions", () => {
    const a: Condition = { id: "1", attribute: "name", operator: "eq", value: { kind: "excelColumn", column: "Mutterkonto" } };
    const b: Condition = { id: "2", attribute: "modifiedon", operator: "ge", value: { kind: "relativeDate", offsetDays: -7 } };
    expect(compileConditionGroup(group(a, b), ctx).filter).toBe(
      "name eq 'Contoso GmbH' and modifiedon ge 2026-06-27T00:00:00.000Z",
    );
  });
});

describe("andFilters", () => {
  it("joins non-empty parts and skips empties", () => {
    expect(andFilters("a eq 1", "", undefined, "b eq 2")).toBe("a eq 1 and b eq 2");
  });
});
