param([string]$ApiBaseUrl = 'http://localhost:5272', [PSCredential]$Credential)

$ErrorActionPreference = 'Stop'
$base = $ApiBaseUrl.TrimEnd('/')
$runTag = 'Module QA ' + [guid]::NewGuid().ToString('N').Substring(0, 8)
$customers = [System.Collections.Generic.List[int]]::new()
$vehicles = [System.Collections.Generic.List[int]]::new()
if (-not $Credential) {
    if (-not $env:WORKSHOP_VERIFY_USERNAME -or -not $env:WORKSHOP_VERIFY_PASSWORD) {
        throw 'Pass -Credential (Get-Credential) or set WORKSHOP_VERIFY_USERNAME and WORKSHOP_VERIFY_PASSWORD for an active workshop account.'
    }
    $Credential = [PSCredential]::new($env:WORKSHOP_VERIFY_USERNAME, (ConvertTo-SecureString $env:WORKSHOP_VERIFY_PASSWORD -AsPlainText -Force))
}
$session = [Microsoft.PowerShell.Commands.WebRequestSession]::new()
$handler = [System.Net.Http.HttpClientHandler]::new()
$handler.CookieContainer = $session.Cookies
$http = [System.Net.Http.HttpClient]::new($handler)
$http.Timeout = [TimeSpan]::FromSeconds(15)

function Send-Api([string]$Method, [string]$Route, $Body, [int]$ExpectedStatus) {
    $params = @{ Method = $Method; Uri = "$base$Route"; SkipHttpErrorCheck = $true; TimeoutSec = 15; WebSession = $session }
    if ($Method -notin @('GET', 'HEAD', 'OPTIONS')) {
        $csrf = Invoke-RestMethod -Uri "$base/api/auth/csrf" -WebSession $session
        $params.Headers = @{ 'X-CSRF-TOKEN' = $csrf.token }
    }
    if ($null -ne $Body) {
        $params.ContentType = 'application/json'
        $params.Body = $Body | ConvertTo-Json -Depth 8 -Compress
    }
    $response = Invoke-WebRequest @params
    if ([int]$response.StatusCode -ne $ExpectedStatus) {
        throw "$Method $Route returned $($response.StatusCode), expected $ExpectedStatus."
    }
    if ($response.Content) { return ($response.Content | ConvertFrom-Json) }
}

function Assert-Equal($Actual, $Expected, [string]$Description) {
    if ($Actual -ne $Expected) { throw "Failed: $Description (expected $Expected, got $Actual)." }
}

try {
    Send-Api POST '/api/auth/login' @{ username = $Credential.UserName; password = $Credential.GetNetworkCredential().Password } 200 | Out-Null
    $legacyBefore = @(Send-Api GET '/api/cars' $null 200)
    foreach ($suffix in @('A', 'B')) {
        $customer = Send-Api POST '/api/customers' @{ fullName = "$runTag $suffix"; phone = '+60000000000'; address = 'Temporary verification fixture' } 201
        $customers.Add([int]$customer.id)
    }
    $editedCustomer = Send-Api PUT "/api/customers/$($customers[0])" @{ fullName = "$runTag A"; phone = '+60123456789'; address = 'Updated temporary address' } 200
    Assert-Equal $editedCustomer.address 'Updated temporary address' 'customer edit'
    Assert-Equal $editedCustomer.phone '+60123456789' 'customer phone edit'
    $registration = 'QA' + [guid]::NewGuid().ToString('N').Substring(0, 8).ToUpperInvariant()
    $body = @{ customerId = $customers[0]; registrationNumber = (' qa-' + $registration.Substring(2).ToLowerInvariant() + ' '); make = ' QA Make '; model = ' QA Model '; year = 2020; mileage = 1234; isActive = $true }
    $vehicle = Send-Api POST '/api/vehicles' $body 201
    $vehicles.Add([int]$vehicle.id)
    Assert-Equal $vehicle.registrationNumber $registration 'registration normalization'
    Assert-Equal $vehicle.make 'QA Make' 'trimmed make'
    Assert-Equal $vehicle.customerId $customers[0] 'owner relation'
    Assert-Equal $vehicle.isActive $true 'active vehicle creation'
    Send-Api POST '/api/vehicles' (@{} + $body) 409 | Out-Null
    Send-Api DELETE "/api/customers/$($customers[0])" $null 409 | Out-Null
    $badOwner = @{} + $body
    $badOwner.customerId = [int]::MaxValue
    $badOwner.registrationNumber = 'QAMISSINGOWNER'
    Send-Api POST '/api/vehicles' $badOwner 404 | Out-Null
    $badRegistration = @{} + $body
    $badRegistration.registrationNumber = 'QA@INVALID'
    Send-Api POST '/api/vehicles' $badRegistration 400 | Out-Null
    Send-Api POST '/api/customers' @{ fullName = ' '; phone = 'abc' } 400 | Out-Null
    Send-Api POST '/api/customers' @{ fullName = 'Bad phone'; phone = '123+4567890' } 400 | Out-Null
    Send-Api GET '/api/customers/2147483647' $null 404 | Out-Null
    Send-Api GET '/api/vehicles/2147483647' $null 404 | Out-Null
    $owned = @(Send-Api GET "/api/customers/$($customers[0])/vehicles" $null 200)
    Assert-Equal $owned.Count 1 'customer vehicle listing'
    $body.registrationNumber = $registration
    $body.customerId = $customers[1]
    $body.model = 'Updated QA Model'
    $body.mileage = 4567
    $body.isActive = $false
    $updated = Send-Api PUT "/api/vehicles/$($vehicle.id)" $body 200
    Assert-Equal $updated.customerId $customers[1] 'owner reassignment'
    Assert-Equal $updated.model 'Updated QA Model' 'vehicle edit'
    Assert-Equal $updated.isActive $false 'inactive vehicle edit'
    $reloaded = Send-Api GET "/api/vehicles/$($vehicle.id)" $null 200
    Assert-Equal $reloaded.isActive $false 'inactive status persisted'
    $first = Send-Api GET "/api/customers/$($customers[0])" $null 200
    $second = Send-Api GET "/api/customers/$($customers[1])" $null 200
    Assert-Equal $first.vehicleCount 0 'old owner count'
    Assert-Equal $second.vehicleCount 1 'new owner count'
    $filtered = @(Send-Api GET "/api/vehicles?customerId=$($customers[1])" $null 200)
    Assert-Equal $filtered.Count 1 'owner filter'
    Send-Api DELETE "/api/customers/$($customers[1])" $null 409 | Out-Null

    $raceBody = @{} + $body
    $raceBody.registrationNumber = 'QA' + [guid]::NewGuid().ToString('N').Substring(0, 8).ToUpperInvariant()
    $raceJson = $raceBody | ConvertTo-Json -Compress
    $contentA = [System.Net.Http.StringContent]::new($raceJson, [System.Text.Encoding]::UTF8, 'application/json')
    $contentB = [System.Net.Http.StringContent]::new($raceJson, [System.Text.Encoding]::UTF8, 'application/json')
    try {
        $csrf = Invoke-RestMethod -Uri "$base/api/auth/csrf" -WebSession $session
        $http.DefaultRequestHeaders.Add('X-CSRF-TOKEN', [string]$csrf.token)
        $requestA = $http.PostAsync("$base/api/vehicles", $contentA)
        $requestB = $http.PostAsync("$base/api/vehicles", $contentB)
        $responseA = $requestA.GetAwaiter().GetResult()
        $responseB = $requestB.GetAwaiter().GetResult()
        try {
            $statuses = @([int]$responseA.StatusCode, [int]$responseB.StatusCode) | Sort-Object
            foreach ($response in @($responseA, $responseB)) {
                if ([int]$response.StatusCode -eq 201) {
                    $created = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult() | ConvertFrom-Json
                    $vehicles.Add([int]$created.id)
                }
            }
            Assert-Equal ($statuses -join ',') '201,409' 'concurrent unique registration'
        } finally {
            $responseA.Dispose()
            $responseB.Dispose()
        }
    } finally {
        $contentA.Dispose()
        $contentB.Dispose()
    }
    $legacyAfter = @(Send-Api GET '/api/cars' $null 200)
    Assert-Equal ($legacyAfter | ConvertTo-Json -Compress) ($legacyBefore | ConvertTo-Json -Compress) 'legacy car data preserved'
    Write-Output 'PASS: customer/vehicle CRUD, ownership, validation, duplicate and concurrent registration, protected deletion, and legacy data preservation.'
} finally {
    try {
        foreach ($id in $vehicles) {
            $record = Send-Api GET "/api/vehicles/$id" $null 200
            if ($record.customerId -notin $customers -or $record.registrationNumber -notlike 'QA*') { throw 'Test vehicle identity mismatch; cleanup stopped.' }
            Send-Api DELETE "/api/vehicles/$id" $null 204 | Out-Null
        }
        foreach ($id in $customers) {
            $record = Send-Api GET "/api/customers/$id" $null 200
            if ($record.fullName -notlike "$runTag *") { throw 'Test customer identity mismatch; cleanup stopped.' }
            Send-Api DELETE "/api/customers/$id" $null 204 | Out-Null
        }
        Write-Output 'Temporary verification records removed.'
        Send-Api POST '/api/auth/logout' $null 204 | Out-Null
    } finally { $http.Dispose() }
}
