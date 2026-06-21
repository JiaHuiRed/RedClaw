---
name: local-system-info
description: "Return system metrics (CPU, RAM, disk, processes) using psutil on Windows/Linux/macOS."
metadata: { "openclaw": { "emoji": "🖥️", "requires": { "pip": ["psutil"] }, "version": "1.1.0" } }
---

# Local System Info

Monitor local system resources including CPU, memory, disk usage, and running processes using psutil. Returns structured JSON.

## Tool: system_info

Retrieve system metrics.

**Parameters:**

- `action` (string, required): One of `summary`, `cpu`, `memory`, `disk`, `processes`.
- `limit` (integer, optional): Number of processes to list (default: 20). Only used with `action=processes`.

### Usage

```bash
# Full system summary
python scripts/sysinfo.py summary

# CPU metrics only
python scripts/sysinfo.py cpu

# Memory metrics only
python scripts/sysinfo.py memory

# Disk usage
python scripts/sysinfo.py disk

# List top processes by CPU usage (limit: 10)
python scripts/sysinfo.py processes --limit 10
```

### Output: summary

```json
{
  "cpu": { "cpu_percent": 15.2, "cpu_count": 8, "load_avg": [0.5, 0.3, 0.2] },
  "memory": { "total": 17179869184, "available": 8589934592, "percent": 50.0, "swap_percent": 5.2 },
  "disk": { "total": 500000000000, "used": 250000000000, "free": 250000000000, "percent": 50.0 }
}
```

### Output: processes

```json
[{ "pid": 1234, "name": "python", "username": "user", "cpu_percent": 5.2, "memory_percent": 2.1 }]
```

## Notes

- `load_avg` not available on Windows (returns null)
- Requires `psutil` (pip install psutil)
- Cross-platform: Windows, Linux, macOS
