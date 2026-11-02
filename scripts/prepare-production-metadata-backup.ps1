param([switch]$ReadOnlyExport)
$ErrorActionPreference='Stop'
$directory='C:\Users\cezar\BitrecaProductionRecovery\deletion-release-20261030'
$candidate='C:\Users\cezar\Desktop\bitreca-deletion-review\deletion-production-candidate-20261029'
$database='8ff2d1f7-e747-4fe8-a6a3-87898e1ae79a'
if (-not $ReadOnlyExport) { Write-Output ('PLAN ONLY: read-only D1 export of bitreca-db to a new owner/SYSTEM-only local directory: '+$directory); return }
if (Test-Path -LiteralPath $directory) { throw 'Backup directory exists; preserve it without overwrite.' }
$config=Get-Content -LiteralPath (Join-Path $candidate 'main.wrangler.jsonc') -Raw | ConvertFrom-Json
if ($config.name -cne 'bitreca-website' -or $config.d1_databases.Count -ne 1 -or $config.d1_databases[0].database_name -cne 'bitreca-db' -or $config.d1_databases[0].database_id -cne $database) { throw 'Production identity differs.' }
if ((Get-FileHash -LiteralPath (Join-Path $candidate 'deployment-artifact.json') -Algorithm SHA256).Hash.ToLowerInvariant() -cne '39a757be83bf446aa126e4241604ac0ae03b7abec1f8e035e10d3ea468fa6e73') { throw 'Candidate manifest differs.' }
$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
$acl=[Security.AccessControl.DirectorySecurity]::new()
$acl.SetOwner($sid); $acl.SetAccessRuleProtection($true,$false)
foreach ($identity in @($sid,[Security.Principal.SecurityIdentifier]::new('S-1-5-18'))) { $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($identity,'FullControl','ContainerInherit,ObjectInherit','None','Allow')) }
[IO.Directory]::CreateDirectory($directory,$acl) | Out-Null
$output=Join-Path $directory 'production-before-migration16.sql'
$node=(Get-Command node -ErrorAction Stop).Source
$wrangler=Join-Path $PSScriptRoot '..\node_modules\wrangler\bin\wrangler.js'
# Fixed exact target. Capture all CLI diagnostics; never print SQL or auth output.
try {
    $oldAccount=$env:CLOUDFLARE_ACCOUNT_ID; $oldMetrics=$env:WRANGLER_SEND_METRICS
    $env:CLOUDFLARE_ACCOUNT_ID='4ec868eac2a3b9127531ad39d2501f15'; $env:WRANGLER_SEND_METRICS='false'
    $null=& $node $wrangler d1 export bitreca-db --remote --config (Join-Path $candidate 'main.wrangler.jsonc') --output $output 2>&1
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $output) -or (Get-Item -LiteralPath $output).Length -eq 0) { throw 'Read-only metadata export failed; no automatic retry.' }
} finally { $env:CLOUDFLARE_ACCOUNT_ID=$oldAccount; $env:WRANGLER_SEND_METRICS=$oldMetrics }
$receipt=[ordered]@{databaseName='bitreca-db';databaseId=$database;createdAt=[DateTimeOffset]::UtcNow.ToUnixTimeSeconds();path=$output;bytes=(Get-Item -LiteralPath $output).Length;sha256=(Get-FileHash -LiteralPath $output -Algorithm SHA256).Hash.ToLowerInvariant();remoteRowsChanged=$false;restoreTested=$false;objectBackup=$false}
$receiptPath='C:\Users\cezar\Desktop\bitreca-deletion-review\production-metadata-backup-20261030.json'
$file=[IO.File]::Open($receiptPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
try { $bytes=[Text.UTF8Encoding]::new($false).GetBytes(($receipt | ConvertTo-Json)+"`n"); $file.Write($bytes,0,$bytes.Length); $file.Flush($true) } finally { $file.Dispose() }
Write-Output 'PASS: production metadata exported read-only to owner/SYSTEM-only storage; public digest receipt preserved. No SQL contents, credential values, remote mutations or restores.'
