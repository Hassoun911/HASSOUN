#!/usr/bin/env python3
"""Restore the current Windsor network helper during historical build reconstruction.

The v1.0.44 reconstruction has two TypeScript checks, including an early
tablet/native pass. The latest prayerData.ts is intentionally retained, but
legacy patches sometimes remove its helper while preserving the call. Restore
only that helper from the untouched input saved before rebuilding.
"""
from pathlib import Path
source = Path("/tmp/hassoun-latest/mobile/src/prayerData.ts")
target = Path("mobile/src/prayerData.ts")
if not source.is_file() or not target.is_file():
    raise SystemExit("Current Windsor prayer loader snapshot unavailable")
current = target.read_text(encoding="utf-8")
if "fetchOfficialWindsorSchedule(" not in current:
    print("No Windsor fetch call in this intermediate rebuild; preserving source")
    raise SystemExit(0)
if "async function fetchOfficialWindsorSchedule(" in current:
    print("Canonical Windsor fetch helper already intact")
    raise SystemExit(0)
original = source.read_text(encoding="utf-8")
start = original.index("async function fetchOfficialWindsorSchedule(")
end = original.index("\nfunction windsorFallback(", start)
fragment = original[start:end]
insert_at = current.find("function windsorFallback(")
if insert_at < 0:
    insert_at = current.find("export async function loadInitialPrayerTimes(")
if insert_at < 0:
    raise SystemExit("No safe injection point in historical prayer source")
current = current[:insert_at] + fragment + "\n" + current[insert_at:]
if "OFFICIAL_WINDSOR_URL" not in current:
    raise SystemExit("Canonical Windsor URL missing in historical prayer source")
target.write_text(current, encoding="utf-8")
print("HASSOUN_V1045_EARLY_WINDSOR_HELPER_RESTORED")
