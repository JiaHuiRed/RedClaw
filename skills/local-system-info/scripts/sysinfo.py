#!/usr/bin/env python3
"""System info reporter - outputs JSON for CPU, memory, disk, processes."""

import argparse
import json
import os
import sys

try:
    import psutil
except ImportError:
    print(json.dumps({"error": "psutil not installed. Run: pip install psutil"}))
    sys.exit(1)


def get_cpu():
    cpu_percent = psutil.cpu_percent(interval=0.5)
    cpu_count = psutil.cpu_count(logical=True)
    try:
        load_avg = [round(x / cpu_count, 2) if cpu_count else x for x in psutil.getloadavg()]
    except (AttributeError, OSError):
        load_avg = None  # Not available on Windows
    return {
        "cpu_percent": cpu_percent,
        "cpu_count": cpu_count,
        "load_avg": load_avg,
    }


def get_memory():
    mem = psutil.virtual_memory()
    swap = psutil.swap_memory()
    return {
        "total": mem.total,
        "available": mem.available,
        "percent": mem.percent,
        "used": mem.used,
        "free": mem.free,
        "swap_total": swap.total,
        "swap_percent": swap.percent,
    }


def get_disk(path=None):
    if path is None:
        # On Windows, check all partitions; on Unix, root
        if os.name == "nt":
            parts = []
            for p in psutil.disk_partitions():
                try:
                    usage = psutil.disk_usage(p.mountpoint)
                    parts.append({
                        "mount": p.mountpoint,
                        "total": usage.total,
                        "used": usage.used,
                        "free": usage.free,
                        "percent": usage.percent,
                        "fstype": p.fstype,
                    })
                except PermissionError:
                    continue
            return parts
        else:
            d = psutil.disk_usage("/")
            return [{
                "mount": "/",
                "total": d.total,
                "used": d.used,
                "free": d.free,
                "percent": d.percent,
            }]
    else:
        d = psutil.disk_usage(path)
        return [{
            "mount": path,
            "total": d.total,
            "used": d.used,
            "free": d.free,
            "percent": d.percent,
        }]


def get_processes(limit=20):
    procs = []
    for p in psutil.process_iter(["pid", "name", "username", "cpu_percent", "memory_percent"]):
        try:
            info = p.info
            procs.append({
                "pid": info["pid"],
                "name": info["name"] or "?",
                "username": info["username"] or "?",
                "cpu_percent": info["cpu_percent"] or 0.0,
                "memory_percent": info["memory_percent"] or 0.0,
            })
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
    procs.sort(key=lambda x: x["cpu_percent"], reverse=True)
    return procs[:limit]


def main():
    parser = argparse.ArgumentParser(description="System info reporter")
    parser.add_argument("action", choices=["summary", "cpu", "memory", "disk", "processes"],
                        help="What to report")
    parser.add_argument("--limit", type=int, default=20,
                        help="Process count limit (processes action only)")
    args = parser.parse_args()

    if args.action == "summary":
        data = {
            "cpu": get_cpu(),
            "memory": get_memory(),
            "disk": get_disk(),
        }
    elif args.action == "cpu":
        data = get_cpu()
    elif args.action == "memory":
        data = get_memory()
    elif args.action == "disk":
        data = get_disk()
    elif args.action == "processes":
        data = get_processes(args.limit)
    else:
        data = {"error": f"Unknown action: {args.action}"}

    print(json.dumps(data, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
