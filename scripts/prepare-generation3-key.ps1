param([switch]$ApprovedGeneration3Key,[switch]$PrivateConsole)
$ErrorActionPreference='Stop'
$directory='C:\Users\cezar\BitrecaOwnerKeys\solo-owner-generation3'
$openssl='C:\Program Files\Git\usr\bin\openssl.exe'
if (-not $ApprovedGeneration3Key) {
    Write-Output "PLAN ONLY: separate approval generates one encrypted P-256 key at $directory. No Cloudflare operations."
    return
}
if (-not $PrivateConsole) {
    Start-Process powershell.exe -WindowStyle Normal -ArgumentList @('-NoProfile','-NoExit','-ExecutionPolicy','Bypass','-File',('"'+$PSCommandPath+'"'),'-ApprovedGeneration3Key','-PrivateConsole') | Out-Null
    return
}
try {
    if ([Console]::IsInputRedirected -or [Console]::IsOutputRedirected) { throw 'Private interactive console required.' }
    if (Test-Path -LiteralPath $directory) { throw 'Destination exists; preserve it. No retry or overwrite.' }
    if (-not (Test-Path -LiteralPath $openssl -PathType Leaf)) { throw 'Reviewed OpenSSL unavailable.' }
    $parent=Split-Path -Parent $directory
    if (-not (Test-Path -LiteralPath $parent -PathType Container)) { throw 'Protected key parent required.' }
    $ownerSid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $readRights=[Security.AccessControl.FileSystemRights]::ReadAndExecute -bor [Security.AccessControl.FileSystemRights]::Synchronize
    foreach ($rule in (Get-Acl -LiteralPath $parent).Access) {
        $identity=$rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
        if ($rule.AccessControlType -eq 'Allow' -and $identity -notin @($ownerSid,'S-1-5-18') -and
            (([int]$rule.FileSystemRights -band (-bnot [int]$readRights)) -ne 0)) { throw 'Unexpected writer to key parent; stop without altering ACLs.' }
    }
    $walk=Get-Item -LiteralPath $parent
    while ($walk) {
        if ($walk.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Reparse points forbidden.' }
        $walk=$walk.Parent
    }
    # Reuse only reviewed secret-input functions, never execute the old generator.
    $tokens=$null; $errors=$null
    $ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'prepare-solo-owner-key.ps1'),[ref]$tokens,[ref]$errors)
    if ($errors.Count) { throw 'Existing helper parse failure.' }
    foreach ($name in @('Confirm-PrivatePassphrase','Invoke-PrivateOpenSSL')) {
        $definition=$ast.Find({param($item) $item -is [Management.Automation.Language.FunctionDefinitionAst] -and $item.Name -eq $name},$true)
        if (-not $definition) { throw 'Missing reviewed helper.' }
        Set-Item -Path ('Function:\'+$name) -Value $definition.Body.GetScriptBlock()
    }
    $secret=$null; $confirm=$null
    try {
        $secret=Read-Host 'NEW generation-3 passphrase (at least 20 characters)' -AsSecureString
        $confirm=Read-Host 'Confirm new passphrase' -AsSecureString
        Confirm-PrivatePassphrase $secret $confirm
        $confirm.Dispose(); $confirm=$null
        # Create with protected owner/SYSTEM ACL from birth. Never reset parent ACLs.
        $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
        $acl=[Security.AccessControl.DirectorySecurity]::new()
        $acl.SetOwner($sid); $acl.SetAccessRuleProtection($true,$false)
        foreach ($identity in @($sid,[Security.Principal.SecurityIdentifier]::new('S-1-5-18'))) {
            $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($identity,'FullControl','ContainerInherit,ObjectInherit','None','Allow'))
        }
        [IO.Directory]::CreateDirectory($directory,$acl) | Out-Null
        $actual=Get-Acl -LiteralPath $directory
        if (-not $actual.AreAccessRulesProtected) { throw 'Unsafe key directory ACL.' }
        foreach ($rule in $actual.Access) {
            if ($rule.AccessControlType -ne 'Allow' -or $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -notin @($sid.Value,'S-1-5-18')) { throw 'Unexpected key directory access.' }
        }
        $private=Join-Path $directory 'owner-key.encrypted.pk8.pem'
        $public=Join-Path $directory 'owner-public.pem'
        $reservation=[IO.File]::Open($private,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None); $reservation.Dispose()
        Invoke-PrivateOpenSSL @('genpkey','-algorithm','EC','-pkeyopt','ec_paramgen_curve:P-256','-aes-256-cbc','-pass','stdin','-out',$private) $secret 'generation 3'
        $reader=[IO.File]::OpenText($private)
        try { if ($reader.ReadLine() -cne '-----BEGIN ENCRYPTED PRIVATE KEY-----') { throw 'Encrypted PKCS8 required.' } } finally { $reader.Dispose() }
        Invoke-PrivateOpenSSL @('pkey','-in',$private,'-passin','stdin','-check','-noout') $secret 'usability'
        if (Test-Path -LiteralPath $public) { throw 'Public output already exists.' }
        Invoke-PrivateOpenSSL @('pkey','-in',$private,'-passin','stdin','-pubout','-out',$public) $secret 'public export'
        & node (Join-Path $PSScriptRoot 'portfolio-evidence.mjs') public-pin --public-key $public --out (Join-Path $directory 'owner-public-pin.json')
        if ($LASTEXITCODE -ne 0) { throw 'Public P-256 verification failed.' }
        Write-Host 'Key verified. Preserve encrypted offline backup; only public files may be copied out. No enrollment or remote operation performed.'
    } finally {
        if ($secret) { $secret.Dispose() }; if ($confirm) { $confirm.Dispose() }
    }
} catch {
    Write-Host ('STOPPED: '+$_.Exception.Message)
    throw 'Generation-3 preparation failed; preserve outputs and do not retry automatically.'
} finally {
    Read-Host 'Press Enter to close review (never enter passphrase here)' | Out-Null
}
