param()
$envVars = @{}
Get-Content "$PSScriptRoot\.env.local" | ForEach-Object {
  if ($_ -match '^\s*([^=#\s]+)=(.*)$') { $envVars[$matches[1]] = ($matches[2] -replace '^"|"$','') }
}
$BaseUrl = "https://qiceptunywrchwihgyth.supabase.co"
$Headers = @{ 
  apikey = $envVars["NEXT_PUBLIC_SUPABASE_ANON_KEY"]; 
  Authorization = "Bearer $($envVars['SUPABASE_SERVICE_ROLE_KEY'])"
  "Content-Type" = "application/json"
  Prefer = "return=representation"
}

# Use the created request ID
$rid = "5c9bd286-ff72-4c87-9eba-619c5075d196"
Write-Host "Using request id=$rid"

# Process the block request (score it)
Write-Host "Processing block request..."
try {
  $resp = Invoke-RestMethod "http://localhost:3001/api/block-requests" -Method Post -Body (@{ block_request_id = $rid } | ConvertTo-Json -Compress) -ContentType "application/json" -TimeoutSec 180
  Write-Host "Process API response: $($resp | ConvertTo-Json -Compress)"
} catch { Write-Host "Process API error: $($_.Exception.Message)" }

# Wait for scoring to complete
$status = "submitted"
for ($i = 0; $i -lt 50; $i++) {
  Start-Sleep -Seconds 2
  $r = Invoke-RestMethod "$BaseUrl/rest/v1/block_requests?select=status,priority_score,delay_risk&id=eq.$rid" -Headers $Headers
  if ($r -and $r[0].status -ne "submitted") { $status = $r[0].status; break }
}
Write-Host "Final: status=$status score=$($r[0].priority_score) risk=$($r[0].delay_risk)"

# Check plan options
$opts = Invoke-RestMethod "$BaseUrl/rest/v1/block_plan_options?select=option_label,adjusted_duration_mins,priority_score,delay_risk,is_recommended,what_if_note&block_request_id=eq.$rid" -Headers $Headers
Write-Host "Plan options: $(if($opts){$opts.Count}else{0})"
if ($opts) { $o = @($opts); $o | ForEach-Object { Write-Host "  $($_.option_label): dur=$($_.adjusted_duration_mins) score=$($_.priority_score) risk=$($_.delay_risk) rec=$($_.is_recommended) whatif=$([bool]$_.what_if_note)" } }

# Generate WEEKLY horizon plan
$weekStart = (Get-Date).ToString("yyyy-MM-dd")
Write-Host "Generating WEEKLY plan from $weekStart..."
try {
  $weekResp = Invoke-RestMethod "http://localhost:3001/api/generate-horizon-plan" -Method Post -Body (@{ horizonType = "weekly"; startDate = $weekStart } | ConvertTo-Json -Compress) -ContentType "application/json" -TimeoutSec 120
  $weekHorizonId = $weekResp.horizonId
  Write-Host "Weekly plan generated: horizonId=$weekHorizonId"
} catch { Write-Host "Weekly plan error: $($_.Exception.Message)"; $weekHorizonId = $null }

# Generate MONTHLY horizon plan
$monthStart = (Get-Date).ToString("yyyy-MM-dd")
Write-Host "Generating MONTHLY plan from $monthStart..."
try {
  $monthResp = Invoke-RestMethod "http://localhost:3001/api/generate-horizon-plan" -Method Post -Body (@{ horizonType = "monthly"; startDate = $monthStart } | ConvertTo-Json -Compress) -ContentType "application/json" -TimeoutSec 120
  $monthHorizonId = $monthResp.horizonId
  Write-Host "Monthly plan generated: horizonId=$monthHorizonId"
} catch { Write-Host "Monthly plan error: $($_.Exception.Message)"; $monthHorizonId = $null }

# Wait for summary generation
Start-Sleep -Seconds 5

# Check weekly plan items
if ($weekHorizonId) {
  Write-Host "--- Weekly Plan Items ---"
  $weekItems = Invoke-RestMethod "http://localhost:3001/api/horizon-items?horizonId=$weekHorizonId" -Headers @{ "Content-Type" = "application/json" }
  Write-Host "Items count: $($weekItems.items.Count)"
  if ($weekItems.items.Count -gt 0) {
    $weekItems.items | ForEach-Object {
      Write-Host "  id=$($_.id) reqId=$($_.block_request_id) date=$($_.assigned_date) hour=$($_.assigned_start_hour) dur=$($_.assigned_duration_mins) status=$($_.status) reason=$($_.reason)"
    }
  }
  $weekHorizon = Invoke-RestMethod "http://localhost:3001/api/horizons" -Headers @{ "Content-Type" = "application/json" }
  $wh = $weekHorizon.horizons | Where-Object { $_.id -eq $weekHorizonId }
  if ($wh) { Write-Host "Weekly horizon: type=$($wh.horizon_type) start=$($wh.horizon_start) end=$($wh.horizon_end) avail=$($wh.projected_availability_pct)% solver=$($wh.solver_used)" }
}

# Check monthly plan items
if ($monthHorizonId) {
  Write-Host "--- Monthly Plan Items ---"
  $monthItems = Invoke-RestMethod "http://localhost:3001/api/horizon-items?horizonId=$monthHorizonId" -Headers @{ "Content-Type" = "application/json" }
  Write-Host "Items count: $($monthItems.items.Count)"
  if ($monthItems.items.Count -gt 0) {
    $monthItems.items | ForEach-Object {
      Write-Host "  id=$($_.id) reqId=$($_.block_request_id) date=$($_.assigned_date) hour=$($_.assigned_start_hour) dur=$($_.assigned_duration_mins) status=$($_.status) reason=$($_.reason)"
    }
  }
  $monthHorizon = Invoke-RestMethod "http://localhost:3001/api/horizons" -Headers @{ "Content-Type" = "application/json" }
  $mh = $monthHorizon.horizons | Where-Object { $_.id -eq $monthHorizonId }
  if ($mh) { Write-Host "Monthly horizon: type=$($mh.horizon_type) start=$($mh.horizon_start) end=$($mh.horizon_end) avail=$($mh.projected_availability_pct)% solver=$($mh.solver_used)" }
}

# Cleanup
Write-Host "--- Cleanup ---"
Invoke-RestMethod "$BaseUrl/rest/v1/block_plan_options?block_request_id=eq.$rid" -Headers $Headers -Method Delete
Invoke-RestMethod "$BaseUrl/rest/v1/block_requests?id=eq.$rid" -Headers $Headers -Method Delete
if ($weekHorizonId) { Invoke-RestMethod "$BaseUrl/rest/v1/block_plan_horizons?id=eq.$weekHorizonId" -Headers $Headers -Method Delete }
if ($monthHorizonId) { Invoke-RestMethod "$BaseUrl/rest/v1/block_plan_horizons?id=eq.$monthHorizonId" -Headers $Headers -Method Delete }
Write-Host "Cleanup done"