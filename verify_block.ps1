param()
$envVars = @{}
Get-Content "$PSScriptRoot\.env.local" | ForEach-Object {
  if ($_ -match '^\s*([^=#\s]+)=(.*)$') { $envVars[$matches[1]] = ($matches[2] -replace '^"|"$','') }
}
$BaseUrl = "https://qiceptunywrchwihgyth.supabase.co"
$Headers = @{ apikey = $envVars["NEXT_PUBLIC_SUPABASE_ANON_KEY"]; Authorization = "Bearer $($envVars['SUPABASE_SERVICE_ROLE_KEY'])" }

$segs = Invoke-RestMethod "$BaseUrl/rest/v1/segments?select=id,name&order=name" -Headers $Headers
$seg = $segs[0]
Write-Host "segment id=$($seg.id) name=$($seg.name)"

$profs = Invoke-RestMethod "$BaseUrl/rest/v1/profiles?select=id&limit=1" -Headers $Headers
$pArr = @($profs)
$reqBy = if ($pArr.Count -gt 0) { $pArr[0].id } else { $null }
Write-Host "profiles count=$($pArr.Count) reqBy=$reqBy"

$startStr = (Get-Date).AddHours(40).ToString("yyyy-MM-ddTHH:mm:ss")
$body = @{ segment_id = [int]$seg.id; work_type = "track"; work_description = "[AUTOTEST] Inspect rail junction after storm" ; justification = "[AUTOTEST] Urgent safety inspection" ; requested_start = $startStr; requested_duration_mins = 90; safety_criticality = "safety_critical"; department = "TMS"; status = "submitted" }
if ($reqBy) { $body.requested_by = $reqBy }
$inserted = Invoke-RestMethod "$BaseUrl/rest/v1/block_requests" -Headers ($Headers + @{ Prefer = "return=representation" }) -Method Post -Body (ConvertTo-Json $body -Compress)
$rid = $inserted[0].id
Write-Host "Inserted test request id=$rid (dur=90)"

try {
  $resp = Invoke-RestMethod "http://localhost:3000/api/block-requests" -Method Post -Body (@{ block_request_id = $rid } | ConvertTo-Json -Compress) -ContentType "application/json" -TimeoutSec 180
  Write-Host "API response: $($resp | ConvertTo-Json -Compress)"
} catch { Write-Host "API error: $($_.Exception.Message)" }

$status = "submitted"
for ($i = 0; $i -lt 50; $i++) {
  Start-Sleep -Seconds 2
  $r = Invoke-RestMethod "$BaseUrl/rest/v1/block_requests?select=status,priority_score,delay_risk&id=eq.$rid" -Headers $Headers
  if ($r -and $r[0].status -ne "submitted") { $status = $r[0].status; break }
}
Write-Host "Final: status=$status score=$($r[0].priority_score) risk=$($r[0].delay_risk)"

$opts = Invoke-RestMethod "$BaseUrl/rest/v1/block_plan_options?select=option_label,adjusted_duration_mins,priority_score,delay_risk,is_recommended,what_if_note&block_request_id=eq.$rid" -Headers $Headers
Write-Host "Plan options: $(if($opts){$opts.Count}else{0})"
if ($opts) { $o = @($opts); $o | ForEach-Object { Write-Host "  $($_.option_label): dur=$($_.adjusted_duration_mins) score=$($_.priority_score) risk=$($_.delay_risk) rec=$($_.is_recommended) whatif=$([bool]$_.what_if_note)" } }
if ($opts) { $cnt = (@($opts | Where-Object { $_.is_recommended -eq $true })).Count; Write-Host "Recommended count=$cnt (expect 1, dur<240)" }

Invoke-RestMethod "$BaseUrl/rest/v1/block_plan_options?block_request_id=eq.$rid" -Headers $Headers -Method Delete
Invoke-RestMethod "$BaseUrl/rest/v1/block_requests?id=eq.$rid" -Headers $Headers -Method Delete
Write-Host "Cleanup done"
