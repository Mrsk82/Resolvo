<#
  Adds the keys for Topics (Brave, YouTube, Bluesky, X) to the live server, without the keys ever being shown on screen or typed into a chat.

  Step 1 (safe, sends nothing):   powershell -ExecutionPolicy Bypass -File C:\Users\Asif\Desktop\New\TechTrack\scripts\add-listening-keys.ps1
  Step 2 (sends and restarts):    powershell -ExecutionPolicy Bypass -File C:\Users\Asif\Desktop\New\TechTrack\scripts\add-listening-keys.ps1 -Apply

  It asks for each key. Press Enter to skip any you do not have yet. Typing is hidden. It keeps a copy of the old settings on the server
  (/opt/resolvo/.env.bak-keys) and only replaces the lines it is given.
#>
param([switch]$Apply)
$ErrorActionPreference = 'Stop'
$server = 'root@157.173.123.186'
$sshKey = Join-Path $env:USERPROFILE '.ssh\resolvo_vps_deploy'
if (-not (Test-Path $sshKey)) { throw "The deploy key was not found at $sshKey" }

$items = @(
  @{ n = 'BRAVE_API_KEY';      label = 'Brave Search API key (web and news)';                         secret = $true  },
  @{ n = 'YOUTUBE_API_KEY';    label = 'YouTube Data API key';                                        secret = $true  },
  @{ n = 'BSKY_HANDLE';        label = 'Bluesky handle, for example yourname.bsky.social';           secret = $false },
  @{ n = 'BSKY_APP_PASSWORD';  label = 'Bluesky APP password (not your main password)';              secret = $true  },
  @{ n = 'X_BEARER_TOKEN';     label = 'X (Twitter) Bearer Token, only if you want X (paid)';         secret = $true  }
)

function Read-Value($it) {
  Write-Host ''
  Write-Host ($it.label + ' (Enter to skip)') -ForegroundColor Cyan
  if ($it.secret) {
    $sec = Read-Host -Prompt $it.n -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringAuto($ptr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
  }
  return (Read-Host -Prompt $it.n)
}

$lines = @()
foreach ($it in $items) {
  $v = (Read-Value $it)
  if ($null -eq $v) { continue }
  $v = $v.Trim()
  if ($v -eq '') { continue }
  if ($v -match '[\s"''`\\$]') { Write-Host ("  Skipped {0}: it has a space or a quote or a symbol that does not belong in a key. Check it was copied exactly." -f $it.n) -ForegroundColor Yellow; continue }
  if ($v.Length -lt 6) { Write-Host ("  Skipped {0}: too short to be a key." -f $it.n) -ForegroundColor Yellow; continue }
  $lines += ($it.n + '=' + $v)
}

Write-Host ''
if ($lines.Count -eq 0) { Write-Host 'Nothing to add. No changes made.'; exit 0 }
Write-Host 'These will be set on the server:' -ForegroundColor Green
foreach ($l in $lines) { $n, $v = $l -split '=', 2; Write-Host ("  {0} = {1}... ({2} characters)" -f $n, $v.Substring(0, [Math]::Min(3, $v.Length)), $v.Length) }

if (-not $Apply) {
  Write-Host ''
  Write-Host 'Dry run: nothing was sent. Run the same command again with -Apply to send them and restart Resolvo.' -ForegroundColor Yellow
  exit 0
}

Write-Host ''
$ok = Read-Host 'Type YES to send these to the server and restart Resolvo'
if ($ok -ne 'YES') { Write-Host 'Cancelled. No changes made.'; exit 0 }

$remote = @(
  'set -e',
  'cd /opt/resolvo',
  'cp .env .env.bak-keys',
  '[ -n "$(tail -c1 .env)" ] && echo >> .env || true',
  'while IFS= read -r line; do',
  '  n="${line%%=*}"',
  '  sed -i "/^${n}=/d" .env',
  '  printf ''%s\n'' "$line" >> .env',
  'done <<''KEYS_EOF''',
  ($lines -join "`n"),
  'KEYS_EOF',
  'pm2 restart resolvo > /dev/null',
  'echo done',
  '# end'
) -join "`n"

$OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$remote | ssh -o BatchMode=yes -i $sshKey -o IdentitiesOnly=yes $server 'bash -s'
if ($LASTEXITCODE -ne 0) { throw 'The server did not accept the change. Nothing was restarted.' }
Write-Host ''
Write-Host 'Done. Open the Architecture page, Topics section: each place you added should say ready.' -ForegroundColor Green
