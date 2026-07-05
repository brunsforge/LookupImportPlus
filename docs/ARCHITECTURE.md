# LookupImportPlus — Architecture & Toolchain Constraints

> Status: living document. Captures the analysis from project bootstrap
> (handover steps 1–2) and the decisions that gate concrete implementation.

## 1. What we are building

A Power Apps **Code App** (SPA, `pac code` / `@microsoft/power-apps`) that provides a
modern React + Fluent UI experience for configurable Dataverse import/export
with **robust, auditable lookup resolution** (no silent guessing on ambiguous
lookups). See the handover for full product scope.

## 2. Verified environment (bootstrap)

| Tool | Version | Notes |
| --- | --- | --- |
| Node | v25.9.0 | |
| npm | 11.12.1 | |
| Power Platform CLI (`pac`) | 2.5.1 | `pac code` is **Preview** |
| .NET | 10.0.102 | available for future plug-in / Custom API |
| git | 2.44 | repo not yet initialized |
| Dataverse env | `https://<yourorg>.crm.dynamics.com/` | active `pac auth` profile |

Project directory started **empty** — greenfield.

> Note: `@microsoft/power-apps` ≥ v1.0.4 ships its own npm-based CLI that will
> **replace** `pac code` commands in a future release. We target `pac code` for
> now but keep build scripts CLI-agnostic.

## 3. Code Apps runtime model (the core constraint)

From the official architecture docs, a Code App at runtime has three layers:

1. **Your code** (this SPA).
2. **Power Apps client library** (`@microsoft/power-apps`) — exposes APIs and the
   **generated models/services for connectors**.
3. **Power Apps host** — manages **end-user Entra authentication** and app loading.

**Data flows only through Power Platform connectors**, called from JavaScript via
generated service classes. Connections are added with
`pac code add-data-source` (keyed by `apiId` / `connectionId` / `table`).

### What this means for "direct Dataverse Web API"

The handover asks for a direct Dataverse Web API abstraction covering metadata,
polymorphic lookups, navigation properties, entity set names, `$batch`, etc.

**Key discovery (verified against `@microsoft/power-apps` v1.2.5 type defs):** the
SDK's Dataverse data source is far more capable than the connector docs imply.
Inspecting `@microsoft/power-apps/data` and `.../data/metadata/dataverse`:

- `getClient(dataSourcesInfo)` → `DataClient` with `createRecordAsync`,
  `updateRecordAsync`, `deleteRecordAsync`, `retrieveRecordAsync`,
  `retrieveMultipleRecordsAsync` (with OData `select`/`filter`/`orderBy`/`top`/
  `skip`/`count`/`maxPageSize`/`skipToken`), and `executeAsync` for custom ops.
- **Full Dataverse metadata**: an `EntityMetadata` shape with `Attributes`,
  `ManyToOneRelationships` / `OneToManyRelationships` / `ManyToManyRelationships`,
  `EntitySetName`, `PrimaryIdAttribute`, `PrimaryNameAttribute`, ownership, etc.
  Relationship metadata carries `ReferencingEntityNavigationPropertyName` —
  exactly the navigation property needed to bind polymorphic lookups.
- `createMockDataExecutor` / `MockDataStore` + `setDataOperationExecutor` — an
  in-memory executor for **offline development and tests**.

Revised capability matrix (Dataverse data source via the SDK):

| Capability needed | SDK Dataverse data source | Notes |
| --- | --- | --- |
| CRUD (create/update/retrieve/list) | ✅ | `DataClient`, user context |
| OData `$select`/`$filter`/`$orderby`/`$top`/paging | ✅ | `IOperationOptions`; powers candidate queries |
| Entity/Attribute/**Relationship** metadata | ✅ | `getEntityMetadata` — resolves the former blocker |
| Lookup targets + navigation property | ✅ | from `ManyToOneRelationships` |
| Set lookup via `@odata.bind` | ⚠️ **validate live** | pass `nav@odata.bind` in the record payload |
| `$batch` (single transaction) | ❌ | batch **logically** client-side (concurrency + retry), which also gives per-row error isolation |
| Alternate-key upsert | ⚠️ later | not in MVP |

- There is still **no CORS-allowed path to call `…/api/data/v9.2` directly** from
  the browser and **no raw Dataverse token** — but we no longer need one: the SDK
  proxies metadata + data as the signed-in user.

## 4. Data-access strategy (decided)

Everything funnels through `src/data/DataverseClient.ts` — a single,
transport-agnostic interface. Given the §3 discovery, the MVP transport is:

**Standard Dataverse data source via the `@microsoft/power-apps` SDK.** Tables are
added with `pac code add-data-source` (Dataverse connector); metadata comes from
the SDK's `getEntityMetadata`; CRUD + candidate queries from the `DataClient`.
This keeps the browser **secret-free**, runs as the **signed-in user**, is
**DLP-governed**, and needs **no custom connector or plug-in** for the MVP.

Two concrete `DataverseClient` implementations back the interface:

- `SdkDataverseClient` — wraps the SDK `DataClient` + metadata call (production).
- `FakeDataverseClient` / SDK `createMockDataExecutor` — in-memory (tests + local
  UI development, fully offline).

Deferred to later milestones, behind the same interface, if needed:
- A **custom connector** fronting `…/api/data/v9.2/` for a real `$batch`
  transaction, or an unbound **Custom API** — only if logical batching proves
  insufficient.
- A **server-side runner** (Custom API / Azure Function) for large jobs (§5).

## 5. Browser vs. server split (keep the door open)

To preserve the future move to a server-side runner (handover requirement), we
keep responsibilities explicit:

| Concern | MVP location | Future |
| --- | --- | --- |
| Metadata read | transport (§4) | cache/CDN or server metadata API |
| Lookup candidate queries | browser (`LookupResolver`) | server runner (bulk) |
| Dry run / validation | browser (`ImportRunner`) | server runner (large files) |
| Writes (create/update) | browser, batched + retry | server runner / Custom API |
| Audit persistence (`lip_*`) | browser via transport | server (transactional) |

`ImportRunner` is written so a single method (`commit`) is the only place that
writes — that seam is where a server-side runner is later substituted.

## 6. Data model (Dataverse `lip_*` tables + JSON config)

- `lip_jobconfiguration` — versioned config; body stored as JSON, key fields promoted.
- `lip_importjob` — one run; stores an **immutable config snapshot**.
- `lip_importrow` — per-row raw data, status, resolved lookups, write result.
- `lip_resolutiondecision` — audit of every manual conflict resolution.

Config is versioned JSON (`schemaVersion` + monotonic `version`); each run
snapshots the config so later edits never reinterpret old runs. In-app domain
types live in `src/domain/*` and are the source of truth for these shapes.

## 6a. Large volumes (>5.000 rows) & progress

The dry run and commit process rows one by one and know the total, so progress is
**always determinate** — the UI shows a real progress bar (`onProgress(done,total)`
on both `dryRun` and `commit`), never just an opaque spinner.

Done for scale:
- **Lookup dedup cache** in the dry run: rows with identical lookup inputs share
  one query (keyed by the exact row values each lookup reads). 5.000 rows with
  200 distinct company names ⇒ ~200 queries, not 5.000. (Tested.)
- Candidate queries are capped (`top`), and the resolver is stateless/idempotent.

Roadmap for higher volumes (not blocking; architecture already allows it):
- **Commit throughput**: ✅ NOW bounded-concurrency write pool (default 6 in
  flight, per-row retry + isolation) — the `commit` bulk acceleration.
- **`CreateMultiple` / `UpdateMultiple`** — **VERIFIED NOT AVAILABLE via the SDK.**
  The Code App SDK data client only supports `createRecord` (single),
  `retrieveMultiple`, `getEntityMetadata`, and `customapi`. No bulk message, no
  `$batch`. So true server-batching from a Code App needs **one extra Power
  Platform item**, either:
  - a **custom connector** fronting `…/api/data/v9.2` (no code) → real
    `CreateMultiple`/`$batch`, but **synchronous** (no job/status page); or
  - a **Custom API / plug-in** (invoked via the SDK's `customapi` action) → real
    bulk **and** an **AsyncOperation** system job you can deep-link to (a
    CRM-style status page). This is the only path to the built-in CRM import queue
    for our custom lookup logic; native Dataverse import stays out of scope.
- **Without any extra item**, the concurrency write pool is the batching we get.
  The `commit` seam is ready for a `createMultiple` implementation to drop in
  behind it if/when one of the above items is added.
- **Excel**: exceljs loads the whole file in memory. For very large files switch
  to the streaming `WorkbookReader`.
- **Resume**: `ImportRow` carries per-row status/results, so a partial run can be
  resumed — surface a "resume" action once server-side persistence lands.
- **Threshold**: pick a row count above which the app hands off to the server
  runner rather than committing from the browser.

## 6b. Schema-drift protection

A config is a snapshot of the schema when it was authored; the live schema can
move (renamed/removed columns, changed lookup targets, type changes, entity-set
renames). Two layers keep a run from throwing raw Web API exceptions:

- **Preflight validation** (`ConfigValidationService`): before a run, the config
  is checked against *current* metadata — entity/entity-set, every column, every
  lookup (attribute is still a lookup, targets still allowed, nav property
  resolvable, search/business-key/condition attributes still exist). Results are
  structured `ConfigIssue`s (error/warning/info), rendered localized; **errors
  block** the import, warnings don't. Run automatically on the import screen.
- **Metadata fingerprint**: `fingerprintEntity()` hashes the attributes + lookup
  nav targets; stored on the config (`metadataFingerprint`) and recompared on
  validate → an info issue when the schema changed since the config was saved.
- **Defensive dry run**: `ImportRunner.dryRun` wraps each lookup resolution in
  try/catch — a drift/transient query failure marks that row and continues,
  never aborting the whole run.

## 7. Open items / risks to validate

- **`@odata.bind` through the SDK** — confirm that passing
  `"navprop@odata.bind": "/accounts(<guid>)"` in a create/update record binds the
  lookup. This is the one write-path assumption to verify against live Dataverse.
- **Metadata call invocation** — `getEntityMetadata` is exposed via type defs
  but the exact `executeAsync` request shape (`dataverseRequest`) is marked
  `@private`; wrap it in `SdkDataverseClient` and validate against the live env.
  Until then, `FakeDataverseClient` returns canned metadata.
- **`pac code init` tooling friction** — `pac` 2.5.1's `code init` fails
  (`Could not find the PowerApps CLI script`) because it looks for a CLI script
  layout that `@microsoft/power-apps` 1.2.5 no longer ships; the SDK's own npm
  CLI is replacing `pac code`. Resolve at the deploy milestone (try SDK npm CLI /
  align tool versions); does **not** block building against the mock.
- **Managed platform prerequisites** — env must have *Power Apps code apps*
  enabled; end users need a Power Apps Premium license.
