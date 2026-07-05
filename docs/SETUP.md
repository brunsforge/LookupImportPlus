# Setup & Trial Onboarding

Two tracks (see docs/ARCHITECTURE.md): **local/offline** for development, and
**cloud** for testing against a real Dataverse trial.

---

## A. Local development (no Dataverse needed)

Everything runs against the in-memory `FakeDataverseClient` (seeded demo data,
including two colliding "Contoso GmbH" accounts to exercise conflicts).

```bash
npm install
npm run dev        # → http://localhost:3000  (real Fluent UI app, demo data)
npm test           # 33 unit tests (resolver, compiler, excel, import runner)
npm run typecheck  # tsc, no emit
npm run build      # tsc + vite build
```

Try the flow: **Job-Konfigurationen → Import starten → „Demo-Datei laden" →**
resolve the Contoso conflict in the **Konfliktkorb → Commit** → see it in
**Importhistorie**. Or **Export → open the XLSX** (note the hidden
`_LookupImportPlus` sheet + hidden technical columns), edit it, re-upload.

---

## B. Cloud: test against a Dataverse trial

### Authentication, app registration & privileges

**Do you need an Entra app registration?**
- **Interactive deploy (this trial): No.** `pac auth create` signs you in
  interactively as a maker; `pac code push` publishes as you. The app's runtime
  auth is handled by the Power Apps host (Entra) + connector consent — no custom
  app registration is required to deploy or to run.
- **Unattended CI/CD: limited.** A Service Principal would need its own app
  registration, **but Power Platform currently does not allow a Service Principal
  to create or own a code app** (see the platform limitations). So there is no
  fully-unattended `pac code push` today — deploy runs as an interactive maker.
  (You can still automate build/test in CI; only the publish step needs a user.)

**Privileges / prerequisites**
- **Environment**: *Power Apps code apps* feature enabled (admin — see B0).
- **Your user**: a **Power Apps Premium** license; a security role that allows
  app authoring + customization and **create/read/write on the target tables**.
  On a trial you own, **System Administrator** is the simplest.
- **Connection**: a **Dataverse connection** in the environment (created by you
  as maker) — the data source binds to it. No secret is stored in the app.

### One-command deploy

```powershell
pwsh ./scripts/deploy.ps1 -EnvironmentUrl https://<yourorg>.crm.dynamics.com
```
Runs: auth check → `npm ci` → build → `pac code init` (if needed) →
`pac code add-data-source` for `account`,`contact` → `pac code push`.
The one step that may still need a hand is `pac code init` (B1 tooling issue);
the script tells you if it hits that. Override tables/connector with
`-Tables a,b` / `-DataverseApiId ...`; skip install with `-SkipInstall`.

### B0. Get a trial & enable code apps
1. Sign up for a **Power Apps Developer Plan / trial** (gives you a Dataverse
   environment). End users running code apps need a **Power Apps Premium** license.
2. In the **Power Platform Admin Center** → your environment → **Settings →
   Product → Features** → enable **Power Apps code apps**.
3. Authenticate the CLI to that environment:
   ```bash
   pac auth create --environment <https://<yourorg>.crm.dynamics.com>
   pac auth list        # confirm the Active profile points at the trial
   ```

> ✅ **Toolchain fixed.** The old `pac code init` failure (pac 2.5.1,
> `Could not find the PowerApps CLI script`) is resolved by updating pac:
> `dotnet tool update --global Microsoft.PowerApps.CLI.Tool` → **pac ≥ 2.8**.
> pac 2.8 delegates to the bundled **`npx power-apps` CLI** (init / login /
> create-connection / add-data-source / push). Use that CLI below.
> The `npx power-apps` CLI has its **own** auth cache — you must
> `npx power-apps login` even if `pac auth` is already signed in.

### B1. Initialize the code app
```bash
pac code init --displayName "LookupImportPlus"   # writes power.config.json
```
We ship a hand-written `src/PowerProvider.tsx`, so only `power.config.json` is
needed from init. (A harmless `Assertion failed … async.c` line may print after
success on Windows — ignore it.)

### B2. Sign in, connect, add Dataverse data sources
```bash
npx power-apps login                              # browser sign-in (own cache)
npx power-apps create-connection --api-id dataverse
npx power-apps add-data-source --api-id dataverse --resource-name account
npx power-apps add-data-source --api-id dataverse --resource-name contact
```
`add-data-source` generates typed models/services + the `DataSourcesInfo` the
SDK client needs, so run it **before** the build.

### B3. Wire the live client
Once B2 has generated the Dataverse `DataSourcesInfo`, complete
`src/app/clientFactory.ts` to build the live client (one small, localized change):
```ts
import { getClient } from "@microsoft/power-apps/data";
import { SdkDataverseClient } from "@/data/SdkDataverseClient";
// const dataClient = getClient(generatedDataSourcesInfo);
// const client = new SdkDataverseClient(dataClient, { apiBaseUrl: "<org>/api/data/v9.2/" });
// return new AppContainer(client, demoConfigs());
```
Then validate the two open items from ARCHITECTURE.md §7 against live:
- `@odata.bind` binding (ImportRunner write path),
- the `getEntityMetadata` `executeAsync` request shape.

### B4. Run & publish
```bash
npm run build
npx power-apps run    # local dev against the live connections
npx power-apps push   # publish; then open from make.powerapps.com → Apps
```
Or do B1–B4 in one go: **`npm run deploy`** (see `scripts/deploy.ps1`).

### B5. (Phase 2) Audit tables `lip_*`
For persisted job/audit history, create the `lip_*` tables (see
docs/data-model.md) and add them as data sources. Not required for the first
core test (metadata + resolve + write); the MVP keeps config + history in memory.

---

## What to test first on the trial
1. App loads in the Power Apps host, lists the demo config.
2. Metadata loads for `contact` (attributes, and `parentcustomerid` targets).
3. Export a template, add rows referencing real accounts (incl. two with the
   same name), re-import.
4. Dry run classifies rows; ambiguous names land in the Konfliktkorb.
5. Resolve a conflict; **Commit** writes contacts with the correct
   `parentcustomerid` set via `@odata.bind`.
6. Verify the written records in Dataverse.
