param()
$envVars = @{}
Get-Content "$PSScriptRoot\.env.local" | ForEach-Object {
  if ($_ -match '^\s*([^=#\s]+)=(.*)$') { $envVars[$matches[1]] = ($matches[2] -replace '^"|"$','') }
}
$BaseUrl = "https://qiceptunywrchwihgyth.supabase.co"
$Headers = @{ apikey = $envVars["NEXT_PUBLIC_SUPABASE_ANON_KEY"]; Authorization = "Bearer $($envVars['SUPABASE_SERVICE_ROLE_KEY'])" }

# Get a segment
$segs = Invoke-RestMethod "$BaseUrl/rest/v1/segments?select=id,name&order=name" -Headers $Headers
$seg = $segs[0]
Write-Host "Segment: $($seg.id) $($seg.name)"

# Get a user for requested_by
$profs = Invoke-RestMethod "$BaseUrl/rest/v1/profiles?select=id&limit=1" -Headers $Headers
$pArr = @($profs)
$reqBy = if ($pArr.Count -gt 0) { $pArr[0].id } else { $null }

$startStr = (Get-Date).AddHours(40).ToString("yyyy-MM-ddTHH:mm:ss")
$body = @{
    segment_id = [int]$seg.id
    work_type = "track"
    work_description = "[TEST] Inspect rail junction after storm"
    justification = "[TEST] Urgent safety inspection"
    requested_start = $startStr
    requested_duration_mins = 90
    safety_criticality = "safety_critical"
    department = "TMS"
    status = "submitted"
}
if ($reqBy) { $body.requested_by = $reqBy }
$clean = @{}
foreach ($k in $body.Keys) { if ($body[$k] -isnot [string] -or $body[$k] -ne '') { $clean[$k] = $body[$k] } }
$body = $clean
Write-Host "Body: $($body | ConvertTo-Json -Compress)"
try {
  $inserted = Invoke-RestMethod "$BaseUrl/rest/v1/block_requests" -Headers ($Headers + @{ Prefer = "return=representation" }) -Method Post -Body (ConvertTo-Json $body -Compress)
  Write-Host "Success: $($inserted | ConvertTo-Json -Compress)"
} catch {
  Write-Host "Error: $($_.Exception.Message)"
  if ($_.Exception.Response) {
    $stream = $_.Exception.Response.GetResponseStream()
    $reader = New-Object System.IO.StreamReader($stream)
    $respBody = $reader.ReadToEnd()
    Write-Host "Response: $respBody"
  }
}