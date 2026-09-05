param(
  [switch]$RequireSigned
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$androidRoot = Join-Path $projectRoot 'android'
$signingConfig = Join-Path $androidRoot 'keystore.properties'

function Read-KeystoreProperties {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) { return $null }

  $properties = @{}
  foreach ($line in Get-Content -LiteralPath $Path) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith('#')) { continue }
    $parts = $trimmed.Split('=', 2)
    if ($parts.Count -eq 2) {
      $properties[$parts[0].Trim()] = $parts[1].Trim()
    }
  }

  foreach ($key in @('storeFile', 'storePassword', 'keyAlias', 'keyPassword')) {
    if (-not $properties.ContainsKey($key) -or
        [string]::IsNullOrWhiteSpace($properties[$key]) -or
        $properties[$key] -eq 'CHANGE_ME') {
      throw "android/keystore.properties has an invalid or missing '$key' value."
    }
  }

  $storeFile = Join-Path $androidRoot $properties['storeFile']
  if (-not (Test-Path -LiteralPath $storeFile -PathType Leaf)) {
    throw "The configured Android keystore does not exist: $storeFile"
  }

  return $properties
}

$javaHome = $env:JAVA_HOME
if (-not $javaHome -or -not (Test-Path -LiteralPath (Join-Path $javaHome 'bin\java.exe'))) {
  $bubblewrapJdkRoot = Join-Path $env:USERPROFILE '.bubblewrap\jdk'
  $javaHome = Get-ChildItem -LiteralPath $bubblewrapJdkRoot -Directory -ErrorAction SilentlyContinue |
    Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'bin\java.exe') } |
    Select-Object -First 1 -ExpandProperty FullName
}
if (-not $javaHome) {
  throw 'JDK 17 was not found. Set JAVA_HOME before building.'
}

$jarTool = Join-Path $javaHome 'bin\jar.exe'
$jarsignerTool = Join-Path $javaHome 'bin\jarsigner.exe'
if (-not (Test-Path -LiteralPath $jarTool) -or -not (Test-Path -LiteralPath $jarsignerTool)) {
  throw 'The selected JDK does not include jar.exe and jarsigner.exe.'
}

$androidSdk = $env:ANDROID_SDK_ROOT
if (-not $androidSdk) { $androidSdk = $env:ANDROID_HOME }
if (-not $androidSdk -and (Test-Path -LiteralPath 'D:\user\develop\android-sdk')) {
  $androidSdk = 'D:\user\develop\android-sdk'
}
if (-not $androidSdk) {
  throw 'Android SDK was not found. Set ANDROID_SDK_ROOT before building.'
}
if ($RequireSigned -and -not (Test-Path -LiteralPath $signingConfig -PathType Leaf)) {
  throw 'Signed bundle requested, but android/keystore.properties is missing.'
}
$keystoreProperties = Read-KeystoreProperties -Path $signingConfig

$env:JAVA_HOME = $javaHome
$env:ANDROID_HOME = $androidSdk
$env:ANDROID_SDK_ROOT = $androidSdk

Push-Location $androidRoot
try {
  & '.\gradlew.bat' bundleRelease --no-daemon
  if ($LASTEXITCODE -ne 0) { throw "Gradle failed with exit code $LASTEXITCODE." }
} finally {
  Pop-Location
}

$bundle = Join-Path $androidRoot 'app\build\outputs\bundle\release\app-release.aab'
if (-not (Test-Path -LiteralPath $bundle)) {
  throw 'Gradle completed without producing app-release.aab.'
}

$signatureEntries = @(& $jarTool tf $bundle)
if ($LASTEXITCODE -ne 0) {
  throw "Unable to inspect the Android bundle with jar.exe (exit code $LASTEXITCODE)."
}
$hasSignatureFile = $signatureEntries | Where-Object { $_ -match '^META-INF/[^/]+\.SF$' }
$hasSignatureBlock = $signatureEntries | Where-Object { $_ -match '^META-INF/[^/]+\.(RSA|DSA|EC)$' }
$isSigned = [bool]$hasSignatureFile -and [bool]$hasSignatureBlock

if ($keystoreProperties) {
  if (-not $isSigned) {
    throw 'A signing configuration was present, but the generated AAB has no JAR signature.'
  }
  & $jarsignerTool -verify $bundle | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "jarsigner could not verify the generated AAB (exit code $LASTEXITCODE)."
  }
} elseif ($RequireSigned -or $isSigned) {
  throw 'The Android bundle signing state does not match the local signing configuration.'
}

$artifactDirectory = Join-Path $projectRoot 'store\android'
New-Item -ItemType Directory -Force -Path $artifactDirectory | Out-Null
$suffix = if ($isSigned) { 'signed' } else { 'unsigned' }
$artifact = Join-Path $artifactDirectory "meonjeo-1.0.0-$suffix.aab"
Copy-Item -LiteralPath $bundle -Destination $artifact -Force
Write-Host "Android bundle ready: $artifact"
