param(
  [switch]$RequireSigned
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$androidRoot = Join-Path $projectRoot 'android'
$signingConfig = Join-Path $androidRoot 'keystore.properties'

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

$androidSdk = $env:ANDROID_SDK_ROOT
if (-not $androidSdk) { $androidSdk = $env:ANDROID_HOME }
if (-not $androidSdk -and (Test-Path -LiteralPath 'D:\user\develop\android-sdk')) {
  $androidSdk = 'D:\user\develop\android-sdk'
}
if (-not $androidSdk) {
  throw 'Android SDK was not found. Set ANDROID_SDK_ROOT before building.'
}
if ($RequireSigned -and -not (Test-Path -LiteralPath $signingConfig)) {
  throw 'Signed bundle requested, but android/keystore.properties is missing.'
}

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

$artifactDirectory = Join-Path $projectRoot 'store\android'
New-Item -ItemType Directory -Force -Path $artifactDirectory | Out-Null
$suffix = if (Test-Path -LiteralPath $signingConfig) { 'signed' } else { 'unsigned' }
$artifact = Join-Path $artifactDirectory "meonjeo-1.0.0-$suffix.aab"
Copy-Item -LiteralPath $bundle -Destination $artifact -Force
Write-Host "Android bundle ready: $artifact"
