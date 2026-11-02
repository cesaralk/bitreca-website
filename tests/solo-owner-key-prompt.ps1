$ErrorActionPreference='Stop'
$path=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\scripts\prepare-solo-owner-key.ps1'))
$tokens=$null; $errors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile($path,[ref]$tokens,[ref]$errors)
if ($errors.Count) { throw ($errors | Out-String) }
function Extract([string]$Name) {
    $definition=$ast.Find({param($item) $item -is [Management.Automation.Language.FunctionDefinitionAst] -and $item.Name -eq $Name},$true)
    if (-not $definition) { throw ('Missing function: '+$Name) }
    return $definition.Body.GetScriptBlock()
}
$confirm=Extract 'Confirm-PrivatePassphrase'
$invoke=Extract 'Invoke-PrivateOpenSSL'
# PUBLIC synthetic test strings only, no owner key/passphrase or key generation.
$first=ConvertTo-SecureString 'public-fixture-phrase-12345' -AsPlainText -Force
$same=ConvertTo-SecureString 'public-fixture-phrase-12345' -AsPlainText -Force
$wrong=ConvertTo-SecureString 'public-fixture-phrase-54321' -AsPlainText -Force
$short=ConvertTo-SecureString 'short' -AsPlainText -Force
try {
    & $confirm $first $same
    foreach ($pair in @(@($first,$wrong),@($short,$short))) {
        $rejected=$false
        try { & $confirm $pair[0] $pair[1] } catch { $rejected=$true }
        if (-not $rejected) { throw 'Invalid passphrase confirmation was accepted.' }
    }
    # A fake child replaces OpenSSL entirely: checks stdin transport and exit
    # handling without invoking OpenSSL, producing a key or touching key storage.
    $openssl='C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe'
    & $invoke -Arguments @('-NoProfile','-NonInteractive','-Command', '$received=[Console]::ReadLine();if($received.Length -ne 27){exit 23};exit 0') -Passphrase $first -Stage 'mock private stdin'
    $rejected=$false
    try { & $invoke -Arguments @('-NoProfile','-NonInteractive','-Command','exit 17') -Passphrase $first -Stage 'mock failure' } catch { $rejected=$true }
    if (-not $rejected) { throw 'Child failure was not propagated.' }
} finally {
    $first.Dispose(); $same.Dispose(); $wrong.Dispose(); $short.Dispose()
}
Write-Output 'PASS: entire script parsed; matching/short/mismatched SecureString checks; private stdin mock; child failure stops. No key generation or Cloudflare calls.'
