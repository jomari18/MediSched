# Isolated synthetic test cluster only. Does not connect to an existing service.
$ErrorActionPreference = 'Stop'
$testProjectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$testDataPath = [System.IO.Path]::GetFullPath((Join-Path $testProjectRoot '.local-db'))
if (-not $testDataPath.StartsWith($testProjectRoot + [System.IO.Path]::DirectorySeparatorChar)) { throw 'Test path outside MediSched' }
$testPgBin = if ($env:MEDISCHED_PG_BIN) { $env:MEDISCHED_PG_BIN } else { 'C:\Program Files\PostgreSQL\18\bin' }
if (-not (Test-Path -LiteralPath (Join-Path $testDataPath 'PG_VERSION'))) {
  & (Join-Path $testPgBin 'initdb.exe') -D $testDataPath -U medisched_test -A trust -E UTF8
  if ($LASTEXITCODE -ne 0) { throw 'Could not initialize test cluster' }
}
& (Join-Path $testPgBin 'pg_ctl.exe') -D $testDataPath status
if ($LASTEXITCODE -ne 0) {
  # Keep the open log outside PGDATA so Windows recovery can sync data files.
  & (Join-Path $testPgBin 'pg_ctl.exe') -D $testDataPath -l (Join-Path $testProjectRoot '.local-postgres.log') -o '-p 55432 -h 127.0.0.1' -t 30 start
  if ($LASTEXITCODE -ne 0) { throw 'Could not start test cluster' }
}
$exists = & (Join-Path $testPgBin 'psql.exe') -h 127.0.0.1 -p 55432 -U medisched_test -d postgres -Atc "select 1 from pg_database where datname='medisched_test'"
if ($LASTEXITCODE -ne 0) { throw 'Could not inspect private cluster' }
if ($exists -ne '1') {
  & (Join-Path $testPgBin 'createdb.exe') -h 127.0.0.1 -p 55432 -U medisched_test medisched_test
  if ($LASTEXITCODE -ne 0) { throw 'Could not create test database' }
}
Write-Output 'Private synthetic PostgreSQL test cluster ready at 127.0.0.1:55432. Run npm run test:database.'
