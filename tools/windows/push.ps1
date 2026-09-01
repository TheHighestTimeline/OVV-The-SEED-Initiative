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

# Without this, any terminating error closes the window before it can be read,
# which looks identical to the script doing nothing at all.
trap {
  Write-Host ''
  Write-Host 'Something went wrong:' -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red
  if ($_.InvocationInfo) { Write-Host ('  at line ' + $_.InvocationInfo.ScriptLineNumber) }
  Write-Host ''
  Write-Host 'Send this text to Claude.'
  Read-Host 'Press Enter to close'
  exit 1
}

Add-Type -AssemblyName System.Drawing

$REPO   = 'https://github.com/TheHighestTimeline/OVV-The-SEED-Initiative.git'
$BRANCH = 'claude/3d-world-featured-items-table-exwnoi'
$MAXPX  = 2048          # 4K is four times the download for detail nobody sees
$QUALITY = 88

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$drop = Join-Path $here 'drop'
$repo = Join-Path $here 'repo'

# Extra folders to read, one absolute path per line, in sources.txt next to
# this script. Keeps someone from having to copy downloads into `drop` every
# time when their assets already live somewhere else. Blank lines and lines
# starting with # are ignored.
$sourcesFile = Join-Path $here 'sources.txt'
$scanDirs = @($drop)
if (Test-Path $sourcesFile) {
  foreach ($line in Get-Content $sourcesFile) {
    $t = $line.Trim()
    if (-not $t -or $t.StartsWith('#')) { continue }
    if (Test-Path $t) { $scanDirs += $t }
    else { Write-Host "  sources.txt: no such folder, skipping - $t" -ForegroundColor Yellow }
  }
}

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

# ------------------------------------------------------------------- unzip
# Download sites hand you a zip; expecting someone to unpack ten of them by
# hand is how this step gets skipped. Unpack anything we find, in place.
$zips = Get-ChildItem $scanDirs -Recurse -File -ErrorAction SilentlyContinue |
        Where-Object { $_.Extension -eq '.zip' }
foreach ($z in $zips) {
  $target = Join-Path $z.DirectoryName $z.BaseName
  if (-not (Test-Path $target)) {
    Write-Host "  unzipping $($z.Name)..."
    try { Expand-Archive $z.FullName -DestinationPath $target -Force }
    catch { Write-Host "  could not unzip $($z.Name): $($_.Exception.Message)" -ForegroundColor Yellow }
  }
}

# ------------------------------------------------------------- the textures
$textures = Get-ChildItem $scanDirs -Recurse -File -ErrorAction SilentlyContinue | Where-Object {
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
# A .glb carries its textures inside it, so it travels as one file. A .obj or
# .fbx does not: it points at a .mtl and a pile of image files beside it, and
# separating them from their folder breaks the model. So GLB copies as a file
# and everything else copies as its whole directory.
$models = Get-ChildItem $scanDirs -Recurse -File -ErrorAction SilentlyContinue |
          Where-Object { $_.Extension -match '^\.(glb|gltf)$' }
foreach ($m in $models) {
  Copy-Item $m.FullName (Join-Path $mdlDir $m.Name) -Force
  Write-Host ("  model    {0,-42} {1,6:N1} MB" -f $m.Name, ($m.Length / 1MB))
  if ($m.Length -gt 40MB) {
    Write-Host "           ^ heavy for a browser; Claude will decimate it" -ForegroundColor Yellow
  }
  $count++
}

$otherModels = Get-ChildItem $scanDirs -Recurse -File -ErrorAction SilentlyContinue |
               Where-Object { $_.Extension -match '^\.(obj|fbx)$' }
$copiedDirs = @{}
foreach ($m in $otherModels) {
  $srcDir = $m.DirectoryName
  if ($copiedDirs.ContainsKey($srcDir)) { continue }
  $copiedDirs[$srcDir] = $true

  # never drag a whole download folder in wholesale: skip the formats we
  # cannot use, which is most of what these packs ship
  $keep = Get-ChildItem $srcDir -File | Where-Object {
    $_.Extension -match '^\.(obj|fbx|mtl|jpg|jpeg|png|tga|bmp)$'
  }
  if (-not $keep) { continue }

  $destDir = Join-Path $mdlDir (Split-Path $srcDir -Leaf)
  New-Item -ItemType Directory -Force -Path $destDir | Out-Null
  $mb = 0
  foreach ($k in $keep) { Copy-Item $k.FullName $destDir -Force; $mb += $k.Length / 1MB }
  Write-Host ("  model    {0,-42} {1,6:N1} MB  ({2} files)" -f
              (Split-Path $srcDir -Leaf), $mb, $keep.Count)
  $count += $keep.Count
}

if ($count -eq 0) {
  Write-Host ''
  Write-Host 'Nothing found in the drop folder.' -ForegroundColor Yellow
  Write-Host 'Searched:'
  foreach ($d in $scanDirs) { Write-Host "  $d" }
  Write-Host ''
  Read-Host 'Press Enter to close'; exit 0
}

# ----------------------------------------------------------------- the push
Write-Host ''
Write-Host "Pushing $count files..." -ForegroundColor Cyan
git -C $repo add -A 'seed-v5/public/assets'
# --quiet exits 1 when the index differs from HEAD, 0 when it matches. Run it
# as its own statement: a PowerShell condition takes an expression, and
# `if (cmd; $LASTEXITCODE -eq 0)` is a parse error, which kills the whole
# script before a single line executes.
git -C $repo diff --cached --quiet 2>$null
$nothingStaged = ($LASTEXITCODE -eq 0)
if ($nothingStaged) {
  Write-Host 'Nothing changed since last time.' -ForegroundColor Yellow
} else {
  git -C $repo commit -m "Add assets ($count files) via push.bat"
  git -C $repo push origin $BRANCH
  Write-Host ''
  Write-Host 'Pushed. Tell Claude the assets are in.' -ForegroundColor Green
}
Write-Host ''
Read-Host 'Press Enter to close'
