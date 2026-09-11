param()
$envVars = @{}
Get-Content "$PSScriptRoot\.env.local" | ForEach-Object {
  if ($_ -match '^\s*([^=#\s]+)=(.*)$') { $envVars[$matches[1]] = ($matches[2] -replace '^"|"$','') }
}
$BaseUrl = "https://qiceptunywrchwihgyth.supabase.co"
$H = @{ "apikey" = $envVars["NEXT_PUBLIC_SUPABASE_ANON_KEY"]; "Authorization" = "Bearer $($envVars['SUPABASE_SERVICE_ROLE_KEY'])"; "Content-Type" = "application/json" }
$segs = Invoke-RestMethod "$BaseUrl/rest/v1/segments?select=id&order=name" -Headers $H
$seg = $segs[0]
$profs = Invoke-RestMethod "$BaseUrl/rest/v1/profiles?select=id&limit=1" -Headers $H
$pArr = @($profs)
$reqBy = if ($pArr.Count -gt 0) { $pArr[0].id } else { $null }

$startStr = (Get-Date).AddHours(40).ToString("yyyy-MM-ddTHH:mm:ss")
$body = @{ segment_id = [int]$seg.id; work_type = "track"; work_description = "Inspect rail junction" ; justification = "Urgent safety inspection"; requested_start = $startStr; requested_duration_mins = 90; safety_criticality = "safety_critical"; department = "TMS"; status = "submitted" }
if ($reqBy) { $body.requested_by = $reqBy }
$clean = @{}
foreach ($k in $body.Keys) { if ($body[$k] -isnot [string] -or $body[$k] -ne '') { $clean[$k] = $body[$k] } }
$body = $clean
Write-Host "JSON:`n$(ConvertTo-Json $body -Depth 10 -Compress)"
