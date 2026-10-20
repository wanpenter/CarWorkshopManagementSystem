#Requires -Version 7.0
[CmdletBinding()]
param(
    [string]$MySqlDirectory,
    [ValidateRange(1024, 65535)]
    [int]$Port = 33307
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

    $env:WORKSHOP_TEST_MYSQL = "Server=127.0.0.1;Port=$Port;User ID=root;Password=$taskPassword;SslMode=None;"
    & dotnet test tests/CarWorkshop.IntegrationTests/CarWorkshop.IntegrationTests.csproj --configuration Release -m:1 --logger trx --results-directory .build-temp/test-results/integration
    if ($LASTEXITCODE -ne 0) { throw 'Booking integration tests failed.' }
}
finally {
    try {
        if ($null -ne $taskProcess -and -not $taskProcess.HasExited) {
            $null = & $taskAdmin --no-defaults --host=127.0.0.1 "--port=$Port" --user=root --connect-timeout=2 shutdown 2>$null
            if (-not $taskProcess.WaitForExit(10000)) { Stop-Process -InputObject $taskProcess -Force }
        }
    }
    finally {
        $env:WORKSHOP_TEST_MYSQL = $taskPreviousConnection
        $env:MYSQL_PWD = $taskPreviousPassword
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
