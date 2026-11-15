import PrayerScheduleClient from "./PrayerScheduleClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function PrayerSchedulePage() {
  // Render the actual Windsor calendar date on the server on every request.
  // Avoid static prerendering or browser/local clock values for the CURRENT badge.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date());
  const part = (type: string) => parts.find(item => item.type === type)?.value || "";
  const currentMonth = `${part("year")}-${part("month")}`;
  const windsorDate = `${currentMonth}-${part("day")}`;
  return <PrayerScheduleClient initialMonth={currentMonth} initialWindsorDate={windsorDate} />;
}
