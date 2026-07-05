# LookupImportPlus

[![License: MIT](https://img.shields.io/badge/License-MIT-5B3CC4.svg)](./LICENSE)

A Power Apps **Code App** (Vite + React + Fluent UI v9) for configurable
Dataverse import/export whose differentiator is **robust, auditable lookup
resolution** — it never silently guesses on ambiguous lookups; it escalates to a
conflict worklist and logs every decision.

## Status — **MVP** (deployed & validated against a live Dataverse trial)

| Area | State |
| --- | --- |
| Domain model, `DataverseClient` abstraction | ✅ |
| MetadataService (incl. polymorphic lookups) | ✅ |
| Condition→OData compiler · LookupResolver (GUID / business key / name + per-target conditions) | ✅ tested |
| Excel template/parser (hidden manifest sheet) | ✅ tested |
| ImportRunner (dry run, strict/partial, `@odata.bind`, bounded-concurrency, retry) | ✅ tested |
| Metadata-driven editor (entity/columns/lookups, per-target polymorphic config, condition editor) | ✅ |
| Data preview + view/OData export · schema-drift check · localStorage persistence · EN/DE · notifications | ✅ |
| `SdkDataverseClient` (live) + data sources | ✅ deployed; read+write validated live |
| Team-shared `lip_*` tables · `CreateMultiple` bulk / CRM async queue | ⏸ v2 (see ARCHITECTURE §6a/§7) |

52 unit tests · `npm test`. Builds clean · `npm run build`. Deploy: `npm run deploy` (see docs/SETUP.md).

## Quick start (offline)

```bash
git clone https://github.com/brunsforge/LookupImportPlus.git
cd LookupImportPlus
npm install
npm run dev     # http://localhost:3000 — real app, in-memory demo data
```

Walk the flow: **Import starten → „Demo-Datei laden" → Konfliktkorb → Commit → Historie**.

## Deploy to a Dataverse trial

**No Entra app registration is needed** for an interactive deploy — `pac` signs
you in as a maker and publishes as you; runtime auth is handled by the Power Apps
host + connector consent. (A Service Principal *would* need an app registration,
but the platform doesn't currently let an SPN own a code app, so publishing runs
as a maker.) You need: *code apps* enabled on the environment, a **Power Apps
Premium** license, and a role with customization + CRUD on the target tables
(**System Administrator** on your own trial is simplest).

One command:
```powershell
npm run deploy -- -EnvironmentUrl https://<yourorg>.crm.dynamics.com
```
Full details, privileges and the known `pac code init` caveat: **docs/SETUP.md**
(section B — *Authentication, app registration & privileges*).

## Configuring lookups — how matching works

Each lookup is resolved in a fixed order; the first hit wins:

1. **GUID** (`<Column> Id`) — deterministic. If filled it wins; search/business-key
   are ignored for that row. For **polymorphic** lookups also set the type column
   (`<Column> Type`, e.g. `account` vs `contact`).
2. **Business key** — a unique alternate value (e.g. account number) mapped to a
   unique key attribute on the target. Requires such a key to exist on the target.
3. **Search field + conditions** — the visible Excel value matched on a target
   field, optionally narrowed by conditions.

If step 2/3 finds **nothing** → `NotFound`; **several** → `Ambiguous`. Either goes
to the conflict basket per the lookup's **conflict strategy** (escalate / skip / fail).
Nothing is ever guessed.

### The GUID round-trip (no conflict UI needed)
Export data → unhide the technical `… Id` column → for rows whose display name is
ambiguous, paste the correct target GUID into **that row's** `Id` column → reimport.
The GUID wins, so the record maps exactly. (For polymorphic, also set `… Type`.)

### Conditions
Conditions filter **which target records match**. The left side is always a field
on the **target** table. The value is one of:
- **Fixed value** — a constant.
- **Excel column** — a value from the *same Excel row* (any selected column, incl.
  another lookup's column) — so a second column can disambiguate.
- **Relative date** — e.g. `-7` days (`@utcToday(-7d)`), resolved and logged at run time.

They don't reference the *resolved* value of another lookup — only target field ↔
literal / Excel-cell / relative date.

**Example — disambiguate two “Contoso GmbH” by country.** Excel has a `Country`
column. Lookup `parentcustomerid → account`, search field `name`, condition
`address1_country eq Excel["Country"]`. Row `Max · Mustermann · Contoso GmbH · DE`
runs `name = 'Contoso GmbH' AND address1_country = 'DE'` → the German account,
unambiguously. Without the condition → `Ambiguous` → conflict basket.

**Example — only recently changed targets.** Condition `modifiedon ge` → relative
date `-7`. The run logs the concrete date used (e.g. `2026-06-28`).

### Polymorphic lookups (customer / owner / regarding)
A lookup can point at several tables (metadata-driven checkboxes). Since logical
names differ per table (`account.name` vs `contact.fullname`), the editor lets you
set the **search / business-key field per target**; the single field above is the
default/fallback. Tick only the target tables your Excel actually references — the
importer searches only those.

## Docs

- `docs/USAGE.md` — **screen-by-screen walkthrough** and operating concepts (start here).
- `docs/ARCHITECTURE.md` — architecture, Code Apps constraints, transport decision, open risks.
- `docs/SETUP.md` — local dev **and** trial onboarding (enable code apps, add data sources, push).
- `docs/data-model.md` — `lip_*` Dataverse tables (phase 2 audit persistence).
- `docs/ui-concept.html` — the agreed "Operational Violet" UI concept (open in a browser).

## Layout

```
src/domain/     types = source of truth (config, conditions, import, metadata, template)
src/data/       DataverseClient interface + Fake/Sdk implementations
src/services/   MetadataService, LookupResolver, conditionCompiler, ImportRunner, excel/
src/app/        container, client factory, React context, demo seed
src/ui/         Fluent shell + screens
```

## Contributing

Issues and pull requests are welcome at
[github.com/brunsforge/LookupImportPlus](https://github.com/brunsforge/LookupImportPlus).
Before opening a PR, please run `npm test` and `npm run build` — both should pass clean.

## License

[MIT](./LICENSE) © [Andreas Brunsmann](https://github.com/brunsforge)

