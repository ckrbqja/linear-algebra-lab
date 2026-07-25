$ErrorActionPreference = 'Stop'

$androidProject = Split-Path -Parent $MyInvocation.MyCommand.Path
$credentialsPath = Join-Path $androidProject 'signing-credentials.properties'

if (-not (Test-Path -LiteralPath $credentialsPath)) {
    throw "Missing signing credentials: $credentialsPath"
}

$credentials = ConvertFrom-StringData (Get-Content -LiteralPath $credentialsPath -Raw)

if (-not $credentials.keystorePassword -or -not $credentials.keyPassword) {
    throw 'Signing credentials must define keystorePassword and keyPassword.'
}

$env:BUBBLEWRAP_KEYSTORE_PASSWORD = $credentials.keystorePassword
$env:BUBBLEWRAP_KEY_PASSWORD = $credentials.keyPassword
$previousAndroidSdkRoot = $env:ANDROID_SDK_ROOT
Remove-Item Env:ANDROID_SDK_ROOT -ErrorAction SilentlyContinue

Push-Location $androidProject
try {
    pnpm dlx @bubblewrap/cli@1.24.1 build
}
finally {
    Pop-Location
    Remove-Item Env:BUBBLEWRAP_KEYSTORE_PASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:BUBBLEWRAP_KEY_PASSWORD -ErrorAction SilentlyContinue
    if ($null -ne $previousAndroidSdkRoot) {
        $env:ANDROID_SDK_ROOT = $previousAndroidSdkRoot
    }
}
