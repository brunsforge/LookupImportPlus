<#
.SYNOPSIS
  Build & publish the LookupImportPlus code app to a Dataverse environment.

.DESCRIPTION
  Uses the modern `npx power-apps` CLI (bundled with @microsoft/power-apps and
  invoked by pac >= 2.8). Sequence a signed-in maker runs:
    login -> npm install -> init (if needed) -> create Dataverse connection
    -> add data sources (account, contact) -> build -> push.

  Data sources are added BEFORE the build because add-data-source generates the
  typed Dataverse model/service code that the build then compiles.

  Automation note: `login` and `create-connection` may open a browser, so run
  this interactively as your maker account. (Power Platform does not allow a
  Service Principal to own a code app, so there is no fully-unattended push.)

.PARAMETER Tables
  Dataverse tables to add as data sources. Default: account, contact.

.PARAMETER SkipInstall
  Skip `npm install`.

.EXAMPLE
  npm run deploy
#>
[CmdletBinding()]
param(
  [string[]] $Tables = @("account", "contact"),
  [switch] $SkipInstall
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Step($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }
function PA { npx power-apps @args }

# 1) Auth (npm CLI has its own cache, separate from pac) --------------------
Step "1/7 Sign in"
$status = (PA auth-status 2>&1) -join "`n"
if ($status -match "Not signed in") {
  Write-Host "Opening browser for sign-in..."
  PA login
} else {
  Write-Host $status
}

# 2) Install ----------------------------------------------------------------
if (-not $SkipInstall) { Step "2/7 npm install"; npm install } else { Step "2/7 npm install (skipped)" }

# 3) Init (idempotent) ------------------------------------------------------
Step "3/7 Ensure code app is initialized"
if (-not (Test-Path (Join-Path $root "power.config.json"))) {
  pac code init --displayName "LookupImportPlus"
} else {
  Write-Host "power.config.json present - skipping init."
}

# 4) Dataverse connection ---------------------------------------------------
Step "4/7 Ensure a Dataverse connection exists"
$conns = (PA list-connections 2>&1) -join "`n"
if ($conns -notmatch "dataverse") {
  Write-Host "Creating a Dataverse connection..."
  PA create-connection --api-id dataverse
} else {
  Write-Host "A Dataverse connection already exists."
}

# 5) Data sources (generate typed models) -----------------------------------
Step "5/7 Add Dataverse data sources: $($Tables -join ', ')"
foreach ($t in $Tables) {
  Write-Host "-> $t"
  try { PA add-data-source --api-id dataverse --resource-name $t }
  catch { Write-Host "   (skipped/exists: $($_.Exception.Message))" -ForegroundColor DarkYellow }
}

# 6) Build ------------------------------------------------------------------
Step "6/7 Build (tsc + vite)"
npm run build

# 7) Push -------------------------------------------------------------------
Step "7/7 Publish"
PA push

Write-Host "`nDone. Open the app from https://make.powerapps.com (Apps)." -ForegroundColor Green
