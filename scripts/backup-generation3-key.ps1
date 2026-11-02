param([switch]$ApprovedBackup,[switch]$PrivateConsole)
$ErrorActionPreference='Stop'
$sourceDirectory='C:\Users\cezar\BitrecaOwnerKeys\solo-owner-generation3'
$reviewDirectory='C:\Users\cezar\Desktop\bitreca-deletion-review'
$receiptPath=Join-Path $reviewDirectory 'generation3-backup-confirmation.json'
$publicPinPath=Join-Path $reviewDirectory 'generation3-backup-public-pin.json'
$expectedFingerprint='7e0d344e4de13d5cdd773482346ef7e3d5c57d411555bdf4db7f0ed028214a4e'
$openssl='C:\Program Files\Git\usr\bin\openssl.exe'

function Assert-BackupDrive {
    param([string]$Root,[string]$BusType,[string]$SystemDrive)
    if ($Root -cnotmatch '^[D-Z]:\\$' -or $Root.TrimEnd('\') -ieq $SystemDrive -or $BusType -cne 'USB') {
        throw 'A separate physical USB volume is required; system, network and non-USB drives are forbidden.'
    }
}
function Assert-NoBackupReparsePoints {
    param([string]$Path)
    $item=Get-Item -LiteralPath $Path -ErrorAction Stop
    while ($item) {
        if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Reparse points are forbidden.' }
        if ($item -is [IO.FileInfo]) { $item=$item.Directory } else { $item=$item.Parent }
    }
}
function Assert-SeparateBackupDisk {
    param([string]$BackupDiskId,[string]$SourceDiskId)
    if (-not $BackupDiskId -or -not $SourceDiskId -or $BackupDiskId -ceq $SourceDiskId) { throw 'Backup must be on a separate physical disk from the source key.' }
}
function Get-BackupUsbIdentity {
    param([string]$Letter,[string]$SourceDiskId)
    if ($Letter -cnotmatch '^[D-Z]$') { throw 'Enter one USB drive letter, for example E.' }
    $partitions=@(Get-Partition -DriveLetter $Letter -ErrorAction Stop)
    if ($partitions.Count -ne 1) { throw 'Ambiguous USB partition.' }
    $disk=Get-Disk -Number $partitions[0].DiskNumber -ErrorAction Stop
    $volume=Get-Volume -DriveLetter $Letter -ErrorAction Stop
    $root=$Letter+':\'
    Assert-BackupDrive $root ([string]$disk.BusType) $env:SystemDrive
    if (-not $disk.UniqueId -or -not $volume.UniqueId) { throw 'USB disk and volume identities must be available.' }
    Assert-SeparateBackupDisk ([string]$disk.UniqueId) $SourceDiskId
    Assert-NoBackupReparsePoints $root
    return ($disk.UniqueId+'|'+$volume.UniqueId+'|'+$partitions[0].PartitionNumber+'|'+$disk.Size)
}
function Copy-EncryptedBackupNew {
    param([string]$Source,[string]$Destination)
    # Only ciphertext streams. No plaintext private key is ever exported.
    $inputFile=$null; $outputFile=$null; $hasher=$null
    try {
        $inputFile=[IO.File]::Open($Source,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
        if ($inputFile.Length -eq 0) { throw 'Source key is empty.' }
        $hasher=[Security.Cryptography.SHA256]::Create()
        $sourceDigest=[Convert]::ToBase64String($hasher.ComputeHash($inputFile))
        $inputFile.Position=0
        $outputFile=[IO.File]::Open($Destination,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
        $inputFile.CopyTo($outputFile); $outputFile.Flush($true); $outputFile.Dispose(); $outputFile=$null
        $backupDigest=(Get-FileHash -LiteralPath $Destination -Algorithm SHA256).Hash
        $sourceHex=[BitConverter]::ToString([Convert]::FromBase64String($sourceDigest)).Replace('-','')
        if ($sourceHex -cne $backupDigest) { throw 'Encrypted backup integrity differs; preserve files and stop.' }
    } finally {
        if ($inputFile) { $inputFile.Dispose() }; if ($outputFile) { $outputFile.Dispose() }; if ($hasher) { $hasher.Dispose() }
    }
}
function Assert-BackupChecks {
    param([bool]$Integrity,[bool]$Recovery,[string]$Fingerprint,[bool]$Offline)
    if (-not $Integrity -or -not $Recovery -or -not $Offline -or $Fingerprint -cne '7e0d344e4de13d5cdd773482346ef7e3d5c57d411555bdf4db7f0ed028214a4e') {
        throw 'No confirmation receipt: integrity, backup recovery, expected public pin and offline custody must all be verified.'
    }
}

if (-not $ApprovedBackup) {
    Write-Output 'PLAN ONLY. After approval, a private Windows console will copy the existing encrypted generation-3 key to a selected physical USB volume, without overwriting any output.'
    Write-Output 'It checks ciphertext integrity, privately unlocks ONLY the USB copy, verifies P-256/public fingerprint, then requires safe ejection, physical unplugging and offline-custody confirmation.'
    Write-Output ('Only after success: '+$receiptPath+'. No Cloudflare, signing, enrollment, key generation or private plaintext export.')
    return
}
if (-not $PrivateConsole) {
    Start-Process powershell.exe -WindowStyle Normal -ArgumentList @('-NoProfile','-NoExit','-ExecutionPolicy','Bypass','-File',('"'+$PSCommandPath+'"'),'-ApprovedBackup','-PrivateConsole') | Out-Null
    return
}
try {
    if ([Console]::IsInputRedirected -or [Console]::IsOutputRedirected) { throw 'Private interactive console required.' }
    Write-Host 'Use a trusted local console with transcripts, recording, screen sharing and shell debugging OFF.'
    if ((Read-Host 'Type PRIVATE to confirm this console is not recorded') -cne 'PRIVATE') { throw 'Private console was not confirmed.' }
    foreach ($path in @($receiptPath,$publicPinPath)) { if (Test-Path -LiteralPath $path) { throw 'Existing public output: preserve it; no overwrite or automatic retry.' } }
    foreach ($path in @($sourceDirectory,$reviewDirectory)) { Assert-NoBackupReparsePoints $path }
    $source=Join-Path $sourceDirectory 'owner-key.encrypted.pk8.pem'
    Assert-NoBackupReparsePoints $source
    $sourcePartitions=@(Get-Partition -DriveLetter $sourceDirectory.Substring(0,1) -ErrorAction Stop)
    if ($sourcePartitions.Count -ne 1) { throw 'Ambiguous source physical disk.' }
    $sourceDisk=Get-Disk -Number $sourcePartitions[0].DiskNumber -ErrorAction Stop
    $sourceDiskId=[string]$sourceDisk.UniqueId
    if (-not $sourceDiskId) { throw 'Source physical disk identity is unavailable.' }
    $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    foreach ($path in @($sourceDirectory,$source)) {
        $acl=Get-Acl -LiteralPath $path
        if ($path -eq $sourceDirectory -and -not $acl.AreAccessRulesProtected) { throw 'Expected protected source directory ACL.' }
        foreach ($rule in $acl.Access) {
            if ($rule.AccessControlType -ne 'Allow' -or $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -notin @($sid,'S-1-5-18')) { throw 'Unexpected access to owner key; permissions were not changed.' }
        }
    }
    $reader=[IO.File]::OpenText($source)
    try { if ($reader.ReadLine() -cne '-----BEGIN ENCRYPTED PRIVATE KEY-----') { throw 'Encrypted PKCS8 source required.' } } finally { $reader.Dispose() }
    if (-not (Test-Path -LiteralPath $openssl -PathType Leaf)) { throw 'Reviewed OpenSSL is unavailable.' }
    $node=(Get-Command node -ErrorAction Stop).Source
    # Extract only existing private-input helpers; never run the old generator.
    $tokens=$null; $errors=$null
    $ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'prepare-solo-owner-key.ps1'),[ref]$tokens,[ref]$errors)
    if ($errors.Count) { throw 'Private helper parse failure.' }
    foreach ($name in @('Confirm-PrivatePassphrase','Invoke-PrivateOpenSSL')) {
        $definition=$ast.Find({param($item) $item -is [Management.Automation.Language.FunctionDefinitionAst] -and $item.Name -eq $name},$true)
        if (-not $definition) { throw 'Missing reviewed helper.' }
        Set-Item -Path ('Function:\'+$name) -Value $definition.Body.GetScriptBlock()
    }
    Write-Host 'Insert a separate USB drive. This procedure never formats or changes its permissions.'
    $letter=(Read-Host 'USB drive letter only (for example E)').ToUpperInvariant()
    $identity=Get-BackupUsbIdentity $letter $sourceDiskId
    $root=$letter+':\'
    if ((Read-Host ('Confirm destination by typing '+$root)) -cne $root) { throw 'USB destination not confirmed.' }
    $backupDirectory=Join-Path $root 'Bitreca-generation3-backup'
    if (Test-Path -LiteralPath $backupDirectory) { throw 'USB backup directory already exists; preserve it and stop.' }
    $null=New-Item -ItemType Directory -Path $backupDirectory -ErrorAction Stop
    Assert-NoBackupReparsePoints $backupDirectory
    $backup=Join-Path $backupDirectory 'owner-key.encrypted.pk8.pem'
    if ((Get-BackupUsbIdentity $letter $sourceDiskId) -cne $identity) { throw 'USB identity changed.' }
    Copy-EncryptedBackupNew $source $backup
    $verifiedCipherHash=(Get-FileHash -LiteralPath $backup -Algorithm SHA256).Hash
    $secret=$null; $confirmation=$null
    try {
        Write-Host 'Encrypted copy integrity matches. Enter the EXISTING generation-3 passphrase, not a new one. Input is hidden.'
        $secret=Read-Host 'Existing generation-3 passphrase' -AsSecureString
        $confirmation=Read-Host 'Confirm existing passphrase' -AsSecureString
        Confirm-PrivatePassphrase $secret $confirmation
        $confirmation.Dispose(); $confirmation=$null
        if ((Get-BackupUsbIdentity $letter $sourceDiskId) -cne $identity) { throw 'USB identity changed before recovery.' }
        Assert-NoBackupReparsePoints $backup
        Invoke-PrivateOpenSSL @('pkey','-in',$backup,'-passin','stdin','-check','-noout') $secret 'USB backup recovery check'
        $recoveredPublic=Join-Path $backupDirectory 'owner-public.recovered.pem'
        if (Test-Path -LiteralPath $recoveredPublic) { throw 'Recovered public output exists.' }
        Invoke-PrivateOpenSSL @('pkey','-in',$backup,'-passin','stdin','-pubout','-out',$recoveredPublic) $secret 'USB backup public-only export'
    } finally {
        if ($secret) { $secret.Dispose() }; if ($confirmation) { $confirmation.Dispose() }
    }
    & $node (Join-Path $PSScriptRoot 'portfolio-evidence.mjs') public-pin --public-key $recoveredPublic --out $publicPinPath
    if ($LASTEXITCODE -ne 0) { throw 'Recovered P-256 public verification failed.' }
    $pin=Get-Content -LiteralPath $publicPinPath -Raw | ConvertFrom-Json
    if ($pin.signer_sha256 -cne $expectedFingerprint -or $pin.algorithm -cne 'ECDSA-P256-SHA256') { throw 'Recovered generation-3 public fingerprint differs.' }
    if ((Get-BackupUsbIdentity $letter $sourceDiskId) -cne $identity -or (Get-FileHash -LiteralPath $backup -Algorithm SHA256).Hash -cne $verifiedCipherHash) { throw 'Backup identity or ciphertext changed after recovery.' }
    Write-Host 'Backup recovery and public fingerprint verified. Use Windows Safely Remove Hardware, then physically unplug the USB and keep it offline in a secure place.'
    if ((Read-Host 'Type USB DISCONNECTED to confirm physical removal and offline custody') -cne 'USB DISCONNECTED') { throw 'Offline custody not confirmed; no receipt.' }
    if ([IO.Directory]::Exists($root)) { throw 'USB drive is still accessible; no offline confirmation receipt.' }
    $offlineVerified=-not [IO.Directory]::Exists($root)
    Assert-BackupChecks $true $true $pin.signer_sha256 $offlineVerified
    $receipt=[ordered]@{operator='bitreca-owner';fingerprint=$expectedFingerprint;encryptedOfflineBackupVerified=$true;passphraseRecoveryTested=$true;verifiedAt=[DateTimeOffset]::UtcNow.ToUnixTimeSeconds()}
    $bytes=[Text.UTF8Encoding]::new($false).GetBytes(($receipt | ConvertTo-Json)+"`n")
    $file=[IO.File]::Open($receiptPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try { $file.Write($bytes,0,$bytes.Length); $file.Flush($true) } finally { $file.Dispose() }
    Write-Host ('PASS: tested encrypted offline backup; public confirmation saved at '+$receiptPath)
    Write-Host 'No Cloudflare operation or enrollment occurred. Request fresh enrollment-plan validation only after this PASS.'
} catch {
    Write-Host ('STOPPED: '+$_.Exception.Message)
    throw 'Backup procedure stopped. Preserve all partial files; no automatic retry, overwrite or enrollment.'
} finally {
    Read-Host 'Press Enter to finish reviewing (never enter a passphrase here)' | Out-Null
}
