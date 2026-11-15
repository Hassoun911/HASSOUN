#!/usr/bin/env python3
"""Keep the nearest mosque card usable when public providers time out."""
from pathlib import Path

mosque_file = Path("mobile/src/NearbyMosquesPage.tsx")
home_file = Path("mobile/src/HomePrayerPage.tsx")
mosques = mosque_file.read_text(encoding="utf-8")
home = home_file.read_text(encoding="utf-8")

if "HASSOUN_NEAREST_MOSQUE_AUTO_V1045" in mosques:
    raise SystemExit("Patch already present")

old = '''  const trusted = await withDeadline(resolveTrustedWindsorRows(latitude, longitude), 6500, "WINDSOR_DIRECTORY_TIMEOUT");
  const map = new Map<string, MosqueRow>();
  for (const row of trusted) map.set(row.id, row);'''
new = '''  // HASSOUN_NEAREST_MOSQUE_AUTO_V1045
  // Use the known coordinate-backed mosques immediately as a reliable fallback.
  const map = new Map<string, MosqueRow>();
  for (const seed of WINDSOR_TRUSTED_MOSQUES) {
    if (!("latitude" in seed) || !("longitude" in seed)) continue;
    const lat = Number(seed.latitude);
    const lon = Number(seed.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const row: MosqueRow = {
      id: "trusted:" + seed.id,
      name: seed.name,
      displayName: seed.address,
      latitude: lat, longitude: lon,
      city: "Windsor", region: "Ontario", country: "Canada",
      distanceKm: distanceKm(latitude, longitude, lat, lon)
    };
    map.set(row.id, row);
  }
  try {
    const trusted = await withDeadline(resolveTrustedWindsorRows(latitude, longitude), 5000, "WINDSOR_DIRECTORY_TIMEOUT");
    for (const row of trusted) map.set(row.id, row);
  } catch {}'''
if mosques.count(old) != 1:
    raise SystemExit("Expected v1.0.44 Windsor lookup missing")
mosques = mosques.replace(old, new, 1)
mosque_file.write_text(mosques, encoding="utf-8")

# Existing Home automatically searches whenever its GPS context changes. Keep
# the last real match while trying again instead of replacing it with an error.
old_error = '''        setNearestMosque(null);
        setNearestMosqueState("error");'''
new_error = '''        // Retain last verified nearest mosque when provider is temporarily down.
        setNearestMosqueState("error");'''
if home.count(old_error) != 1:
    raise SystemExit("Expected v1.0.44 Home error handling missing")
home = home.replace(old_error, new_error, 1)

# Persist successful GPS matches and restore only if the query location matches.
import_anchor = 'import { findNearbyMosques, type MosqueRow } from "./NearbyMosquesPage";'
if import_anchor not in home:
    raise SystemExit("Missing nearest mosque Home import")
home = home.replace(import_anchor, import_anchor + '\nimport AsyncStorage from "@react-native-async-storage/async-storage";', 1)
load_anchor = '    setNearestMosqueState("loading");'
if home.count(load_anchor) != 1:
    raise SystemExit("Missing nearest mosque loading effect")
home = home.replace(load_anchor, '''    setNearestMosqueState("loading");
    void AsyncStorage.getItem("hassoun:nearest-mosque:last-good").then(raw => {
      if (!alive || !raw) return;
      try {
        const saved = JSON.parse(raw) as { latitude: number; longitude: number; mosque: MosqueRow };
        const km = Math.hypot((saved.latitude - context.location.latitude) * 111, (saved.longitude - context.location.longitude) * 82);
        if (km <= 2 && saved.mosque && saved.mosque.name && Number.isFinite(saved.mosque.distanceKm)) {
          setNearestMosque(current => current || saved.mosque);
        }
      } catch {}
    }).catch(() => {});''', 1)
success = '''        setNearestMosque(rows[0] || null);
        setNearestMosqueState(rows.length ? "idle" : "empty");'''
if home.count(success) != 1:
    raise SystemExit("Missing nearest mosque success callback")
replacement = '''        if (rows.length) {
          const closest = rows[0];
          setNearestMosque(closest);
          setNearestMosqueState("idle");
          void AsyncStorage.setItem("hassoun:nearest-mosque:last-good", JSON.stringify({
            latitude: context.location.latitude, longitude: context.location.longitude,
            mosque: closest
          })).catch(() => {});
        } else {
          setNearestMosqueState("empty");
        }'''
home = home.replace(success, replacement, 1)
home_file.write_text(home, encoding="utf-8")

for item in ["HASSOUN_NEAREST_MOSQUE_AUTO_V1045", "WINDSOR_TRUSTED_MOSQUES"]:
    if item not in mosques:
        raise SystemExit("Nearest mosque production verification failed")
print("HASSOUN_NEAREST_MOSQUE_AUTOLOAD_VERIFIED")
