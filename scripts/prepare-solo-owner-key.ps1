param(
    [switch]$ApprovedKeyGeneration,
    [switch]$ApprovedRetry,
    [string]$OperatorId = 'bitreca-owner'
)
$ErrorActionPreference = 'Stop'
$project = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$review = 'C:\Users\cezar\Desktop\bitreca-deletion-review'
$source = Join-Path $review 'candidate-solo-v1-20261027'
$sourcePin = 'dd5b3e8318bf45c9015d368bf7590905f956ab864c632689b9fa0e3cba0c4262'
$openssl = 'C:\Program Files\Git\usr\bin\openssl.exe'
$keyDirectory = 'C:\Users\cezar\BitrecaOwnerKeys\solo-owner-v1-20261027'
$publicDirectory = Join-Path $review 'solo-owner-public-20261027'
$ownerDirectory = Join-Path $review 'solo-owner-pinned-20261027'
$planDirectory = Join-Path $review 'solo-owner-enrollment-plan-20261027'
if ($OperatorId -cnotmatch '^[a-zA-Z0-9._@-]{1,100}$') { throw 'Invalid explicit owner identity.' }
if (-not $ApprovedKeyGeneration) {
    Write-Output ('PLAN ONLY. After explicit approval, a private interactive console will generate one P-256 key encrypted with AES-256-CBC at ' + $keyDirectory)
    Write-Output ('Operator identity: ' + $OperatorId + '. Passphrase entered only at hidden Windows console prompts; never passed in arguments, environment, JSON, logs or this conversation.')
    Write-Output 'Only the public key will leave the owner-only key directory. Public successor package and enrollment/deployment scripts will be prepared locally. No remote operations; migration 0014 will not be reapplied.'
    return
}
# Invoke ONLY from a separate, visible, non-recorded operator console, never a
# Codex PTY, transcript, CI runner or captured subprocess.
if (-not $ApprovedRetry) { throw 'Separate explicit retry approval is required.' }
try {
if ([Console]::IsInputRedirected -or [Console]::IsOutputRedirected) { throw 'A private interactive operator console is required.' }
if (-not (Test-Path -LiteralPath $openssl -PathType Leaf)) { throw 'Reviewed local OpenSSL executable is unavailable.' }
foreach ($directory in @($publicDirectory,$ownerDirectory,$planDirectory)) {
    if (Test-Path -LiteralPath $directory) { throw ('Existing directory: stop to avoid replacing/recreating a key or candidate: ' + $directory) }
}
if ((Get-FileHash -LiteralPath (Join-Path $source 'deployment-artifact.json') -Algorithm SHA256).Hash.ToLowerInvariant() -cne $sourcePin) { throw 'Source manifest pin differs.' }
$node = (Get-Command node -ErrorAction Stop).Source
& $node (Join-Path $project 'scripts\prepare-portfolio-staging.mjs') --verify $source
if ($LASTEXITCODE -ne 0) { throw 'Sealed source package verification failed.' }

# Preserve the already reviewed parent/directory ACLs. Never reset permissions.
$ownerSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
$keyParent = Split-Path -Parent $keyDirectory
# The local execution sandbox may add read/traverse access on the parent. That
# does not grant access inside the protected, non-inheriting private directory.
# Permit ONLY that identified group and ONLY read/execute/synchronize on parent;
# the actual key directory still permits exclusively owner and LocalSystem.
$sandboxSid = ([Security.Principal.NTAccount]::new($env:COMPUTERNAME,'CodexSandboxUsers')).Translate([Security.Principal.SecurityIdentifier]).Value
$parentReadRights = [Security.AccessControl.FileSystemRights]::ReadAndExecute -bor [Security.AccessControl.FileSystemRights]::Synchronize
foreach ($directory in @($keyParent,$keyDirectory)) {
if (-not (Test-Path -LiteralPath $directory -PathType Container) -or
    ((Get-Item -LiteralPath $directory).Attributes -band [System.IO.FileAttributes]::ReparsePoint)) { throw 'Expected real restricted key directories are required.' }
$actualAcl = Get-Acl -LiteralPath $directory
if (-not $actualAcl.AreAccessRulesProtected) { throw 'Private-key directory inheritance remains enabled.' }
foreach ($rule in $actualAcl.Access) {
    $sid = $rule.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value
    $ownerRule = $sid -in @($ownerSid.Value,'S-1-5-18')
    $sandboxParentRead = $directory -ceq $keyParent -and $sid -ceq $sandboxSid -and
        (([int]$rule.FileSystemRights -band (-bnot [int]$parentReadRights)) -eq 0)
    if ($rule.AccessControlType -ne 'Allow' -or (-not $ownerRule -and -not $sandboxParentRead)) { throw 'Unexpected private-key directory access.' }
}
}

# This Git-supplied OpenSSL is an MSYS/TERMIOS build. Do not rely on its
# /dev/tty password UI from a Windows console. Windows collects SecureStrings;
# the child receives the passphrase solely through a private anonymous stdin
# pipe. No password file, command-line secret or environment secret is used.
function Invoke-PrivateOpenSSL {
    param([string[]]$Arguments,[Security.SecureString]$Passphrase,[string]$Stage)
    $start = [Diagnostics.ProcessStartInfo]::new()
    $start.FileName = $openssl
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardInput = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    foreach ($argument in $Arguments) { if ($argument.Contains('"') -or $argument.Contains("`r") -or $argument.Contains("`n")) { throw 'Invalid fixed OpenSSL argument.' } }
    $start.Arguments = (($Arguments | ForEach-Object { '"' + $_ + '"' }) -join ' ')
    $child = [Diagnostics.Process]::new()
    $child.StartInfo = $start
    $pointer = [IntPtr]::Zero
    $inputWriter = $null
    try {
        if (-not $child.Start()) { throw ('Could not start OpenSSL: ' + $Stage) }
        $stdout = $child.StandardOutput.ReadToEndAsync()
        $stderr = $child.StandardError.ReadToEndAsync()
        # Windows PowerShell 5.1 lacks StandardInputEncoding. Use an explicit
        # BOM-free UTF-8 writer over the private pipe instead of that property.
        $inputWriter = [IO.StreamWriter]::new($child.StandardInput.BaseStream,[Text.UTF8Encoding]::new($false))
        $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Passphrase)
        # Write one character at a time; never create a managed plaintext string.
        for ($index=0; $index -lt $Passphrase.Length; $index++) {
            $inputWriter.Write([char]([int][Runtime.InteropServices.Marshal]::ReadInt16($pointer,2*$index) -band 65535))
        }
        $inputWriter.WriteLine()
        $inputWriter.Close()
        if (-not $child.WaitForExit(60000)) { $child.Kill(); throw ('OpenSSL timed out: ' + $Stage + '. Preserve partial files; no retry.') }
        $null = $stdout.GetAwaiter().GetResult()
        $errorText = $stderr.GetAwaiter().GetResult()
        if ($child.ExitCode -ne 0) {
            # Keep diagnostics ONLY in the private local console. These fixed
            # commands never print key contents; stdout is discarded, never logged.
            Write-Host ('OpenSSL non-secret error (' + $Stage + ', exit ' + $child.ExitCode + '):')
            Write-Host $errorText
            throw ('OpenSSL failed: ' + $Stage + '. No automatic retry; preserve partial files.')
        }
    } finally {
        if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
        if ($inputWriter) { $inputWriter.Dispose() }
        $child.Dispose()
    }
}

function Confirm-PrivatePassphrase {
    param([Security.SecureString]$First,[Security.SecureString]$Second)
    if ($First.Length -lt 20 -or $First.Length -ne $Second.Length) { throw 'Use at least 20 characters and matching confirmation. No key was generated.' }
    $one=[IntPtr]::Zero; $two=[IntPtr]::Zero
    try {
        $one=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($First)
        $two=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($Second)
        $mismatch=0
        for ($index=0;$index -lt $First.Length;$index++) {
            $left=[Runtime.InteropServices.Marshal]::ReadInt16($one,2*$index)
            $right=[Runtime.InteropServices.Marshal]::ReadInt16($two,2*$index)
            if ($left -in @(0,10,13) -or $right -in @(0,10,13)) { throw 'Line terminators/NUL are not allowed in the stdin passphrase.' }
            $mismatch=$mismatch -bor ($left -bxor $right)
        }
        if ($mismatch -ne 0) { throw 'Passphrase confirmation differs. No key was generated.' }
    } finally {
        if ($one -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($one) }
        if ($two -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($two) }
    }
}

$encryptedKey = Join-Path $keyDirectory 'owner-key.encrypted.pk8.pem'
$publicKey = Join-Path $keyDirectory 'owner-public.pem'
if ((Test-Path -LiteralPath $encryptedKey) -or (Test-Path -LiteralPath $publicKey)) { throw 'Key destination exists. Never overwrite a key, even a failed file; inspect separately.' }
$secret=$null; $confirmation=$null
try {
    Write-Host 'Enter and confirm a strong unique passphrase ONLY in this private window. Input is hidden.'
    $secret=Read-Host 'Owner key passphrase (at least 20 characters)' -AsSecureString
    $confirmation=Read-Host 'Confirm owner key passphrase' -AsSecureString
    Confirm-PrivatePassphrase $secret $confirmation
    $confirmation.Dispose(); $confirmation=$null
    # Reserve the destination without overwriting; ACL protection excludes other
    # principals. The only overwrite below is of our own newly reserved empty file.
    $reservation=[IO.File]::Open($encryptedKey,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    $reservation.Dispose()
    Invoke-PrivateOpenSSL -Arguments @('genpkey','-algorithm','EC','-pkeyopt','ec_paramgen_curve:P-256','-aes-256-cbc','-pass','stdin','-out',$encryptedKey) -Passphrase $secret -Stage 'encrypted P-256 generation'
    if ((Get-Item -LiteralPath $encryptedKey).Length -eq 0) { throw 'OpenSSL produced an empty key; stop.' }
    # Check only the format header locally, never print or export private bytes.
    $headerReader=[IO.File]::OpenText($encryptedKey)
    try { if ($headerReader.ReadLine() -cne '-----BEGIN ENCRYPTED PRIVATE KEY-----') { throw 'Encrypted PKCS#8 format is required.' } } finally { $headerReader.Dispose() }
    Invoke-PrivateOpenSSL -Arguments @('pkey','-in',$encryptedKey,'-passin','stdin','-check','-noout') -Passphrase $secret -Stage 'encrypted private-key usability check'
    Invoke-PrivateOpenSSL -Arguments @('pkey','-in',$encryptedKey,'-passin','stdin','-pubout','-out',$publicKey) -Passphrase $secret -Stage 'public-only export'
} finally {
    if ($secret) { $secret.Dispose() }
    if ($confirmation) { $confirmation.Dispose() }
}
New-Item -ItemType Directory -Path $publicDirectory -ErrorAction Stop | Out-Null
$publicCopy = Join-Path $publicDirectory 'owner-public.pem'
Copy-Item -LiteralPath $publicKey -Destination $publicCopy -ErrorAction Stop
& $node (Join-Path $project 'scripts\portfolio-evidence.mjs') public-pin --public-key $publicCopy --out (Join-Path $publicDirectory 'owner-public-pin.json')
if ($LASTEXITCODE -ne 0) { throw 'Public P-256 pin verification failed.' }

$utf8 = [System.Text.UTF8Encoding]::new($false)
$inputs = [ordered]@{source=$source;output=$ownerDirectory;publicKey=$publicCopy;operatorId=$OperatorId;policyId=[guid]::NewGuid().ToString();enrolledAt=[DateTimeOffset]::UtcNow.ToUnixTimeSeconds()}
$inputsPath = Join-Path $publicDirectory 'owner-inputs.json'
[System.IO.File]::WriteAllText($inputsPath,($inputs | ConvertTo-Json),$utf8)
$ownerText = & $node (Join-Path $project 'scripts\solo-sandbox-release.mjs') owner $inputsPath
if ($LASTEXITCODE -ne 0) { throw 'Public-only successor preparation failed. The encrypted key is preserved; stop.' }
$ownerResult = ($ownerText -join "`n") | ConvertFrom-Json
[System.IO.File]::WriteAllText((Join-Path $publicDirectory 'owner-candidate-result.json'),($ownerResult | ConvertTo-Json -Depth 8),$utf8)
$planInputs = [ordered]@{candidate=$ownerResult.candidate;expectedPin=$ownerResult.artifactSha256;output=$planDirectory;enrollmentFile=(Join-Path $ownerDirectory 'enrollment.json')}
$planInputsPath = Join-Path $publicDirectory 'plan-inputs.json'
[System.IO.File]::WriteAllText($planInputsPath,($planInputs | ConvertTo-Json),$utf8)
& $node (Join-Path $project 'scripts\solo-sandbox-release.mjs') plan $planInputsPath
if ($LASTEXITCODE -ne 0) { throw 'Guarded plan preparation failed. No remote operation was attempted.' }
Write-Host 'Local preparation complete. Encrypted private key stays in the protected directory. Secure an encrypted offline backup before Cloudflare enrollment approval.'
Write-Host ('Public candidate manifest SHA-256: ' + $ownerResult.artifactSha256)
Write-Host ('Public plan: ' + $planDirectory)
} catch {
    Write-Host ('STOPPED: ' + $_.Exception.Message)
    Write-Host 'No automatic retry or Cloudflare operation. Preserve any nonempty key; share only the non-secret error if help is needed.'
} finally {
    Read-Host 'Press Enter when finished reviewing this private window (never enter a passphrase here)' | Out-Null
}
