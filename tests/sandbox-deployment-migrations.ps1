param([Parameter(Mandatory=$true)][string]$SnapshotPath)
$ErrorActionPreference = 'Stop'
$project = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$scriptPath = Join-Path $project 'scripts\deploy-sandbox-reviewed.ps1'
$tokens = $null
$parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($scriptPath, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count -ne 0) { throw ($parseErrors | Out-String) }
$function = $ast.Find({ param($item) $item -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $item.Name -eq 'Confirm-MigrationHistory' }, $true)
if ($null -eq $function) { throw 'Migration validator missing' }
# Execute ONLY the pure function body extracted from the parsed script. Never
# dot-source or execute its approved branch; this test has no network commands.
$validate = $function.Body.GetScriptBlock()
$candidate = 'C:\Users\cezar\Desktop\bitreca-deletion-review\candidate-module-discovery-off-20261027'
$manifestPath = Join-Path $candidate 'deployment-artifact.json'
if ((Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne '9cce8a7419f15e1bd67f78c81980ed980f9f3f88aeb322371dfaeca621ebf199') { throw 'Manifest pin mismatch' }
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$names = @($manifest.files | Where-Object { $_.path.StartsWith('migrations/') } | ForEach-Object { $_.path.Substring(11) })
$snapshot = Get-Content -LiteralPath $SnapshotPath -Raw | ConvertFrom-Json
if (-not $snapshot[0].success -or $snapshot[0].meta.rows_written -ne 0 -or $snapshot[0].meta.changed_db) { throw 'Expected successful read-only D1 evidence' }
$actualJSON = $snapshot[0].results[0].migrations
Write-Output 'EXPECTED PINNED MANIFEST MIGRATIONS:'
$names
Write-Output 'ACTUAL READ-ONLY D1 MIGRATIONS:'
$actual = ConvertFrom-Json -InputObject $actualJSON
$actual
& $validate -ExpectedNames $names -MigrationJSON $actualJSON
Write-Output 'PASS: real read-only D1 result exactly matches all 13 unique manifest names'
$reversed = @($names)
[array]::Reverse($reversed)
& $validate -ExpectedNames $names -MigrationJSON (ConvertTo-Json -InputObject $reversed -Compress)
Write-Output 'PASS: ordering does not affect exact identity validation'
$unexpected = @($names); $unexpected[12] = '0014_unexpected.sql'
$duplicate = @($names); $duplicate[12] = $names[11]
$caseChanged = @($names); $caseChanged[0] = $names[0].ToUpperInvariant()
$padded = @($names); $padded[0] = ' ' + $names[0]
$nonString = @($names); $nonString[12] = 13
$cases = @(
    @{ Name='missing'; JSON=(ConvertTo-Json -InputObject @($names[0..11]) -Compress) },
    @{ Name='unexpected'; JSON=(ConvertTo-Json -InputObject $unexpected -Compress) },
    @{ Name='duplicate'; JSON=(ConvertTo-Json -InputObject $duplicate -Compress) },
    @{ Name='case mismatch'; JSON=(ConvertTo-Json -InputObject $caseChanged -Compress) },
    @{ Name='whitespace mismatch'; JSON=(ConvertTo-Json -InputObject $padded -Compress) },
    @{ Name='non-string'; JSON=(ConvertTo-Json -InputObject $nonString -Compress) },
    @{ Name='malformed JSON'; JSON='{' },
    @{ Name='scalar JSON'; JSON='"0001_create_projects.sql"' },
    @{ Name='extra migration'; JSON=(ConvertTo-Json -InputObject @($names + '0014_unexpected.sql') -Compress) }
)
foreach ($case in $cases) {
    $rejected = $false
    try { & $validate -ExpectedNames $names -MigrationJSON $case.JSON } catch { $rejected = $true }
    if (-not $rejected) { throw ('Unsafe migration input accepted: ' + $case.Name) }
    Write-Output ('PASS: rejects ' + $case.Name)
}
$rejected = $false
try { & $validate -ExpectedNames $duplicate -MigrationJSON $actualJSON } catch { $rejected = $true }
if (-not $rejected) { throw 'Duplicated manifest migration accepted' }
Write-Output 'PASS: rejects duplicate expected manifest names'
Write-Output 'PASS: entire deployment script parses; no deployment or remote call was executed by these tests'
