#Requires -Version 7.0
[CmdletBinding()]
param(
    [string]$MySqlDirectory,
    [ValidateRange(1024, 65535)]
    [int]$Port = 33307,
    [switch]$VerifyFrontend,
    [string]$PlaywrightModule = 'playwright'
)

$ErrorActionPreference = 'Stop'
$taskRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if (-not $MySqlDirectory) {
    $MySqlDirectory = Join-Path $taskRoot 'mysql-8.0.46-winx64/mysql-8.0.46-winx64'
}
$taskMysqlRoot = (Resolve-Path -LiteralPath $MySqlDirectory).Path
$taskServer = Join-Path $taskMysqlRoot 'bin/mysqld.exe'
$taskClient = Join-Path $taskMysqlRoot 'bin/mysql.exe'
$taskAdmin = Join-Path $taskMysqlRoot 'bin/mysqladmin.exe'
foreach ($taskExecutable in @($taskServer, $taskClient, $taskAdmin)) {
    if (-not (Test-Path -LiteralPath $taskExecutable -PathType Leaf)) {
        throw "Missing MySQL executable: $taskExecutable"
    }
}
if (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue) {
    throw "Port $Port is already in use. Choose another port using -Port."
}

$taskRunDirectory = Join-Path $taskRoot ".build-temp/mysql-tests-$([Guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Path $taskRunDirectory -Force | Out-Null
$taskData = Join-Path $taskRunDirectory 'data'
$taskInit = Join-Path $taskRunDirectory 'init.sql'
$taskPassword = [Guid]::NewGuid().ToString('N')
$taskPreviousConnection = $env:WORKSHOP_TEST_MYSQL
$taskPreviousPassword = $env:MYSQL_PWD
$taskProcess = $null
$taskApiProcess = $null
$taskPreviousApiConnection = $env:ConnectionStrings__DefaultConnection
$taskPreviousEnvironment = $env:ASPNETCORE_ENVIRONMENT
$taskPreviousBrowserModule = $env:WORKSHOP_PLAYWRIGHT_MODULE
$taskPreviousAdminUsername = $env:WORKSHOP_ADMIN_USERNAME
$taskPreviousAdminPassword = $env:WORKSHOP_ADMIN_PASSWORD

Push-Location $taskRoot
try {
    Write-Output 'Initializing a separate MySQL test server...'
    & $taskServer --no-defaults --initialize-insecure "--basedir=$taskMysqlRoot" "--datadir=$taskData" --console *> (Join-Path $taskRunDirectory 'initialize.log')
    if ($LASTEXITCODE -ne 0) { throw "MySQL initialization failed. Logs: $taskRunDirectory" }

    Set-Content -LiteralPath $taskInit -Encoding utf8NoBOM -Value "ALTER USER 'root'@'localhost' IDENTIFIED BY '$taskPassword';"
    $taskProcess = Start-Process -FilePath $taskServer -WindowStyle Hidden -PassThru -ArgumentList @(
        '--no-defaults', "--basedir=`"$taskMysqlRoot`"", "--datadir=`"$taskData`"",
        "--init-file=`"$taskInit`"", '--bind-address=127.0.0.1', "--port=$Port", '--mysqlx=OFF', '--console'
    ) -RedirectStandardOutput (Join-Path $taskRunDirectory 'server.out.log') -RedirectStandardError (Join-Path $taskRunDirectory 'server.err.log')

    $env:MYSQL_PWD = $taskPassword
    $taskReady = $false
    for ($taskAttempt = 0; $taskAttempt -lt 30; $taskAttempt++) {
        if ($taskProcess.HasExited) { throw "MySQL exited during startup. Logs: $taskRunDirectory" }
        $null = & $taskClient --no-defaults --host=127.0.0.1 "--port=$Port" --user=root --connect-timeout=1 --silent --skip-column-names --execute='SELECT 1' 2>$null
        if ($LASTEXITCODE -eq 0) { $taskReady = $true; break }
        Start-Sleep -Milliseconds 500
    }
    if (-not $taskReady) { throw "MySQL did not become ready. Logs: $taskRunDirectory" }

    $env:WORKSHOP_TEST_MYSQL = "Server=127.0.0.1;Port=$Port;User ID=root;Password=$taskPassword;SslMode=Required;"
    & dotnet test tests/CarWorkshop.IntegrationTests/CarWorkshop.IntegrationTests.csproj --configuration Release -m:1 --logger trx --results-directory .build-temp/test-results/integration
    if ($LASTEXITCODE -ne 0) { throw 'Booking integration tests failed.' }

    if ($VerifyFrontend) {
        if (Get-NetTCPConnection -State Listen -LocalPort 5273 -ErrorAction SilentlyContinue) {
            throw 'Frontend verification API port 5273 is already in use.'
        }
        $taskUiDatabase = 'cw_ui_' + [Guid]::NewGuid().ToString('N')
        & $taskClient --no-defaults --host=127.0.0.1 "--port=$Port" --user=root "--execute=CREATE DATABASE $taskUiDatabase"
        if ($LASTEXITCODE -ne 0) { throw 'Could not create the isolated frontend test database.' }
        $env:ConnectionStrings__DefaultConnection = "$($env:WORKSHOP_TEST_MYSQL)Database=$taskUiDatabase;"
        $env:ASPNETCORE_ENVIRONMENT = 'Development'
        $env:WORKSHOP_PLAYWRIGHT_MODULE = $PlaywrightModule
        & dotnet ef database update --project src/CarWorkshop.Infrastructure --startup-project src/CarWorkshop.Api --configuration Release --no-build *> (Join-Path $taskRunDirectory 'migrations.log')
        if ($LASTEXITCODE -ne 0) { throw 'Could not migrate the frontend test database.' }
        $env:WORKSHOP_ADMIN_USERNAME = 'verification-admin'
        $env:WORKSHOP_ADMIN_PASSWORD = [Guid]::NewGuid().ToString('N') + 'aA1!'
        & dotnet run --project src/CarWorkshop.Api/CarWorkshop.Api.csproj --configuration Release --no-build --no-launch-profile -- --bootstrap-admin *> (Join-Path $taskRunDirectory 'bootstrap.log')
        if ($LASTEXITCODE -ne 0) { throw 'Could not bootstrap the isolated verification administrator.' }
        $taskApiProcess = Start-Process -FilePath dotnet -WindowStyle Hidden -PassThru -ArgumentList @(
            'run', '--project', 'src/CarWorkshop.Api/CarWorkshop.Api.csproj', '--configuration', 'Release',
            '--no-build', '--no-launch-profile', '--urls', 'http://127.0.0.1:5273'
        ) -RedirectStandardOutput (Join-Path $taskRunDirectory 'api.out.log') -RedirectStandardError (Join-Path $taskRunDirectory 'api.err.log')
        $taskApiReady = $false
        for ($taskAttempt = 0; $taskAttempt -lt 40; $taskAttempt++) {
            if ($taskApiProcess.HasExited) { throw "Verification API exited. Logs: $taskRunDirectory" }
            try {
                $null = Invoke-RestMethod 'http://127.0.0.1:5273/api/health' -TimeoutSec 1
                $taskApiReady = $true
                break
            } catch { Start-Sleep -Milliseconds 500 }
        }
        if (-not $taskApiReady) { throw 'Verification API did not become ready.' }
        & node scripts/Verify-MechanicFrontend.cjs
        if ($LASTEXITCODE -ne 0) { throw 'Mechanic frontend verification failed.' }
        & node scripts/Verify-AuthenticationFrontend.cjs
        if ($LASTEXITCODE -ne 0) { throw 'Authentication frontend verification failed.' }
    }
}
finally {
    try {
        if ($null -ne $taskApiProcess -and -not $taskApiProcess.HasExited) {
            taskkill /PID $taskApiProcess.Id /T /F | Out-Null
            $null = $taskApiProcess.WaitForExit(10000)
        }
        if ($null -ne $taskProcess -and -not $taskProcess.HasExited) {
            $null = & $taskAdmin --no-defaults --host=127.0.0.1 "--port=$Port" --user=root --connect-timeout=2 shutdown 2>$null
            if (-not $taskProcess.WaitForExit(10000)) { Stop-Process -InputObject $taskProcess -Force }
        }
    }
    finally {
        $env:WORKSHOP_TEST_MYSQL = $taskPreviousConnection
        $env:MYSQL_PWD = $taskPreviousPassword
        $env:ConnectionStrings__DefaultConnection = $taskPreviousApiConnection
        $env:ASPNETCORE_ENVIRONMENT = $taskPreviousEnvironment
        $env:WORKSHOP_PLAYWRIGHT_MODULE = $taskPreviousBrowserModule
        $env:WORKSHOP_ADMIN_USERNAME = $taskPreviousAdminUsername
        $env:WORKSHOP_ADMIN_PASSWORD = $taskPreviousAdminPassword
        Pop-Location
        if (Test-Path -LiteralPath $taskInit) { Remove-Item -LiteralPath $taskInit -Force }
        $taskAllowedRoot = [IO.Path]::GetFullPath((Join-Path $taskRoot '.build-temp')) + [IO.Path]::DirectorySeparatorChar
        $taskResolvedData = [IO.Path]::GetFullPath($taskData)
        if (-not $taskResolvedData.StartsWith($taskAllowedRoot, [StringComparison]::OrdinalIgnoreCase)) {
            throw "Refusing to clean an unexpected data directory: $taskResolvedData"
        }
        if (Test-Path -LiteralPath $taskResolvedData) { Remove-Item -LiteralPath $taskResolvedData -Recurse -Force }
        Write-Output "Temporary server stopped. Logs: $taskRunDirectory"
    }
}
