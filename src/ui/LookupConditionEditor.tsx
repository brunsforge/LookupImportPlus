import { Button, Text, tokens } from "@fluentui/react-components";
import { AddRegular, DismissRegular } from "@fluentui/react-icons";
import { useApp } from "@/app/AppContext";
import type { Condition, ConditionGroup, ConditionOperator, ConditionValue } from "@/domain/conditions";
import type { AttributeMetadata } from "@/domain/metadata";

const OPERATORS: ConditionOperator[] = ["eq", "ne", "gt", "ge", "lt", "le", "contains", "startswith", "null", "notnull"];

const ctl: React.CSSProperties = {
  padding: "5px 7px", borderRadius: 6, border: `1px solid ${tokens.colorNeutralStroke1}`,
  background: tokens.colorNeutralBackground1, color: tokens.colorNeutralForeground1, fontFamily: "inherit", fontSize: 12.5,
};

export function LookupConditionEditor({
  group,
  targetAttrs,
  excelColumns,
  onChange,
}: {
  group: ConditionGroup;
  targetAttrs: AttributeMetadata[];
  excelColumns: string[];
  onChange: (g: ConditionGroup) => void;
}) {
  const { t } = useApp();

  const update = (id: string, patch: Partial<Condition>) =>
    onChange({ ...group, conditions: group.conditions.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  const remove = (id: string) =>
    onChange({ ...group, conditions: group.conditions.filter((c) => c.id !== id) });
  const add = () =>
    onChange({
      ...group,
      conditions: [
        ...group.conditions,
        { id: crypto.randomUUID(), attribute: targetAttrs[0]?.logicalName ?? "", operator: "eq", value: { kind: "literal", value: "" } },
      ],
    });

  function valueControl(c: Condition) {
    const kind = c.value?.kind ?? "literal";
    const setKind = (k: string) => {
      const v: ConditionValue =
        k === "excelColumn" ? { kind: "excelColumn", column: excelColumns[0] ?? "" }
        : k === "relativeDate" ? { kind: "relativeDate", offsetDays: -7 }
        : { kind: "literal", value: "" };
      update(c.id, { value: v });
    };
    return (
      <>
        <select style={ctl} value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="literal">{t("ed.srcLiteral")}</option>
          <option value="excelColumn">{t("ed.srcExcel")}</option>
          <option value="relativeDate">{t("ed.srcRelative")}</option>
        </select>
        {kind === "literal" ? (
          <input style={{ ...ctl, minWidth: 120 }} value={String((c.value as { value?: unknown }).value ?? "")}
            onChange={(e) => update(c.id, { value: { kind: "literal", value: e.target.value } })} />
        ) : kind === "excelColumn" ? (
          <select style={ctl} value={(c.value as { column?: string }).column ?? ""}
            onChange={(e) => update(c.id, { value: { kind: "excelColumn", column: e.target.value } })}>
            {excelColumns.map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
        ) : (
          <input type="number" style={{ ...ctl, width: 80 }} value={(c.value as { offsetDays?: number }).offsetDays ?? -7}
            onChange={(e) => update(c.id, { value: { kind: "relativeDate", offsetDays: Number(e.target.value) } })} />
        )}
      </>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {group.conditions.length === 0 ? (
        <Text style={{ fontSize: 12, color: tokens.colorNeutralForeground3 }}>{t("ed.noConditions")}</Text>
      ) : null}
      {group.conditions.map((c) => {
        const needsValue = c.operator !== "null" && c.operator !== "notnull";
        return (
          <div key={c.id} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <select style={{ ...ctl, minWidth: 150 }} value={c.attribute} onChange={(e) => update(c.id, { attribute: e.target.value })}>
              {targetAttrs.length === 0 ? <option value={c.attribute}>{c.attribute}</option> : null}
              {targetAttrs.map((a) => <option key={a.logicalName} value={a.logicalName}>{a.displayName} ({a.logicalName})</option>)}
            </select>
            <select style={ctl} value={c.operator} onChange={(e) => update(c.id, { operator: e.target.value as ConditionOperator })}>
              {OPERATORS.map((op) => <option key={op} value={op}>{op}</option>)}
            </select>
            {needsValue ? valueControl(c) : null}
            <Button size="small" appearance="subtle" icon={<DismissRegular />} aria-label="remove" onClick={() => remove(c.id)} />
          </div>
        );
      })}
      <div><Button size="small" icon={<AddRegular />} onClick={add}>{t("ed.addCondition")}</Button></div>
    </div>
  );
}
