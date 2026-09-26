param()
$envVars = @{}
Get-Content "$PSScriptRoot\.env.local" | ForEach-Object {
  if ($_ -match '^\s*([^=#\s]+)=(.*)$') { $envVars[$matches[1]] = ($matches[2] -replace '^"|"$','') }
}
$BaseUrl = "https://qiceptunywrchwihgyth.supabase.co"
$Headers = @{ apikey = $envVars["NEXT_PUBLIC_SUPABASE_ANON_KEY"]; Authorization = "Bearer $($envVars['SUPABASE_SERVICE_ROLE_KEY'])" }
$url = "$BaseUrl/rest/v1/block_requests?select=id,status,work_description,segment_id&limit=10"
$reqs = Invoke-RestMethod $url -Headers $Headers
$reqs | ForEach-Object { Write-Host "id=$($_.id) status=$($_.status) desc=$($_.work_description) seg=$($_.segment_id)" }