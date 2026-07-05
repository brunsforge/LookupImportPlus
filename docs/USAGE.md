# LookupImportPlus — usage walkthrough

A screen-by-screen guide to the tool and its operating concepts.

## The problem it solves

Dataverse's standard Excel import resolves **lookups by display name only** and
silently takes the first match. If two accounts are both called “Contoso GmbH”,
the standard import guesses — and you may link thousands of records to the wrong
company. LookupImportPlus makes lookup resolution **deterministic and auditable**:
it resolves by GUID / business key / name+conditions, and when it can't decide it
**escalates to a human** instead of guessing.

## The core idea: configuration-first, round-trip

You don't start from a spreadsheet. You create a **job configuration** that
describes, for one Dataverse table, which columns and lookups take part and how
each lookup is resolved. A configuration is **versioned**; every import run keeps
an immutable snapshot of the config it used. A run is then a round-trip:

**Configure → Export (empty template or data) → edit in Excel → Import (upload →
dry run → resolve conflicts → commit).**

## Screens

### 1. Job configurations (start page)
A list of configuration cards. Each shows the target entity, operation, column/
lookup counts, version and draft state. Actions per card:
- **Export ▾** — *Empty template* (headers only) or *Export data* (real records
  with the technical lookup columns filled).
- **Edit** — open the editor.
- **Import starten** — go to the import run (where you upload the filled file).
- **Delete** — with a confirmation dialog.
Top actions: **New configuration**, **Import Excel**.

### 2. Configuration editor (guided wizard)
Numbered tabs; tabs 2–4 unlock once a target entity is chosen.
- **1 · Entity & Source** — pick the target table (from the tables added as data
  sources); metadata (entity set, primary id) loads automatically. Export source:
  the entity itself, or a **saved view** (its columns can be imported).
- **2 · General** — name, description, operation (create / update /
  create-or-update), default write mode (strict / partial).
- **3 · Columns** — the entity's attributes with filters (*search*, *lookups
  only*, *required only*, *writable only*, *selected only*). Tick columns to
  include and set each column's usage. Buttons: **Preview data**, **Empty
  template**, **Export data**.
- **4 · Lookups** — one card per selected lookup column. Explains the matching
  order (below), then:
  - base fields: visible Excel column, business-key column, conflict strategy;
  - **target table(s)** to search (checkboxes — the polymorphic scope);
  - **per selected target**: its **search field**, **business-key attribute**,
    and **conditions** (because logical names differ per table, e.g.
    `account.name` vs `contact.fullname`).

### 3. Data preview (modal)
Opened from the Columns tab. Shows up to 10/25/50 records, toggling between:
- **CRM columns** — raw Dataverse fields;
- **Schema columns** — the Excel layout this config generates, with **color-coded
  groups + a legend** showing which visible/technical columns belong to which lookup.

### 4. Import run
Upload a filled XLSX (or “Load demo file”). A **configuration check** runs first
(schema-drift protection) — errors block the run. Then a **dry run** classifies
every row with a status (Ready, Ambiguous, NotFound, MissingRequiredValue, …) and
a **determinate progress bar**. Choose **Strict** (write nothing until everything
is resolved) or **Partial** (write the clean rows now). **Commit** writes via
`@odata.bind`, with a bounded-concurrency write pool and per-row retry.

### 5. Conflict basket
All unresolved lookups, **grouped by source value** (e.g. “41 × Contoso GmbH”),
with bulk actions. Each group deep-links to the resolution page.

### 6. Resolve (detail page)
Shows the source value, the rule/filter used, the resolved time anchors, and the
**candidate records** (name, key, GUID, type, deep link). Pick one, optionally
**apply to all** rows with the same value, or skip. Every decision is logged.

### 7. Import history
Every run with its frozen config snapshot and counts (rows / written / conflicts /
status) — traceable to the row and the lookup decision.

## Operating concepts

- **Matching order (first hit wins):** 1) **GUID** column → 2) **business key** →
  3) **search field + conditions**. 0 hits ⇒ NotFound; several ⇒ Ambiguous → the
  lookup's **conflict strategy** (escalate / skip / fail). Never guessed.
- **GUID round-trip:** export data, unhide the `… Id` column, paste the correct
  GUID on ambiguous rows, reimport — no conflict UI needed.
- **Conditions** filter the target query: left = a target field; value = fixed / a
  column of the same Excel row / a relative date. Example: two “Contoso GmbH”
  disambiguated by `address1_country eq Excel["Country"]`.
- **Polymorphic lookups:** a lookup can point at several tables; search/business-
  key/conditions are set **per target**. Tick only the tables your Excel references.
- **Schema-drift protection:** before a run the config is validated against
  current metadata; errors block. A metadata fingerprint flags schema changes.
- **Persistence:** configurations + history are stored in the browser
  (localStorage) — no custom Dataverse tables; the app is the only Dataverse item.
- **Extras:** English/German UI (follows the user's locale, toggle in the top bar),
  desktop notifications on import completion (avatar menu), progress bars for large
  imports, and per-row error isolation.

## Reference material in this repo
- `README.md` — features, status, deploy, and lookup configuration examples.
- `docs/ARCHITECTURE.md` — problem framing, Code Apps constraints, decisions, scaling.
- `docs/ui-concept.html` — the visual concept of every screen (open in a browser).
- `docs/SETUP.md` — run locally / deploy to a trial.
- `docs/data-model.md` — the (future) `lip_*` Dataverse tables.
- Types are the source of truth: `src/domain/*`.
