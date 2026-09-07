$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$androidRoot = Join-Path $projectRoot 'android'
$keystorePath = Join-Path $androidRoot 'upload-key.jks'
$propertiesPath = Join-Path $androidRoot 'keystore.properties'
$certificatePath = Join-Path $androidRoot 'upload-certificate.pem'
$signingPaths = @($keystorePath, $propertiesPath, $certificatePath)

foreach ($path in $signingPaths) {
  if (Test-Path -LiteralPath $path) {
    throw "Refusing to overwrite existing Android signing material: $path"
  }
}

$javaHome = $env:JAVA_HOME
if (-not $javaHome -or -not (Test-Path -LiteralPath (Join-Path $javaHome 'bin\keytool.exe'))) {
  $bubblewrapJdkRoot = Join-Path $env:USERPROFILE '.bubblewrap\jdk'
  $javaHome = Get-ChildItem -LiteralPath $bubblewrapJdkRoot -Directory -ErrorAction SilentlyContinue |
    Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'bin\keytool.exe') } |
    Select-Object -First 1 -ExpandProperty FullName
}
if (-not $javaHome) {
  throw 'JDK 17 keytool was not found. Set JAVA_HOME before creating the upload key.'
}

$keytool = Join-Path $javaHome 'bin\keytool.exe'
$passwordBytes = [byte[]]::new(32)
$randomNumberGenerator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try {
  $randomNumberGenerator.GetBytes($passwordBytes)
} finally {
  $randomNumberGenerator.Dispose()
}
$password = [Convert]::ToBase64String($passwordBytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
$passwordEnvironmentName = 'MEONJEO_UPLOAD_KEY_PASSWORD'
$env:MEONJEO_UPLOAD_KEY_PASSWORD = $password
$alias = 'meonjeo-upload'

try {
  & $keytool -genkeypair -v `
    -storetype PKCS12 `
    -keystore $keystorePath `
    -alias $alias `
    -keyalg RSA `
    -keysize 4096 `
    -validity 10000 `
    -dname 'CN=Meonjeo Upload Key, O=Yorimichi Works, C=JP' `
    '-storepass:env' $passwordEnvironmentName `
    '-keypass:env' $passwordEnvironmentName
  if ($LASTEXITCODE -ne 0) { throw "keytool failed with exit code $LASTEXITCODE." }

  $contents = @(
    'storeFile=upload-key.jks'
    "storePassword=$password"
    "keyAlias=$alias"
    "keyPassword=$password"
    ''
  ) -join "`n"
  [IO.File]::WriteAllText($propertiesPath, $contents, [Text.UTF8Encoding]::new($false))

  & $keytool -exportcert -rfc `
    -keystore $keystorePath `
    -alias $alias `
    '-storepass:env' $passwordEnvironmentName `
    -file $certificatePath
  if ($LASTEXITCODE -ne 0) { throw "Certificate export failed with exit code $LASTEXITCODE." }
} catch {
  foreach ($path in $signingPaths) {
    if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Force }
  }
  throw
} finally {
  Remove-Item "Env:$passwordEnvironmentName" -ErrorAction SilentlyContinue
  if ($passwordBytes) { [Array]::Clear($passwordBytes, 0, $passwordBytes.Length) }
  $password = $null
}

Write-Host 'Android upload key created locally. Its password was not printed.'
Write-Host 'Back up android/upload-key.jks and android/keystore.properties together now.'
Write-Host 'Use the Play app-signing fingerprint, not this upload certificate, for Digital Asset Links.'
