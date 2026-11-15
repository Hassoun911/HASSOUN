import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(now);
  const get = (type: string) => parts.find(part => part.type === type)?.value || "";
  const currentMonth = `${get("year")}-${get("month")}`;
  const windsorDate = `${currentMonth}-${get("day")}`;
  return NextResponse.json({ currentMonth, windsorDate, serverTimeUtc: now.toISOString(), timezone: "America/Toronto" }, {
    headers: { "Cache-Control": "private, no-store, no-cache, must-revalidate, max-age=0" }
  });
}
