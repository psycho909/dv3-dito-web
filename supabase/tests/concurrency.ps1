$ErrorActionPreference = 'Stop'
$container = 'supabase_db_dv3-dito-web'
$uid = '33333333-3333-4333-8333-333333333333'

function Invoke-LocalSql([string]$sql) {
    $result = & docker exec $container psql -U postgres -d postgres -At -v ON_ERROR_STOP=1 -c $sql
    if ($LASTEXITCODE -ne 0) { throw 'Local SQL failed' }
    return $result
}

function Start-LocalSql([string]$sql) {
    $info = [System.Diagnostics.ProcessStartInfo]::new('docker')
    $info.UseShellExecute = $false
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    foreach ($argument in @('exec', $container, 'psql', '-U', 'postgres', '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1', '-c', $sql)) {
        $info.ArgumentList.Add($argument)
    }
    return [System.Diagnostics.Process]::Start($info)
}

# Only the CLI's local Docker container is addressed; no remote DB URL is accepted.
Invoke-LocalSql "insert into auth.users(id,is_anonymous) values('$uid',true)" | Out-Null
$first = $null
$second = $null
try {
    $prefix = "begin; set local role authenticated; select set_config('request.jwt.claim.sub','$uid',true);"
    $state = '{"schemaVersion":1}'
    $actions = '[{"eventId":"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee","at":"2026-10-11T00:00:00.000Z","type":"CONFIRM_FULL_DECK","payload":{}}]'
    $first = Start-LocalSql "$prefix set local application_name='forge-first-write-test'; select public.commit_forge_state(0,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','$state','$actions'); select pg_sleep(4); commit;"
    $deadline = [DateTime]::UtcNow.AddSeconds(10)
    do {
        $holdingLock = Invoke-LocalSql "select count(*) from pg_stat_activity where application_name='forge-first-write-test' and wait_event='PgSleep'"
        if ($holdingLock -eq '1') { break }
        if ($first.HasExited -or [DateTime]::UtcNow -gt $deadline) { throw 'First transaction did not reach lock-holding checkpoint' }
        Start-Sleep -Milliseconds 100
    } while ($true)
    $second = Start-LocalSql "$prefix select public.commit_forge_state(0,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','$state','$actions'); commit;"
    foreach ($process in @($first, $second)) {
        if (-not $process.WaitForExit(15000)) { throw 'Concurrent transaction timed out' }
        if ($process.ExitCode -ne 0) { throw $process.StandardError.ReadToEnd() }
    }
    $firstOutput = $first.StandardOutput.ReadToEnd()
    $secondOutput = $second.StandardOutput.ReadToEnd()
    if ($firstOutput -notmatch '"status": "COMMITTED"' -or $secondOutput -notmatch '"status": "VERSION_CONFLICT"') {
        throw "Unexpected concurrent results: $firstOutput / $secondOutput"
    }
    if ((Invoke-LocalSql "select revision from public.forge_states where user_id='$uid'") -ne '1') { throw 'Revision was overwritten' }
    if ((Invoke-LocalSql "select count(*) from public.forge_mutations where user_id='$uid'") -ne '1') { throw 'Duplicate mutation committed' }
    Write-Output 'PASS: concurrent initial writes commit once; second gets VERSION_CONFLICT.'
} finally {
    foreach ($process in @($first, $second)) {
        if ($null -ne $process -and -not $process.HasExited) { $process.Kill($true); $process.WaitForExit() }
    }
    Invoke-LocalSql "delete from auth.users where id='$uid'" | Out-Null
}
