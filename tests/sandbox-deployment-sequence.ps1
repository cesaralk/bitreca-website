$ErrorActionPreference = 'Stop'
$scriptPath = Join-Path $PSScriptRoot '..\scripts\deploy-sandbox-reviewed.ps1'
$tokens = $null; $errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile([System.IO.Path]::GetFullPath($scriptPath), [ref]$tokens, [ref]$errors)
if ($errors.Count -ne 0) { throw ($errors | Out-String) }
function Extract-Body([string]$Name) {
    $definition = $ast.Find({ param($item) $item -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $item.Name -eq $Name }, $true)
    if ($null -eq $definition) { throw ('Function missing: ' + $Name) }
    return $definition.Body.GetScriptBlock()
}
# Only pure orchestration/chronology function bodies run. All deployment and
# verification callbacks below are local mocks; the full script is never invoked.
$sequence = Extract-Body 'Invoke-SandboxDeploymentSequence'
$latest = Extract-Body 'Get-LatestSandboxDeployment'
$workers = @(
    @{Name='bitreca-main-delete-sandbox-20261025';Config='main.wrangler.jsonc'},
    @{Name='bitreca-hosting-delete-sandbox-20261025';Config='hosting.wrangler.jsonc'}
)
$versions = @('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222')
foreach ($scenario in @('success','main upload failure','hosting upload failure','hosting verify failure','uploaded but not active','wrong Worker verification','missing upload version')) {
    $state = @{Deploys=(New-Object System.Collections.ArrayList); Verifies=(New-Object System.Collections.ArrayList); Output=(New-Object System.Collections.ArrayList); Checks=0}
    $deploy = {
        param($target)
        $null = $state.Deploys.Add($target.Name)
        $index = if ($target.Name -eq $workers[0].Name) { 0 } else { 1 }
        if (($scenario -eq 'main upload failure' -and $index -eq 0) -or ($scenario -eq 'hosting upload failure' -and $index -eq 1)) { throw 'Mock native process exit failure' }
        if ($scenario -eq 'missing upload version') { return $null }
        return $versions[$index]
    }
    $verify = {
        param($target, $version)
        $null = $state.Verifies.Add($target.Name)
        if ($scenario -eq 'uploaded but not active') { throw 'Mock uploaded version absent from latest active deployment' }
        $reportedName = if ($scenario -eq 'wrong Worker verification') { 'wrong-worker' } else { $target.Name }
        return @{Name=$reportedName;Version=$version;Verified=(-not ($scenario -eq 'hosting verify failure' -and $target.Name -eq $workers[1].Name))}
    }
    $thrown = $false
    try {
        & $sequence -Workers $workers -CheckPackage { $state.Checks++ } -Deploy $deploy -Verify $verify | ForEach-Object { $null = $state.Output.Add($_) }
    } catch { $thrown = $true }
    $fullSuccess = @($state.Output | Where-Object { $_ -match '^Both frozen sandbox deployments completed and individually verified' }).Count
    if ($scenario -eq 'success') {
        if ($thrown -or $fullSuccess -ne 1 -or $state.Checks -ne 2 -or $state.Deploys.Count -ne 2 -or $state.Verifies.Count -ne 2) { throw 'Successful two-Worker orchestration failed' }
        for ($i=0; $i -lt 2; $i++) {
            if ($state.Deploys[$i] -cne $workers[$i].Name -or $state.Verifies[$i] -cne $workers[$i].Name) { throw 'Distinct Worker targeting/verification failed' }
        }
    } elseif (-not $thrown -or $fullSuccess -ne 0) { throw ('Partial completion reported success: ' + $scenario) }
    Write-Output ('PASS: ' + $scenario)
}
$history = @(
    @{id='old';created_on='2026-10-25T22:00:00Z';versions=@(@{version_id='old';percentage=100})},
    @{id='new';created_on='2026-10-27T16:42:00Z';versions=@(@{version_id='new';percentage=100})}
)
foreach ($order in @('oldest-first','newest-first')) {
    $inputHistory = @($history)
    if ($order -eq 'newest-first') { [array]::Reverse($inputHistory) }
    $result = & $latest -HistoryJSON (ConvertTo-Json -InputObject $inputHistory -Depth 10)
    if ($result.id -ne 'new') { throw 'Latest deployment selection used array position' }
    Write-Output ('PASS: latest active deployment from ' + $order + ' history')
}
$duplicate = @($workers[0],$workers[0]); $rejected = $false
try { & $sequence -Workers $duplicate -CheckPackage { throw 'Must reject before package callback' } -Deploy { throw 'No deploy allowed' } -Verify { throw 'No verify allowed' } } catch { $rejected = $true }
if (-not $rejected) { throw 'Duplicate Worker targets accepted' }
Write-Output 'PASS: duplicate targets rejected'
$calls = @($ast.FindAll({ param($item) $item -is [System.Management.Automation.Language.CommandAst] -and $item.GetCommandName() -eq 'Invoke-SandboxDeploymentSequence' }, $true))
if ($calls.Count -ne 1) { throw 'Approved branch must use the tested orchestration exactly once' }
Write-Output 'PASS: approved branch uses tested orchestration; PowerShell parser has zero errors; no network/deployments performed'
