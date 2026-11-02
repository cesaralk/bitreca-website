param([switch]$ApprovedSigning,[switch]$PrivateConsole)
$ErrorActionPreference='Stop'
$node=(Get-Command node -ErrorAction Stop).Source
$driver=Join-Path $PSScriptRoot 'generation3-evidence.mjs'
& $node $driver --plan
if ($LASTEXITCODE -ne 0) { throw 'BLOCKED: factual generation-3 report/deployment/audit preparation is incomplete. No private key accessed.' }
if (-not $ApprovedSigning) { Write-Output 'PLAN ONLY. Separate approval opens private console; no signing or import.'; return }
if (-not $PrivateConsole) {
    Start-Process powershell.exe -WindowStyle Normal -ArgumentList @('-NoProfile','-NoExit','-ExecutionPolicy','Bypass','-File',('"'+$PSCommandPath+'"'),'-ApprovedSigning','-PrivateConsole') | Out-Null
    return
}
$secret=$null
try {
    if ([Console]::IsInputRedirected -or [Console]::IsOutputRedirected) { throw 'Private interactive owner console required.' }
    $private='C:\Users\cezar\BitrecaOwnerKeys\solo-owner-generation3\owner-key.encrypted.pk8.pem'
    $directory=Split-Path -Parent $private
    $owner=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    foreach ($path in @($directory,$private)) {
        $item=Get-Item -LiteralPath $path
        while ($item) {
            if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Key reparse point forbidden.' }
            if ($item -is [IO.FileInfo]) { $item=$item.Directory } else { $item=$item.Parent }
        }
        $acl=Get-Acl -LiteralPath $path
        if ($path -eq $directory -and -not $acl.AreAccessRulesProtected) { throw 'Protected key directory required.' }
        foreach ($rule in $acl.Access) {
            if ($rule.AccessControlType -ne 'Allow' -or $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -notin @($owner,'S-1-5-18')) { throw 'Unexpected private-key permissions.' }
        }
    }
    $tokens=$null; $errors=$null
    $ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'prepare-solo-owner-key.ps1'),[ref]$tokens,[ref]$errors)
    if ($errors.Count) { throw 'Private-input helper parse failure.' }
    $definition=$ast.Find({param($item) $item -is [Management.Automation.Language.FunctionDefinitionAst] -and $item.Name -eq 'Invoke-PrivateOpenSSL'},$true)
    if (-not $definition) { throw 'Reviewed private-input helper unavailable.' }
    Set-Item -Path 'Function:\Invoke-PrivateOpenSSL' -Value $definition.Body.GetScriptBlock()
    # Reuse the anonymous-stdin helper with Node; never pass secrets in arguments/environment/files.
    $openssl=$node
    Write-Host 'Keep transcripts, recording, screen sharing and debugging OFF. Enter your existing passphrase only in the hidden prompt.'
    $secret=Read-Host 'Existing generation-3 owner passphrase' -AsSecureString
    if ($secret.Length -lt 20) { throw 'Expected existing generation-3 passphrase length.' }
    Invoke-PrivateOpenSSL @($driver,'--approved-signing') $secret 'offline generation-3 signing'
    & $node $driver --verify-signed
    if ($LASTEXITCODE -ne 0) { throw 'Public signed-envelope verification failed.' }
    Write-Host 'Offline signature verified. No evidence import, network operation or activation occurred.'
} catch {
    throw 'Offline signing stopped. Preserve outputs. No automatic retry or private diagnostics.'
} finally {
    if ($secret) { $secret.Dispose() }
    Read-Host 'Press Enter to finish (never enter passphrase here)' | Out-Null
}
