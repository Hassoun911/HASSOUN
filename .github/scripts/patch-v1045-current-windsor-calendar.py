#!/usr/bin/env python3
"""Add weekly/monthly schedule to the approved v1.0.44 HomePrayerPage only.

This runs AFTER the protected release reconstruction and v1.0.44 GPS patches.
It intentionally does not replace the current Home layout, icons, audio code,
notification scheduling, preferences, or the official Windsor data loader.
"""
from pathlib import Path

home_path = Path("mobile/src/HomePrayerPage.tsx")
text = home_path.read_text(encoding="utf-8")
if "HASSOUN_RELEASE_WEEK_MONTH_V1045" in text:
    raise SystemExit("Weekly/monthly schedule patch already applied")
def replace_once(old, new):
    global text
    if text.count(old) != 1:
        raise SystemExit(f"Release source mismatch; expected one anchor, found {text.count(old)}: {old[:90]!r}")
    text = text.replace(old, new, 1)

replace_once(
    "  Image,\n  Pressable,",
    "  Image,\n  Modal,\n  Pressable,",
)

replace_once(
    '  const [email, setEmail] = useState("");',
    '''  // HASSOUN_RELEASE_WEEK_MONTH_V1045
  const [scheduleMode, setScheduleMode] = useState<"week" | "month" | null>(null);
  const [scheduleOffset, setScheduleOffset] = useState(0);
  // Date-only keys are deliberately calculated in UTC, avoiding a Windsor
  // timezone shift on the first of the month.
  const scheduleDays = useMemo(() => {
    if (!scheduleMode) return [] as string[];
    const [y, m, d] = todayKey.split("-").map(Number);
    const base = new Date(Date.UTC(y, m - 1, d, 12));
    if (scheduleMode === "week") {
      const weekday = (base.getUTCDay() + 6) % 7;
      base.setUTCDate(base.getUTCDate() - weekday + scheduleOffset * 7);
    } else {
      base.setUTCDate(1);
      base.setUTCMonth(base.getUTCMonth() + scheduleOffset);
    }
    const count = scheduleMode === "week" ? 7 : new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
    return Array.from({ length: count }, (_, index) => {
      const day = new Date(base.getTime());
      day.setUTCDate(base.getUTCDate() + index);
      return [day.getUTCFullYear(), String(day.getUTCMonth() + 1).padStart(2, "0"), String(day.getUTCDate()).padStart(2, "0")].join("-");
    });
  }, [scheduleMode, scheduleOffset, todayKey]);

  const [email, setEmail] = useState("");''',
)

replace_once(
    '''      <Pressable onPress={onOpenQibla} style={styles.qiblaCard}>''',
    '''      <View style={scheduleStyles.buttons}>
        <Pressable accessibilityRole="button" onPress={() => { setScheduleOffset(0); setScheduleMode("week"); }} style={scheduleStyles.button}>
          <Text style={scheduleStyles.buttonText}>{locale === "ar" ? "عرض الأسبوع" : "Show Weekly"}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => { setScheduleOffset(0); setScheduleMode("month"); }} style={scheduleStyles.button}>
          <Text style={scheduleStyles.buttonText}>{locale === "ar" ? "عرض الشهر" : "Show Monthly"}</Text>
        </Pressable>
      </View>
      <Modal visible={scheduleMode !== null} animationType="slide" transparent onRequestClose={() => setScheduleMode(null)}>
        <View style={scheduleStyles.backdrop}>
          <View style={scheduleStyles.sheet}>
            <View style={scheduleStyles.top}>
              <Text style={scheduleStyles.heading}>{locale === "ar" ? "مواقيت الصلاة" : "Prayer Schedule"}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Close schedule" onPress={() => setScheduleMode(null)}>
                <Text style={scheduleStyles.close}>×</Text>
              </Pressable>
            </View>
            <View style={scheduleStyles.buttons}>
              <Pressable accessibilityRole="button" onPress={() => { setScheduleMode("week"); setScheduleOffset(0); }} style={scheduleStyles.button}>
                <Text style={scheduleStyles.buttonText}>{locale === "ar" ? "الأسبوع" : "Weekly"}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => { setScheduleMode("month"); setScheduleOffset(0); }} style={scheduleStyles.button}>
                <Text style={scheduleStyles.buttonText}>{locale === "ar" ? "الشهر" : "Monthly"}</Text>
              </Pressable>
            </View>
            <View style={scheduleStyles.periodBar}>
              <Pressable accessibilityLabel="Previous period" onPress={() => setScheduleOffset(x => x - 1)}><Text style={scheduleStyles.arrow}>‹</Text></Pressable>
              <Text style={scheduleStyles.period}>{scheduleDays.length ? scheduleDays[0] + " – " + scheduleDays[scheduleDays.length - 1] : ""}</Text>
              <Pressable accessibilityLabel="Next period" onPress={() => setScheduleOffset(x => x + 1)}><Text style={scheduleStyles.arrow}>›</Text></Pressable>
            </View>
            <ScrollView style={scheduleStyles.list} contentContainerStyle={scheduleStyles.listContent}>
              {scheduleDays.map(date => (
                <View key={date} style={scheduleStyles.day}>
                  <Text style={scheduleStyles.date}>{date}{date === todayKey ? " • Today" : ""}</Text>
                  <View style={scheduleStyles.prayerRow}>
                    {PRAYER_KEYS.map(prayer => (
                      <View key={prayer} style={scheduleStyles.prayerColumn}>
                        <Text style={scheduleStyles.prayerName}>{NAMES[prayer][locale]}</Text>
                        <Text style={scheduleStyles.prayerTime}>{context?.prayerTimes[date]?.[prayer] ? formatPrayerTime(context.prayerTimes[date][prayer], locale) : "—"}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ))}
              <Text style={scheduleStyles.note}>{locale === "ar" ? "— يعني عدم توفر بيانات لهذا اليوم." : "— means prayer times are not yet available for this date."}</Text>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Pressable onPress={onOpenQibla} style={styles.qiblaCard}>''',
)

text += '''
// Full-height sheet keeps the v1.0.44 home layout unchanged when closed.
const scheduleStyles = StyleSheet.create({
  buttons: { flexDirection: "row", gap: 10, marginTop: 12, marginBottom: 10 },
  button: { flex: 1, paddingVertical: 12, borderRadius: 13, backgroundColor: "#e9f4ec", borderWidth: 1, borderColor: "#a7c8b8", alignItems: "center" },
  buttonText: { fontSize: 13, fontWeight: "800", color: "#075f4a" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.52)", justifyContent: "flex-end" },
  sheet: { height: "88%", borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 17, backgroundColor: "#fffdf8" },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  heading: { fontSize: 20, fontWeight: "900", color: "#034b3d" },
  close: { fontSize: 30, color: "#034b3d", paddingHorizontal: 8 },
  periodBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginVertical: 6 },
  arrow: { fontSize: 30, fontWeight: "700", color: "#075f4a", paddingHorizontal: 16 },
  period: { flex: 1, textAlign: "center", fontSize: 12, fontWeight: "800", color: "#034b3d" },
  list: { flex: 1 },
  listContent: { paddingBottom: 28 },
  day: { borderWidth: 1, borderRadius: 12, borderColor: "#e0e9e4", padding: 12, backgroundColor: "#fff", marginBottom: 8 },
  date: { fontSize: 13, fontWeight: "900", color: "#075f4a", marginBottom: 8 },
  prayerRow: { flexDirection: "row", gap: 3 },
  prayerColumn: { flex: 1, minWidth: 0, alignItems: "center" },
  prayerName: { fontSize: 10, fontWeight: "700", color: "#60796b" },
  prayerTime: { fontSize: 11, fontWeight: "800", color: "#173f35", marginTop: 5 },
  note: { textAlign: "center", fontSize: 11, color: "#7b8984", paddingVertical: 12 }
});
'''
home_path.write_text(text, encoding="utf-8")

prayer = Path("mobile/src/prayerData.ts").read_text(encoding="utf-8")
must_have = [
    "Hassoun911/HASSOUN/main/windsor_islamic_association_2026_prayer_times.json",
    "fetchOfficialWindsorSchedule",
    "WINDSOR_RADIUS_KM = 35",
]
for item in must_have:
    if item not in prayer:
        raise SystemExit(f"Unsafe release: expected live Windsor schedule invariant missing: {item}")
if "HASSOUN_RELEASE_WEEK_MONTH_V1045" not in text or "Show Monthly" not in text:
    raise SystemExit("Week/month UI patch verification failed")
print("HASSOUN_V1045_SCHEDULE_UI_AND_LIVE_WINDSOR_SOURCE_VERIFIED")
