param([switch]$Approved)
$ErrorActionPreference = 'Stop'
$project = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$candidate = 'C:\Users\cezar\Desktop\bitreca-deletion-review\candidate-module-discovery-off-20261027'
$pin = '9cce8a7419f15e1bd67f78c81980ed980f9f3f88aeb322371dfaeca621ebf199'
$account = '4ec868eac2a3b9127531ad39d2501f15'
$node = (Get-Command node -ErrorAction Stop).Source
$wrangler = Join-Path $project 'node_modules\wrangler\bin\wrangler.js'
$verifier = Join-Path $project 'scripts\prepare-portfolio-staging.mjs'
$expected = @(
    @{ Name='bitreca-main-delete-sandbox-20261025'; Config='main.wrangler.jsonc'; Version='8cd0d626-b2f3-45e9-b813-5f6fecdc6701' },
    @{ Name='bitreca-hosting-delete-sandbox-20261025'; Config='hosting.wrangler.jsonc'; Version='c94bc0ed-f2b5-4734-bc08-68510bd7f7f1' }
)
function Get-LatestSandboxDeployment {
    param([string]$HistoryJSON)
    # Wrangler returns oldest first in this account. Never treat index 0 as live.
    $history = ConvertFrom-Json -InputObject $HistoryJSON -ErrorAction Stop
    if ($null -eq $history -or @($history).Count -eq 0) { throw 'No deployment history' }
    $ordered = @($history | Sort-Object { [DateTimeOffset]::Parse($_.created_on) } -Descending)
    if ($ordered.Count -gt 1 -and [DateTimeOffset]::Parse($ordered[0].created_on) -eq [DateTimeOffset]::Parse($ordered[1].created_on)) { throw 'Ambiguous latest deployment' }
    $active = @($ordered[0].versions)
    if ($active.Count -ne 1 -or $active[0].percentage -ne 100) { throw 'Expected single-version 100% deployment' }
    return $ordered[0]
}
function Invoke-SandboxDeploymentSequence {
    param([object[]]$Workers, [scriptblock]$CheckPackage, [scriptblock]$Deploy, [scriptblock]$Verify)
    if ($Workers.Count -ne 2 -or $Workers[0].Name -cne 'bitreca-main-delete-sandbox-20261025' -or $Workers[1].Name -cne 'bitreca-hosting-delete-sandbox-20261025') { throw 'Exactly the two distinct approved sandbox Workers are required' }
    $confirmed = 0
    foreach ($deploymentTarget in $Workers) {
        & $CheckPackage
        Write-Output ('START: ' + $deploymentTarget.Name)
        $uploadedVersion = & $Deploy $deploymentTarget
        if ($uploadedVersion -isnot [string] -or $uploadedVersion -cnotmatch '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') { throw ('Upload version unconfirmed: ' + $deploymentTarget.Name) }
        $verification = & $Verify $deploymentTarget $uploadedVersion
        if ($verification.Verified -ne $true -or $verification.Name -cne $deploymentTarget.Name -or $verification.Version -cne $uploadedVersion) { throw ('Active deployment unverified: ' + $deploymentTarget.Name) }
        $confirmed++
        Write-Output ('VERIFIED: ' + $deploymentTarget.Name + ' active version ' + $uploadedVersion)
    }
    if ($confirmed -ne 2) { throw 'Partial sandbox deployment; stop for investigation' }
    Write-Output 'Both frozen sandbox deployments completed and individually verified. No cutover or deletion is authorized by this script.'
}
function Confirm-MigrationHistory {
    param([object[]]$ExpectedNames, [string]$MigrationJSON)
    # Assign JSON first: Windows PowerShell wraps the array as one element when
    # ConvertFrom-Json is used directly inside @(...), breaking Compare-Object.
    $actualNames = ConvertFrom-Json -InputObject $MigrationJSON -ErrorAction Stop
    if ($ExpectedNames.Count -ne 13 -or $actualNames -isnot [System.Array] -or $actualNames.Count -ne 13) {
        throw 'Migration history must contain exactly 13 names in a JSON array'
    }
    $expectedSet = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
    $actualSet = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
    foreach ($name in $ExpectedNames) {
        if ($name -isnot [string] -or $name -cnotmatch '^[0-9]{4}_[a-z0-9_]+\.sql$' -or -not $expectedSet.Add($name)) {
            throw 'Reviewed migration names are invalid or duplicated'
        }
    }
    foreach ($name in $actualNames) {
        if ($name -isnot [string] -or $name -cnotmatch '^[0-9]{4}_[a-z0-9_]+\.sql$' -or -not $actualSet.Add($name)) {
            throw 'D1 migration names are invalid or duplicated'
        }
    }
    if (-not $expectedSet.SetEquals($actualSet)) {
        throw 'Migration history differs from reviewed package: missing or unexpected names'
    }
}
function Confirm-Package {
    if ((Get-FileHash -LiteralPath (Join-Path $candidate 'deployment-artifact.json') -Algorithm SHA256).Hash.ToLowerInvariant() -ne $pin) { throw 'Manifest pin mismatch' }
    $verification = & $node $verifier --verify $candidate
    if ($LASTEXITCODE -ne 0) { throw 'Package integrity or sandbox contract failed' }
    $result = ($verification -join "`n") | ConvertFrom-Json
    if ($result.artifactSha256 -ne $pin -or $result.target -ne 'portfolioforest-delete-sandbox') { throw 'Unexpected package' }
    foreach ($worker in $expected) {
        $configuration = Get-Content -LiteralPath (Join-Path $candidate $worker.Config) -Raw | ConvertFrom-Json
        if ($null -eq $configuration.find_additional_modules -or $configuration.find_additional_modules -ne $false) { throw 'Additional module discovery must be disabled' }
    }
}
Confirm-Package
if (-not $Approved) {
    Write-Output 'PLAN ONLY: no remote calls. After explicit approval, rerun with -Approved.'
    foreach ($worker in $expected) {
        Write-Output ("node '$wrangler' deploy --no-bundle --no-autoconfig --strict --config '" + (Join-Path $candidate $worker.Config) + "'")
    }
    return
}
# -Approved is an operator gate, not a substitute for explicit user approval.
# No protocol/policy writes, secret operations, routes, Cron or public access.
$previousAccount = $env:CLOUDFLARE_ACCOUNT_ID
$previousMetrics = $env:WRANGLER_SEND_METRICS
try {
    $env:CLOUDFLARE_ACCOUNT_ID = $account
    $env:WRANGLER_SEND_METRICS = 'false'
    $identityText = & $node $wrangler whoami --json
    if ($LASTEXITCODE -ne 0) { throw 'Account read failed' }
    $identity = ($identityText -join "`n") | ConvertFrom-Json
    if (-not ($identity.accounts | Where-Object { $_.id -eq $account })) { throw 'Expected account unavailable' }
    foreach ($worker in $expected) {
        $config = Join-Path $candidate $worker.Config
        $historyText = & $node $wrangler deployments list --config $config --json
        if ($LASTEXITCODE -ne 0) { throw 'Deployment baseline read failed' }
        $currentDeployment = Get-LatestSandboxDeployment -HistoryJSON ($historyText -join "`n")
        $active = @($currentDeployment.versions)
        if ($active.Count -ne 1 -or $active[0].version_id -ne $worker.Version -or $active[0].percentage -ne 100) { throw 'Sandbox baseline drifted; stop for review' }
    }
    $planText = & $node (Join-Path $project 'scripts\check-portfolio-sandbox.mjs')
    if ($LASTEXITCODE -ne 0) { throw 'Local sandbox contract failed' }
    $readPlan = ($planText -join "`n") | ConvertFrom-Json
    $databaseText = & $node $wrangler d1 execute bitreca-delete-sandbox-db-20261025 --remote --json --config (Join-Path $candidate 'main.wrangler.jsonc') --command $readPlan.readOnlyChecks[0].sql
    if ($LASTEXITCODE -ne 0) { throw 'D1 baseline read failed' }
    $database = @(($databaseText -join "`n") | ConvertFrom-Json)
    $row = $database[0].results[0]
    if (-not $database[0].success -or $database[0].meta.rows_written -ne 0 -or $database[0].meta.changed_db) { throw 'Unexpected D1 read result' }
    foreach ($field in @('portfolios','allocations','unsettled_or_untracked','minimum_protocol','epochs','deletion_jobs','policy_revision','cleanup_enabled','finalization_enabled')) {
        if ($null -eq $row.$field -or $row.$field -ne 0) { throw ('D1 baseline drift: ' + $field) }
    }
    $manifest = Get-Content -LiteralPath (Join-Path $candidate 'deployment-artifact.json') -Raw | ConvertFrom-Json
    $migrationNames = @($manifest.files | Where-Object { $_.path.StartsWith('migrations/') } | ForEach-Object { $_.path.Substring(11) })
    Confirm-MigrationHistory -ExpectedNames $migrationNames -MigrationJSON $row.migrations
    # Every distinct target must upload AND pass read-only active-version, source
    # and frozen-binding verification before the final success message is emitted.
    Invoke-SandboxDeploymentSequence -Workers $expected -CheckPackage { Confirm-Package } -Deploy {
        param($deploymentTarget)
        $uploadText = & $node $wrangler deploy --no-bundle --no-autoconfig --strict --config (Join-Path $candidate $deploymentTarget.Config)
        $uploadExit = $LASTEXITCODE
        $uploadText | ForEach-Object { Write-Host $_ }
        if ($uploadExit -ne 0) { throw ('Deployment failed for ' + $deploymentTarget.Name + '; stop. Keep freeze/deletion flags unchanged; do not roll back to untracked code.') }
        $versionMatches = [regex]::Matches(($uploadText -join "`n"), 'Current Version ID:\s*([0-9a-f-]{36})')
        if ($versionMatches.Count -ne 1) { throw ('Cannot confirm uploaded version for ' + $deploymentTarget.Name) }
        return $versionMatches[0].Groups[1].Value
    } -Verify {
        param($deploymentTarget, $uploadedVersion)
        $verificationText = & $node (Join-Path $project 'scripts\verify-sandbox-deployment.mjs') $candidate $deploymentTarget.Name $uploadedVersion
        if ($LASTEXITCODE -ne 0) { throw ('Post-deployment verification failed for ' + $deploymentTarget.Name + '; partial completion cannot report full success.') }
        return (($verificationText -join "`n") | ConvertFrom-Json)
    }
} finally {
    $env:CLOUDFLARE_ACCOUNT_ID = $previousAccount
    $env:WRANGLER_SEND_METRICS = $previousMetrics
}
