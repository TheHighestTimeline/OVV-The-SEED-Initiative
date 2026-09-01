<#
  push.ps1 — drop assets in, get them into the repo.

  Put ambientCG / Poly Haven / Sketchfab downloads (loose files, folders, or
  unzipped sets) into the "drop" folder next to this script, then run push.bat.
  This script clones or updates the repo, resizes every texture to 2048 px,
  renames each map to the layout src/scanned.js expects, copies any .glb into
  the models folder, and pushes.

  Safe to run repeatedly. Anything already correct is simply overwritten.
#>

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$REPO   = 'https://github.com/TheHighestTimeline/OVV-The-SEED-Initiative.git'
$BRANCH = 'claude/3d-world-featured-items-table-exwnoi'
$MAXPX  = 2048          # 4K is four times the download for detail nobody sees
$QUALITY = 88

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$drop = Join-Path $here 'drop'
$repo = Join-Path $here 'repo'

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Write-Host ''
  Write-Host 'Git is not installed.' -ForegroundColor Red
  Write-Host 'Install it from https://git-scm.com/download/win, accept every'
  Write-Host 'default, then run this again.'
  Write-Host ''
  Read-Host 'Press Enter to close'; exit 1
}
New-Item -ItemType Directory -Force -Path $drop | Out-Null

# ---------------------------------------------------------------- the repo
# When this script already lives inside a clone (the normal case — you cloned
# the repo and are running tools\windows\push.bat from it), use that clone
# rather than nesting a second one underneath it.
$inside = git -C $here rev-parse --show-toplevel 2>$null
if ($LASTEXITCODE -eq 0 -and $inside) { $repo = $inside.Trim() }

if (Test-Path (Join-Path $repo '.git')) {
  Write-Host 'Updating the local copy...' -ForegroundColor Cyan
  git -C $repo fetch origin $BRANCH
  git -C $repo checkout $BRANCH
  git -C $repo pull --ff-only origin $BRANCH
} else {
  Write-Host 'Cloning (a browser window may ask you to sign in to GitHub)...' -ForegroundColor Cyan
  git clone --branch $BRANCH $REPO $repo
}

$matDir = Join-Path $repo 'seed-v5\public\assets\materials'
$mdlDir = Join-Path $repo 'seed-v5\public\assets\models'
New-Item -ItemType Directory -Force -Path $matDir, $mdlDir | Out-Null

# ambientCG asset id -> the directory name the loader looks for. An id that
# isn't listed still lands, under its own lowercased name; Claude maps it.
$MAP = @{
  'asphalt014'='asphalt'; 'asphalt026'='asphalt-worn'; 'asphalt023'='asphalt-rubber'
  'concrete042'='concrete-walk'; 'concrete033'='concrete-curb'
  'pavingstones131'='paving-stones'; 'gravel023'='gravel'
  'metal046'='metal-panel'; 'metal032'='roof-seam'; 'woodfloor041'='timber-deck'
}
$SUFFIX = @{
  'color'='color'; 'normalgl'='normal'; 'normaldx'='normal'
  'roughness'='roughness'; 'ambientocclusion'='ao'
}

$jpegEnc = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
           Where-Object { $_.MimeType -eq 'image/jpeg' }
$encParams = New-Object System.Drawing.Imaging.EncoderParameters 1
$encParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter(
  [System.Drawing.Imaging.Encoder]::Quality, [int]$QUALITY)

function Save-Resized($srcPath, $destPath) {
  $img = [System.Drawing.Image]::FromFile($srcPath)
  try {
    $scale = [Math]::Min(1.0, $MAXPX / [Math]::Max($img.Width, $img.Height))
    $w = [int]($img.Width * $scale); $h = [int]($img.Height * $scale)
    $bmp = New-Object System.Drawing.Bitmap $w, $h
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = 'HighQualityBicubic'
    $g.DrawImage($img, 0, 0, $w, $h)
    $g.Dispose()
    $bmp.Save($destPath, $jpegEnc, $encParams)
    $bmp.Dispose()
    return "$w x $h"
  } finally { $img.Dispose() }
}

# ------------------------------------------------------------- the textures
$textures = Get-ChildItem $drop -Recurse -File | Where-Object {
  $_.Extension -match '^\.(jpg|jpeg|png)$' -and
  $_.BaseName -match '_(Color|NormalGL|NormalDX|Roughness|AmbientOcclusion)$'
}

$seenGL = @{}
foreach ($f in $textures) {
  if ($f.BaseName -match '_NormalGL$') { $seenGL[($f.BaseName -split '_')[0].ToLower()] = $true }
}

$count = 0
foreach ($f in $textures) {
  $parts = $f.BaseName -split '_'
  $id    = $parts[0].ToLower()
  $kind  = $parts[-1].ToLower()

  # prefer the OpenGL normal: a DirectX map has green inverted, which lights
  # every bump as a dent in three.js
  if ($kind -eq 'normaldx' -and $seenGL[$id]) { continue }

  $dirName = if ($MAP.ContainsKey($id)) { $MAP[$id] } else { $id }
  $dest    = Join-Path $matDir $dirName
  New-Item -ItemType Directory -Force -Path $dest | Out-Null

  $outName = $SUFFIX[$kind] + '.jpg'
  $size = Save-Resized $f.FullName (Join-Path $dest $outName)
  if ($kind -eq 'normaldx') { Set-Content (Join-Path $dest 'NORMAL_IS_DX') 'green channel needs flipping' }
  Write-Host ("  {0,-18} {1,-14} {2}" -f $dirName, $SUFFIX[$kind], $size)
  $count++
}

# --------------------------------------------------------------- the models
$models = Get-ChildItem $drop -Recurse -File | Where-Object { $_.Extension -match '^\.(glb|gltf)$' }
foreach ($m in $models) {
  Copy-Item $m.FullName (Join-Path $mdlDir $m.Name) -Force
  Write-Host ("  model             {0}  ({1:N1} MB)" -f $m.Name, ($m.Length / 1MB))
  $count++
}

if ($count -eq 0) {
  Write-Host ''
  Write-Host 'Nothing found in the drop folder.' -ForegroundColor Yellow
  Write-Host "Put unzipped texture sets or .glb models in:"
  Write-Host "  $drop"
  Write-Host ''
  Read-Host 'Press Enter to close'; exit 0
}

# ----------------------------------------------------------------- the push
Write-Host ''
Write-Host "Pushing $count files..." -ForegroundColor Cyan
git -C $repo add -A 'seed-v5/public/assets'
if (git -C $repo diff --cached --quiet 2>$null; $LASTEXITCODE -eq 0) {
  Write-Host 'Nothing changed since last time.' -ForegroundColor Yellow
} else {
  git -C $repo commit -m "Add assets ($count files) via push.bat"
  git -C $repo push origin $BRANCH
  Write-Host ''
  Write-Host 'Pushed. Tell Claude the assets are in.' -ForegroundColor Green
}
Write-Host ''
Read-Host 'Press Enter to close'
