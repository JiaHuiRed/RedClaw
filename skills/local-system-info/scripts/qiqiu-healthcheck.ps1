# 260619 Red Qiuqiu Health Check - QiuQiu Ti Jian

param(
    [Alias('c')][switch]$Clean,
    [Alias('r')][switch]$ReportOnly,
    [Alias('q')][switch]$Quick
)

$ErrorActionPreference = "Stop"
$esc = [char]27

function Header($text) {
    Write-Host "`n$esc[1;36m====================$esc[0m"
    Write-Host "$esc[1;36m  $text$esc[0m"
    Write-Host "$esc[1;36m====================$esc[0m"
}

function Ok($text) { Write-Host "  $esc[0;32m[OK]$esc[0m $text" }
function Warn($text) { Write-Host "  $esc[0;33m[WARN]$esc[0m $text" }
function Err($text) { Write-Host "  $esc[0;31m[ERR]$esc[0m $text" }
function Info($text) { Write-Host "  $esc[0;90m[INFO]$esc[0m $text" }

# ======== 1. System Overview ========
Header "System Health Check"
Write-Host "  Time: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Host "  Host: $env:COMPUTERNAME"
$os = Get-CimInstance Win32_OperatingSystem
Write-Host "  OS: $($os.Caption)"
$sysProc = Get-CimInstance Win32_Process -Filter "Name='System'"
$uptimeHours = [math]::Round(((Get-Date) - $sysProc.CreationDate).TotalHours, 1)
Write-Host "  Uptime: ${uptimeHours}h"

# ======== 2. Disk ========
Header("Disk Space")

$drives = Get-CimInstance Win32_LogicalDisk | Where-Object { $_.DriveType -eq 3 }
foreach ($d in $drives) {
    $used = [math]::Round(($d.Size - $d.FreeSpace) / 1GB, 1)
    $total = [math]::Round($d.Size / 1GB, 1)
    $free = [math]::Round($d.FreeSpace / 1GB, 1)
    $pct = [math]::Round($d.FreeSpace / $d.Size * 100, 1)
    $pctLabel = "$pct%"

    if ($pct -lt 10) { Err "$($d.DeviceID) ($($d.VolumeName)): ${free}GB / ${total}GB (${pctLabel} free) - LOW SPACE" }
    elseif ($pct -lt 20) { Warn "$($d.DeviceID) ($($d.VolumeName)): ${free}GB / ${total}GB (${pctLabel} free)" }
    else { Ok "$($d.DeviceID) ($($d.VolumeName)): ${free}GB / ${total}GB (${pctLabel} free)" }
}

if (-not $Quick) {
    $disks = Get-CimInstance Win32_DiskDrive
    foreach ($disk in $disks) {
        if ($disk.Status -eq "OK") { Ok "Disk $($disk.Model): Healthy" }
        else { Err "Disk $($disk.Model): Status=$($disk.Status)" }
    }
}

# ======== 3. Event Log ========
Header("Event Log Scan")

$today = (Get-Date).Date
$appErrors = Get-WinEvent -LogName "Application" -MaxEvents 200 2>$null |
    Where-Object { $_.TimeCreated -ge $today -and $_.LevelDisplayName -eq "Error" }

$noiseSources = @("Application Error", "SideBySide")
$realAppErrors = $appErrors | Where-Object { $_.ProviderName -notin $noiseSources } | Group-Object ProviderName
$noiseCount = ($appErrors | Where-Object { $_.ProviderName -in $noiseSources }).Count

if ($realAppErrors.Count -gt 0) {
    Warn "$($realAppErrors.Count) error groups found:"
    $realAppErrors | Sort-Object Count -Descending | ForEach-Object {
        Write-Host "    $($_.Name): $($_.Count) times"
    }
} else {
    Ok "No unexpected application errors today"
}

if ($noiseCount -gt 0) {
    Info "Filtered $noiseCount known-noise entries"
}

$sysErrors = Get-WinEvent -LogName "System" -MaxEvents 200 2>$null |
    Where-Object { $_.TimeCreated -ge $today -and $_.LevelDisplayName -eq "Error" }
$realSysErrors = $sysErrors | Group-Object ProviderName
if ($realSysErrors.Count -gt 0) {
    $criticalSys = $realSysErrors | Where-Object { $_.Name -notin @("Service Control Manager", "Microsoft-Windows-DistributedCOM", "Microsoft-Windows-TPM-WMI") }
    if ($criticalSys.Count -gt 0) {
        Warn "System log anomalies:"
        $criticalSys | Sort-Object Count -Descending | ForEach-Object {
            Write-Host "    $($_.Name): $($_.Count) times"
        }
    } else {
        Ok "No critical system errors (only service/DCOM noise)"
    }
}

# ======== 4. Resources ========
Header("Resources")

$cpuLoad = [math]::Round((Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor | Where-Object Name -eq "_Total").PercentProcessorTime, 1)
$cpuPctStr = "$cpuLoad%"
if ($cpuLoad -gt 80) { Err "CPU: ${cpuPctStr} overloaded" }
elseif ($cpuLoad -gt 50) { Warn "CPU: ${cpuPctStr}" }
else { Ok "CPU: ${cpuPctStr}" }

$memTotal = [math]::Round($os.TotalVisibleMemorySize / 1MB, 1)
$memFree = [math]::Round($os.FreePhysicalMemory / 1MB, 1)
$memPct = [math]::Round((1 - $os.FreePhysicalMemory / $os.TotalVisibleMemorySize) * 100, 1)
$memPctStr = "$memPct%"
if ($memPct -gt 90) { Err "MEM: ${memPctStr} (${memFree}GB/${memTotal}GB free)" }
elseif ($memPct -gt 75) { Warn "MEM: ${memPctStr} (${memFree}GB/${memTotal}GB free)" }
else { Ok "MEM: ${memPctStr} (${memFree}GB/${memTotal}GB free)" }

if (-not $Quick) {
    Write-Host "`n  Top processes (by CPU time):"
    Get-Process | Sort-Object -Property CPU -Descending | Select-Object -First 6 -Skip 1 | ForEach-Object {
        $cs = [math]::Round($_.CPU, 1)
        $mm = [math]::Round($_.WorkingSet64 / 1MB, 1)
        Write-Host "    $($_.ProcessName): ${cs}s CPU, ${mm}MB"
    }
}

# ======== 5. Services ========
Header("Key Services")

$keyServices = @(
    @{Name="wuauserv"; Display="Windows Update"},
    @{Name="WSearch"; Display="Windows Search"},
    @{Name="Spooler"; Display="Print Spooler"},
    @{Name="EventLog"; Display="Event Log"},
    @{Name="TrustedInstaller"; Display="Windows Installer"}
)
foreach ($svc in $keyServices) {
    $s = Get-Service $svc.Name -ErrorAction SilentlyContinue
    if (-not $s) { Warn "$($svc.Display): not found" }
    elseif ($s.Status -eq "Running") { Ok "$($svc.Display): running ($($s.StartType))" }
    else { Warn "$($svc.Display): stopped ($($s.StartType))" }
}

# ======== 6. Mole Cleanup ========
if (-not $ReportOnly) {
    Header("Mole Cleanup Scan")

    $moleDir = "D:\AI\KLX\Qiu\Mole"
    $moleScript = Join-Path $moleDir "mole.ps1"

    if (Test-Path $moleScript) {
        $moleOutput = & $moleScript clean --dry-run 2>&1 | Out-String

        # extract dry-run sizes
        $totalMB = 0
        $matches = [regex]::Matches($moleOutput, "(\d+[\d.]*)\s*(MB|GB|KB)\s+dry")
        foreach ($m in $matches) {
            $val = [double]$m.Groups[1].Value
            $unit = $m.Groups[2].Value
            if ($unit -eq "GB") { $totalMB += $val * 1024 }
            elseif ($unit -eq "MB") { $totalMB += $val }
            elseif ($unit -eq "KB") { $totalMB += $val / 1024 }
        }

        if ($totalMB -gt 0) {
            if ($totalMB -gt 1024) {
                Warn "Can reclaim ~$([math]::Round($totalMB/1024, 1)) GB of junk!"
            } else {
                Warn "Can reclaim ~$([math]::Round($totalMB, 0)) MB of junk"
            }
        } else {
            Ok "System is clean"
        }

        if ($moleOutput -match "temp files") { Write-Host "  - User temp files" }
        if ($moleOutput -match "Browser caches") { Write-Host "  - Browser caches" }
        if ($moleOutput -match "Dev caches") { Write-Host "  - Dev tool caches" }

        if ($Clean) {
            Write-Host "`n  Running cleanup..."
            & $moleScript clean 2>&1 | Out-Null
            Ok "Cleanup done"
        } else {
            Write-Host ""
            Info "Use -c flag to actually clean"
        }
    } else {
        Warn "Mole not found at $moleDir"
    }
}

# ======== 7. Score ========
Header("Score")

$score = 100
$issues = @()
if ($cpuLoad -gt 80) { $score -= 15; $issues += "High CPU" }
if ($memPct -gt 90) { $score -= 15; $issues += "Low memory" }
if (($drives | Where-Object { $_.FreeSpace / $_.Size * 100 -lt 10 }).Count -gt 0) { $score -= 20; $issues += "Low disk space" }
if ($realAppErrors.Count -gt 0 -and $realAppErrors.Count -le 3) { $score -= 10; $issues += "App errors in log" }
elseif ($realAppErrors.Count -gt 3) { $score -= 15; $issues += "Multiple app errors" }

$grade = if ($score -ge 90) { "Excellent" } elseif ($score -ge 75) { "Good" } elseif ($score -ge 60) { "Fair" } else { "Needs attention" }

Write-Host "  Grade: $grade"
Write-Host "  Score: ${score}/100"
if ($issues.Count -gt 0) {
    Write-Host "  Issues:"
    $issues | ForEach-Object { Write-Host "    - $_" }
}

Write-Host ""
Write-Host "System health check complete!"
