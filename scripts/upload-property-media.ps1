param(
  [string]$ProjectRef = "fyiocriendicwfpbqfhz"
)

$ErrorActionPreference = "Continue"
$projectRoot = Split-Path -Parent $PSScriptRoot
$raw = (& npx.cmd supabase projects api-keys --project-ref $ProjectRef --output json 2>$null | Out-String)
$ErrorActionPreference = "Stop"
$start = $raw.IndexOf("[")
$end = $raw.LastIndexOf("]")
if ($start -lt 0 -or $end -lt $start) { throw "Não foi possível obter as chaves do projeto." }
$keys = $raw.Substring($start, $end - $start + 1) | ConvertFrom-Json
$serviceKey = ($keys | Where-Object { $_.name -eq "service_role" } | Select-Object -First 1).api_key
if (-not $serviceKey) { throw "Chave de serviço não encontrada." }

$baseUrl = "https://$ProjectRef.supabase.co"
$authHeaders = @{ Authorization = "Bearer $serviceKey"; apikey = $serviceKey; "x-upsert" = "true" }
$dbHeaders = @{ Authorization = "Bearer $serviceKey"; apikey = $serviceKey; Prefer = "resolution=merge-duplicates,return=minimal" }
$sources = @(
  @{ Property = "10000000-0000-4000-8000-000000000001"; Folder = "casa5" },
  @{ Property = "10000000-0000-4000-8000-000000000002"; Folder = "casa1" },
  @{ Property = "10000000-0000-4000-8000-000000000003"; Folder = "casa4" },
  @{ Property = "10000000-0000-4000-8000-000000000004"; Folder = "casa3" }
)

$uploaded = 0
foreach ($source in $sources) {
  $folderPath = Join-Path $projectRoot "src\imagens\$($source.Folder)"
  $files = Get-ChildItem -LiteralPath $folderPath -File -Filter "*.jpg" | Sort-Object {
    $numbers = [regex]::Matches($_.BaseName, "\d+")
    if ($numbers.Count) { [int]$numbers[$numbers.Count - 1].Value } else { 0 }
  }
  $position = 0
  foreach ($file in $files) {
    $position++
    $objectName = "{0}/{1:D3}.jpg" -f $source.Property, $position
    $uploadUrl = "$baseUrl/storage/v1/object/oliveira-property-media/$objectName"
    Invoke-WebRequest -UseBasicParsing -Method Post -Uri $uploadUrl -Headers $authHeaders -InFile $file.FullName -ContentType "image/jpeg" | Out-Null
    $publicUrl = "$baseUrl/storage/v1/object/public/oliveira-property-media/$objectName"
    $payload = @{
      property_id = $source.Property
      storage_path = $objectName
      public_url = $publicUrl
      position = $position
    } | ConvertTo-Json -Compress
    Invoke-RestMethod -Method Post -Uri "$baseUrl/rest/v1/oliveira_property_media?on_conflict=storage_path" -Headers $dbHeaders -ContentType "application/json" -Body $payload | Out-Null
    $uploaded++
  }
}

Write-Output "Fotos importadas: $uploaded"
