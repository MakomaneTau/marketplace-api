$ErrorActionPreference = "Stop"

function Invoke-Checked([string]$Label, [scriptblock]$Command) {
  Write-Host "`n== $Label =="
  & $Command
  if ($LASTEXITCODE -ne 0) { throw "$Label failed with exit code $LASTEXITCODE" }
}

$container = "supabase_db_marketplace-api"
$temporaryCategorySlug = "api-acceptance-temporary"

try {
  Invoke-Checked "Unit and integration tests" { npm.cmd test }
  Invoke-Checked "JavaScript syntax check" { npm.cmd run typecheck }
  Invoke-Checked "Production build check" { npm.cmd run build }
  Invoke-Checked "Database lint" { npm.cmd run supabase:lint }
  Invoke-Checked "Acceptance category setup" {
    docker exec $container psql -U postgres -d postgres -c "insert into public.categories(name,slug,description) values ('API Acceptance Temporary','$temporaryCategorySlug','Temporary category for non-destructive API acceptance.') on conflict (slug) do nothing;"
  }
  Invoke-Checked "Catalogue and favourites smoke" { npm.cmd run smoke:products }
  Invoke-Checked "Transactional orders and reviews smoke" { npm.cmd run smoke:orders }
  Invoke-Checked "Messaging and notifications smoke" { npm.cmd run smoke:messaging }
  Invoke-Checked "Settings smoke" { npm.cmd run smoke:settings }
  Write-Host "`nAPI acceptance passed. No database reset was performed."
}
finally {
  docker exec $container psql -U postgres -d postgres -c "delete from public.categories where slug = '$temporaryCategorySlug';" | Out-Host
}
