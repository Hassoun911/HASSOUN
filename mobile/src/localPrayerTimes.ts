import { loadPrayerTimes } from "./prayerData";
import type { PrayerTimes } from "./types";

export type LocationPrayerContext = {
  prayerTimes: PrayerTimes;
  live: boolean;
  locationLabel: string;
  timezone: string;
  sourceLabel: string;
};

// Adapt the existing GPS-aware prayer data loader to the Home screen's
// presentation shape. This shares the canonical Windsor schedule and preserves
// the established Android alarm/audio implementation untouched.
export async function loadLocationPrayerContext(force = false): Promise<LocationPrayerContext> {
  const result = await loadPrayerTimes({ forceLocation: force });
  return {
    prayerTimes: result.prayerTimes,
    live: result.live,
    locationLabel: result.location.label,
    timezone: result.location.timezone,
    sourceLabel: result.location.source === "windsor_islamic_association"
      ? "Windsor published prayer timetable"
      : result.location.source === "local_calculation"
        ? "Calculated for your location"
        : result.location.label
  };
}
