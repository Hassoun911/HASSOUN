import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { PrayerAlertPreferences } from "./alertPreferences";
import { formatPrayerTime } from "./time";
import { PRAYER_KEYS, type PrayerDay, type PrayerKey, type PrayerTimes } from "./types";

type Locale = "en" | "ar";

type NextPrayer = {
  prayer: PrayerKey;
  time: string;
  secondsRemaining: number;
  isTomorrow: boolean;
};

type Props = {
  locale: Locale;
  today?: PrayerDay;
  todayKey: string;
  prayerTimes: PrayerTimes;
  next: NextPrayer | null;
  preferences: PrayerAlertPreferences;
  onTogglePrayer: (prayer: PrayerKey) => void;
  onOpenQibla: () => void;
};

const NAMES: Record<PrayerKey, { en: string; ar: string }> = {
  fajr: { en: "Fajr", ar: "الفجر" },
  dhuhr: { en: "Dhuhr", ar: "الظهر" },
  asr: { en: "Asr", ar: "العصر" },
  maghrib: { en: "Maghrib", ar: "المغرب" },
  isha: { en: "Isha", ar: "العشاء" }
};

// Monochrome icon-style symbols intentionally avoid the colorful platform emoji
// that made the original prayer cards look inconsistent.
const GLYPHS: Record<PrayerKey, string> = {
  fajr: "◒",
  dhuhr: "☀︎",
  asr: "◐",
  maghrib: "◓",
  isha: "☾"
};

function timeParts(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return {
    hours: String(hours).padStart(2, "0"),
    minutes: String(minutes).padStart(2, "0"),
    seconds: String(secs).padStart(2, "0")
  };
}

function PrayerMark({ prayer, active }: { prayer: PrayerKey; active: boolean }) {
  return (
    <View style={[styles.markShell, active && styles.markShellActive]}>
      <Text style={[styles.markGlyph, active && styles.markGlyphActive]}>{GLYPHS[prayer]}</Text>
      <View style={[styles.markHorizon, active && styles.markHorizonActive]} />
    </View>
  );
}

export default function HomePrayerPanel({ locale, today, todayKey, prayerTimes, next, preferences, onTogglePrayer, onOpenQibla }: Props) {
  const [scheduleMode, setScheduleMode] = useState<"week" | "month" | null>(null);
  const [periodOffset, setPeriodOffset] = useState(0);
  const scheduleDays = scheduleMode ? (() => {
    const base = new Date(todayKey + "T12:00:00Z");
    if (scheduleMode === "week") base.setUTCDate(base.getUTCDate() + periodOffset * 7);
    else { base.setUTCDate(1); base.setUTCMonth(base.getUTCMonth() + periodOffset); }
    const count = scheduleMode === "week" ? 7 : new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
    return Array.from({ length: count }, (_, i) => {
      const day = new Date(base); day.setUTCDate(day.getUTCDate() + i);
      return { key: day.toISOString().slice(0, 10), date: day.toLocaleDateString(locale === "ar" ? "ar" : "en-CA", { month: "short", day: "numeric", weekday: "short", timeZone: "UTC" }) };
    });
  })() : [];

  const countdown = next ? timeParts(next.secondsRemaining) : null;

  return (
    <>
      {next ? (
        <View style={styles.hero}>
          <View style={styles.heroGlowOne} />
          <View style={styles.heroGlowTwo} />
          <View style={styles.heroTop}>
            <View style={styles.heroPrayerBlock}>
              <Text style={styles.eyebrow}>{locale === "ar" ? "الصلاة القادمة" : "NEXT PRAYER"}</Text>
              <View style={styles.heroNameRow}>
                <Text style={styles.heroArabic}>{NAMES[next.prayer].ar}</Text>
                <Text style={styles.heroEnglish}>{NAMES[next.prayer].en}</Text>
              </View>
              <Text style={styles.heroTime}>{formatPrayerTime(next.time, locale)}</Text>
              {next.isTomorrow ? <Text style={styles.tomorrow}>{locale === "ar" ? "غداً" : "Tomorrow"}</Text> : null}
            </View>

            <View style={styles.countdownCard}>
              <View style={styles.countdownTitleRow}>
                <Text style={styles.countdownHourglass}>⌛</Text>
                <Text style={styles.countdownTitle}>{locale === "ar" ? "الوقت المتبقي" : "TIME LEFT"}</Text>
              </View>
              <View style={styles.countdownValues}>
                <View style={styles.countdownUnit}>
                  <Text style={styles.countdownNumber}>{countdown?.hours}</Text>
                  <Text style={styles.countdownUnitLabel}>{locale === "ar" ? "س" : "HRS"}</Text>
                </View>
                <Text style={styles.colon}>:</Text>
                <View style={styles.countdownUnit}>
                  <Text style={styles.countdownNumber}>{countdown?.minutes}</Text>
                  <Text style={styles.countdownUnitLabel}>{locale === "ar" ? "د" : "MIN"}</Text>
                </View>
                <Text style={styles.colon}>:</Text>
                <View style={styles.countdownUnit}>
                  <Text style={styles.countdownNumber}>{countdown?.seconds}</Text>
                  <Text style={styles.countdownUnitLabel}>{locale === "ar" ? "ث" : "SEC"}</Text>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.heroDivider} />
          <View style={styles.heroFooter}>
            <View style={styles.heroFooterIcon}><Text style={styles.heroFooterIconText}>☾</Text></View>
            <Text style={styles.heroFooterText}>{locale === "ar" ? "جهّز قلبك للصلاة القادمة" : "Prepare for the next prayer"}</Text>
          </View>
        </View>
      ) : null}


      <Modal transparent animationType="slide" visible={scheduleMode !== null} onRequestClose={() => setScheduleMode(null)}>
        <View style={calendarStyles.backdrop}>
          <View style={calendarStyles.sheet}>
            <View style={calendarStyles.top}>
              <Text style={calendarStyles.title}>{locale === "ar" ? "مواقيت الصلاة" : "Prayer Schedule"}</Text>
              <Pressable onPress={() => setScheduleMode(null)} accessibilityRole="button" accessibilityLabel="Close schedule"><Text style={calendarStyles.close}>×</Text></Pressable>
            </View>
            <View style={calendarStyles.row}>
              <Pressable onPress={() => { setScheduleMode("week"); setPeriodOffset(0); }} style={calendarStyles.button}><Text style={calendarStyles.buttonText}>{locale === "ar" ? "الأسبوع" : "Weekly"}</Text></Pressable>
              <Pressable onPress={() => { setScheduleMode("month"); setPeriodOffset(0); }} style={calendarStyles.button}><Text style={calendarStyles.buttonText}>{locale === "ar" ? "الشهر" : "Monthly"}</Text></Pressable>
            </View>
            <View style={calendarStyles.row}>
              <Pressable onPress={() => setPeriodOffset(x => x - 1)} accessibilityLabel="Previous period"><Text style={calendarStyles.arrow}>‹</Text></Pressable>
              <Text style={calendarStyles.period}>{scheduleDays.length ? scheduleDays[0].date + " – " + scheduleDays[scheduleDays.length - 1].date : ""}</Text>
              <Pressable onPress={() => setPeriodOffset(x => x + 1)} accessibilityLabel="Next period"><Text style={calendarStyles.arrow}>›</Text></Pressable>
            </View>
            <ScrollView style={{ flex: 1 }}>
              {scheduleDays.map(item => (
                <View key={item.key} style={calendarStyles.day}>
                  <Text style={calendarStyles.date}>{item.date}{item.key === todayKey ? " • Today" : ""}</Text>
                  <View style={calendarStyles.row}>
                    {PRAYER_KEYS.map(prayer => <View key={prayer} style={{ flex: 1, alignItems: "center" }}>
                      <Text style={calendarStyles.prayer}>{NAMES[prayer][locale]}</Text>
                      <Text style={calendarStyles.time}>{prayerTimes[item.key]?.[prayer] ? formatPrayerTime(prayerTimes[item.key][prayer], locale) : "—"}</Text>
                    </View>)}
                  </View>
                </View>
              ))}
              <Text style={calendarStyles.note}>{locale === "ar" ? "— يعني عدم توفر بيانات هذا اليوم." : "— means the day's schedule is unavailable."}</Text>
            </ScrollView>
          </View>
        </View>
      </Modal>
      <View style={styles.headingRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.heading}>{locale === "ar" ? "مواقيت الصلاة اليوم" : "Today’s Prayer Times"}</Text>
          <View style={calendarStyles.openRow}>
            <Pressable accessibilityRole="button" onPress={() => { setScheduleMode("week"); setPeriodOffset(0); }} style={calendarStyles.button}><Text style={calendarStyles.buttonText}>{locale === "ar" ? "عرض الأسبوع" : "Show Weekly"}</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={() => { setScheduleMode("month"); setPeriodOffset(0); }} style={calendarStyles.button}><Text style={calendarStyles.buttonText}>{locale === "ar" ? "عرض الشهر" : "Show Monthly"}</Text></Pressable>
          </View>
          <Text style={styles.hint}>{locale === "ar" ? "يمكنك كتم أو تشغيل أذان كل صلاة بشكل مستقل" : "Mute or unmute the Adhan for each prayer separately"}</Text>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cardsRow}>
        {today ? PRAYER_KEYS.map((prayer) => {
          const active = next?.prayer === prayer && !next.isTomorrow;
          const muted = !preferences[prayer].athan;
          return (
            <View key={prayer} style={[styles.prayerCard, active && styles.prayerCardActive]}>
              {active ? <View style={styles.activeBadge}><Text style={styles.activeBadgeText}>{locale === "ar" ? "القادمة" : "NEXT"}</Text></View> : null}
              <PrayerMark prayer={prayer} active={active} />
              <Text style={[styles.prayerArabic, active && styles.activeText]}>{NAMES[prayer].ar}</Text>
              <Text style={[styles.prayerEnglish, active && styles.activeSubText]}>{NAMES[prayer].en}</Text>
              <Text style={[styles.prayerTime, active && styles.activeText]}>{formatPrayerTime(today[prayer], locale)}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${NAMES[prayer].en} ${muted ? "Adhan muted" : "Adhan on"}`}
                onPress={() => onTogglePrayer(prayer)}
                style={({ pressed }) => [styles.audioButton, muted ? styles.audioButtonMuted : styles.audioButtonOn, pressed && styles.pressed]}
              >
                <Text style={[styles.audioSymbol, muted && styles.audioSymbolMuted]}>{muted ? "×" : "♪"}</Text>
                <Text style={[styles.audioText, muted && styles.audioTextMuted]}>{muted ? (locale === "ar" ? "مكتوم" : "MUTED") : (locale === "ar" ? "الأذان" : "ADHAN")}</Text>
              </Pressable>
            </View>
          );
        }) : <Text style={styles.empty}>{locale === "ar" ? "لا يوجد جدول صلاة متاح اليوم." : "No prayer schedule is available today."}</Text>}
      </ScrollView>

      <Pressable onPress={onOpenQibla} style={({ pressed }) => [styles.qiblaCard, pressed && styles.pressed]}>
        <View style={styles.qiblaIconShell}>
          <Text style={styles.qiblaIcon}>🕋</Text>
          <View style={styles.qiblaCompassRing} />
        </View>
        <View style={styles.qiblaCopy}>
          <Text style={styles.qiblaEyebrow}>{locale === "ar" ? "اتجاه القبلة" : "QIBLA DIRECTION"}</Text>
          <Text style={styles.qiblaTitle}>{locale === "ar" ? "افتح بوصلة القبلة" : "Open the Qibla compass"}</Text>
          <Text style={styles.qiblaText}>{locale === "ar" ? "اتجاه القبلة من وندسور نحو مكة" : "Qibla bearing from Windsor toward Makkah"}</Text>
        </View>
        <View style={styles.qiblaBearing}>
          <Text style={styles.qiblaBearingValue}>52°</Text>
          <Text style={styles.qiblaBearingDir}>NE</Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </Pressable>
    </>
  );
}

const gold = "#d7b45e";
const green = "#075f4a";
const deepGreen = "#034b3d";

const styles = StyleSheet.create({
  hero: {
    marginTop: 14,
    borderRadius: 28,
    backgroundColor: green,
    padding: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#b99a4f",
    shadowColor: "#073e34",
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 5
  },
  heroGlowOne: { position: "absolute", width: 190, height: 190, borderRadius: 95, backgroundColor: "rgba(215,180,94,0.07)", right: -65, top: -80 },
  heroGlowTwo: { position: "absolute", width: 140, height: 140, borderRadius: 70, backgroundColor: "rgba(255,255,255,0.035)", left: -60, bottom: -75 },
  heroTop: { flexDirection: "row", gap: 13, alignItems: "stretch" },
  heroPrayerBlock: { flex: 1, minWidth: 0 },
  eyebrow: { color: "#e3c779", fontSize: 9, fontWeight: "900", letterSpacing: 1.8 },
  heroNameRow: { flexDirection: "row", alignItems: "baseline", gap: 7, marginTop: 6, flexWrap: "wrap" },
  heroArabic: { color: "#ffffff", fontSize: 34, fontWeight: "900" },
  heroEnglish: { color: "#e5c979", fontSize: 15, fontWeight: "800" },
  heroTime: { color: "#ffffff", fontSize: 29, lineHeight: 34, fontWeight: "900", marginTop: 5 },
  tomorrow: { alignSelf: "flex-start", marginTop: 5, color: "#f2ddb0", backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3, fontSize: 9, fontWeight: "900", overflow: "hidden" },
  countdownCard: { width: 166, minHeight: 124, borderRadius: 22, backgroundColor: "rgba(2,55,45,0.56)", borderWidth: 1, borderColor: "rgba(225,195,113,0.58)", paddingHorizontal: 12, paddingVertical: 12, justifyContent: "center" },
  countdownTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, marginBottom: 8 },
  countdownHourglass: { color: "#e8ca77", fontSize: 15 },
  countdownTitle: { color: "#e8ca77", fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  countdownValues: { flexDirection: "row", alignItems: "flex-start", justifyContent: "center" },
  countdownUnit: { minWidth: 37, alignItems: "center" },
  countdownNumber: { color: "#fff", fontSize: 23, fontWeight: "900", fontVariant: ["tabular-nums"] },
  countdownUnitLabel: { color: "#b9d2ca", fontSize: 7.5, fontWeight: "800", marginTop: 2 },
  colon: { color: "#e8ca77", fontSize: 21, fontWeight: "900", marginHorizontal: 1 },
  heroDivider: { height: 1, backgroundColor: "rgba(224,194,112,0.28)", marginTop: 15 },
  heroFooter: { flexDirection: "row", alignItems: "center", marginTop: 10, gap: 7 },
  heroFooterIcon: { width: 24, height: 24, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" },
  heroFooterIconText: { color: "#e8ca77", fontSize: 14 },
  heroFooterText: { color: "#d7e6e1", fontSize: 10, fontWeight: "700" },
  headingRow: { flexDirection: "row", alignItems: "flex-end", marginTop: 22, marginBottom: 10 },
  heading: { color: "#173f35", fontSize: 19, fontWeight: "900" },
  hint: { color: "#7b8984", fontSize: 9, marginTop: 3, lineHeight: 13 },
  cardsRow: { gap: 9, paddingRight: 18, paddingBottom: 3 },
  prayerCard: { width: 118, minHeight: 202, borderRadius: 22, backgroundColor: "#fffdf8", borderWidth: 1, borderColor: "#ded9ce", paddingHorizontal: 10, paddingTop: 13, paddingBottom: 10, alignItems: "center", justifyContent: "flex-start" },
  prayerCardActive: { backgroundColor: deepGreen, borderColor: gold, borderWidth: 1.5 },
  activeBadge: { position: "absolute", top: 8, right: 8, borderRadius: 99, backgroundColor: gold, paddingHorizontal: 6, paddingVertical: 2, zIndex: 2 },
  activeBadgeText: { color: deepGreen, fontSize: 6.5, fontWeight: "900", letterSpacing: .7 },
  markShell: { width: 52, height: 52, borderRadius: 18, backgroundColor: "#edf3ef", alignItems: "center", justifyContent: "center", marginBottom: 7 },
  markShellActive: { backgroundColor: "rgba(225,194,112,0.13)", borderWidth: 1, borderColor: "rgba(225,194,112,0.52)" },
  markGlyph: { color: "#a77f2d", fontSize: 29, fontWeight: "400", lineHeight: 32 },
  markGlyphActive: { color: "#f1d689" },
  markHorizon: { width: 28, height: 2, borderRadius: 1, backgroundColor: "#9f813e", marginTop: -3 },
  markHorizonActive: { backgroundColor: "#f1d689" },
  prayerArabic: { color: "#183f35", fontSize: 16, fontWeight: "900", textAlign: "center" },
  prayerEnglish: { color: "#78857f", fontSize: 10, fontWeight: "700", marginTop: 1 },
  prayerTime: { color: "#123e34", fontSize: 14, fontWeight: "900", marginTop: 8 },
  activeText: { color: "#ffffff" },
  activeSubText: { color: "#c7ddd5" },
  audioButton: { marginTop: "auto", minWidth: 88, minHeight: 31, borderRadius: 99, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingHorizontal: 8 },
  audioButtonOn: { backgroundColor: "#e6f2ed", borderWidth: 1, borderColor: "#c7ded5" },
  audioButtonMuted: { backgroundColor: "#f0ebe2", borderWidth: 1, borderColor: "#dfd4c4" },
  audioSymbol: { color: deepGreen, fontSize: 16, fontWeight: "900" },
  audioSymbolMuted: { color: "#8f7b67" },
  audioText: { color: deepGreen, fontSize: 7, fontWeight: "900", letterSpacing: .5 },
  audioTextMuted: { color: "#8f7b67" },
  pressed: { opacity: 0.7, transform: [{ scale: 0.985 }] },
  empty: { color: "#74817c", paddingVertical: 18 },
  qiblaCard: { minHeight: 92, marginTop: 14, borderRadius: 23, backgroundColor: "#fffdf8", borderWidth: 1, borderColor: "#d9d1c0", flexDirection: "row", alignItems: "center", padding: 12, gap: 10 },
  qiblaIconShell: { width: 58, height: 58, borderRadius: 20, backgroundColor: deepGreen, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  qiblaIcon: { fontSize: 28, zIndex: 2 },
  qiblaCompassRing: { position: "absolute", width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: "rgba(232,202,119,0.52)" },
  qiblaCopy: { flex: 1 },
  qiblaEyebrow: { color: "#a07a30", fontSize: 7.5, fontWeight: "900", letterSpacing: 1.2 },
  qiblaTitle: { color: "#173f35", fontSize: 14, fontWeight: "900", marginTop: 2 },
  qiblaText: { color: "#7c8883", fontSize: 8.5, lineHeight: 12, marginTop: 2 },
  qiblaBearing: { alignItems: "center", minWidth: 39 },
  qiblaBearingValue: { color: "#9d772e", fontSize: 15, fontWeight: "900" },
  qiblaBearingDir: { color: "#8b958f", fontSize: 7.5, fontWeight: "800" },
  chevron: { color: deepGreen, fontSize: 28, marginLeft: -2 }
});

const calendarStyles = StyleSheet.create({
  openRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  button: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: "#a7c8b8", backgroundColor: "#eaf5ee" },
  buttonText: { fontSize: 12, fontWeight: "800", color: "#075f4a" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { height: "87%", backgroundColor: "#fffdf8", padding: 17, borderTopLeftRadius: 22, borderTopRightRadius: 22 },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 20, fontWeight: "900", color: "#034b3d" },
  close: { fontSize: 28, color: "#034b3d" },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 7, marginVertical: 9 },
  arrow: { fontSize: 28, color: "#075f4a", paddingHorizontal: 16 },
  period: { fontSize: 12, fontWeight: "800", color: "#034b3d", textAlign: "center", flex: 1 },
  day: { padding: 12, borderWidth: 1, borderColor: "#e0e9e4", borderRadius: 12, backgroundColor: "#fff", marginBottom: 7 },
  date: { color: "#075f4a", fontWeight: "900", marginBottom: 5 },
  prayer: { fontSize: 10, color: "#60796b", fontWeight: "700" },
  time: { fontSize: 10, color: "#173f35", fontWeight: "800", textAlign: "center", marginTop: 4 },
  note: { textAlign: "center", color: "#7b8984", fontSize: 11, padding: 12 }
});
