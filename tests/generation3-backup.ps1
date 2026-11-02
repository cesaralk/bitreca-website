$ErrorActionPreference='Stop'
$tokens=$null; $errors=$null
$path=Join-Path $PSScriptRoot '..\scripts\backup-generation3-key.ps1'
$ast=[Management.Automation.Language.Parser]::ParseFile($path,[ref]$tokens,[ref]$errors)
if ($errors.Count) { throw ($errors | Out-String) }
foreach ($name in @('Assert-BackupDrive','Assert-SeparateBackupDisk','Copy-EncryptedBackupNew','Assert-BackupChecks')) {
    $definition=$ast.Find({param($item) $item -is [Management.Automation.Language.FunctionDefinitionAst] -and $item.Name -eq $name},$true)
    Set-Item -Path ('Function:\'+$name) -Value $definition.Body.GetScriptBlock()
}
function MustReject([scriptblock]$Action) {
    $rejected=$false; try { & $Action } catch { $rejected=$true }
    if (-not $rejected) { throw 'Expected rejection.' }
}
Assert-BackupDrive 'E:\' 'USB' 'C:'
MustReject { Assert-BackupDrive 'C:\' 'USB' 'C:' }
MustReject { Assert-BackupDrive 'E:\' 'SATA' 'C:' }
MustReject { Assert-BackupDrive '\\server\share\' 'USB' 'C:' }
Assert-SeparateBackupDisk 'PUBLIC-USB-ID' 'PUBLIC-SOURCE-ID'
MustReject { Assert-SeparateBackupDisk 'PUBLIC-SOURCE-ID' 'PUBLIC-SOURCE-ID' }
MustReject { Assert-SeparateBackupDisk '' 'PUBLIC-SOURCE-ID' }
$fingerprint='7e0d344e4de13d5cdd773482346ef7e3d5c57d411555bdf4db7f0ed028214a4e'
MustReject { Assert-BackupChecks $false $true $fingerprint $true }
MustReject { Assert-BackupChecks $true $false $fingerprint $true }
MustReject { Assert-BackupChecks $true $true ('0'*64) $true }
MustReject { Assert-BackupChecks $true $true $fingerprint $false }
$temporary=Join-Path ([IO.Path]::GetTempPath()) ('bitreca-backup-test-'+[guid]::NewGuid().ToString())
$null=New-Item -ItemType Directory -Path $temporary
$source=Join-Path $temporary 'PUBLIC-SYNTHETIC.txt'
$destination=Join-Path $temporary 'PUBLIC-SYNTHETIC.copy.txt'
[IO.File]::WriteAllText($source,'PUBLIC synthetic copy fixture; not a key')
Copy-EncryptedBackupNew $source $destination
if ((Get-FileHash -LiteralPath $source).Hash -cne (Get-FileHash -LiteralPath $destination).Hash) { throw 'Synthetic copy mismatch.' }
MustReject { Copy-EncryptedBackupNew $source $destination }
if ((Get-Content -LiteralPath $source -Raw) -cne 'PUBLIC synthetic copy fixture; not a key') { throw 'Source changed.' }
Write-Output 'PASS: complete script parses; system/network/non-USB destinations rejected; integrity/recovery/fingerprint/offline failures block confirmation; synthetic copy integrity and no-overwrite verified. No keys, USB, Cloudflare or operational receipt accessed.'
