import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { useKeepAwake } from "expo-keep-awake";
import * as NavigationBar from "expo-navigation-bar";
import * as ScreenOrientation from "expo-screen-orientation";
import { useVideoPlayer, VideoView } from "expo-video";
import { WebView } from "react-native-webview";
import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { Alert, Animated, AppState, ActivityIndicator, Image, Modal, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { loadInitialPrayerTimes, loadPrayerTimes, type PrayerLocation } from "./prayerData";
import { schedulePrayerNotifications } from "./notifications";
import { scheduleAndroidPrayerAudio } from "./prayerAudio";
import { openExactAlarmSettings } from "./prayerAudio";
import { loadPhonePrayerAlertPreferences, savePhonePrayerAlertPreferences, type PrayerAlertPreferences } from "./alertPreferences";
import { PRAYER_KEYS, type PrayerDay, type PrayerTimes } from "./types";

type Props = { locale: "en" | "ar"; onBack: () => void };
type PrayerKey = keyof PrayerDay;
type Device = { id: string; code: string; secret: string; name: string };

type PrayerMeta = { key: PrayerKey; en: string; ar: string; icon: string };

const API = "https://wopt-prayer-push.wopt-windsor.workers.dev";
const SETTINGS_KEY = "hassoun:native-wall-display:v4";
const DEVICE_KEY = "hassoun:native-wall-display-device:v2";
const DISPLAY_MARKER = "HASSOUN_NATIVE_TABLET_GRAND_V1";

const PRAYERS: PrayerMeta[] = [
  { key: "fajr", en: "Fajr", ar: "الفجر", icon: "☾" },
  { key: "dhuhr", en: "Dhuhr", ar: "الظهر", icon: "☀" },
  { key: "asr", en: "Asr", ar: "العصر", icon: "◉" },
  { key: "maghrib", en: "Maghrib", ar: "المغرب", icon: "◒" },
  { key: "isha", en: "Isha", ar: "العشاء", icon: "☽" },
];

const CLASSIC = {
  pageA: "#fbfaf6",
  pageB: "#f3f0e8",
  clock: "#8f2434",
  meta: "#243b36",
  cardA: "#075d52",
  cardB: "#006b5d",
  gold: "#edc268",
  white: "#fffdf7",
  muted: "#d9d2c6",
  mini: "#faf8fb",
  miniText: "#233732",
  nextA: "#0c6c5d",
  nextB: "#075449",
};

const rand = () => Math.random().toString(36).slice(2, 10);
const makeDevice = (): Device => ({
  id: `${Date.now().toString(36)}${rand()}${rand()}`,
  code: String(Math.floor(100000 + Math.random() * 900000)),
  secret: `${rand()}${rand()}${rand()}${rand()}`,
  name: "Hassoun Native Tablet Display",
});

function dateKey(d: Date, z: string) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: z, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const g = (x: string) => p.find(q => q.type === x)?.value || "";
  return `${g("year")}-${g("month")}-${g("day")}`;
}

function minutes(v?: string) {
  const m = String(v || "").match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function nowMinutes(d: Date, z: string) {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: z, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
  return Number(p.find(x => x.type === "hour")?.value || 0) * 60 + Number(p.find(x => x.type === "minute")?.value || 0);
}

function prayerParts(v?: string) {
  const m = String(v || "").match(/^(\d{1,2}):(\d{2})/);
  if (!m) return { main: "--:--", period: "" };
  const h = Number(m[1]);
  return { main: `${h % 12 || 12}:${m[2]}`, period: h >= 12 ? "p.m." : "a.m." };
}

function zonedParts(d: Date, z: string) {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: z, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).formatToParts(d);
  const n = (t: string) => Number(p.find(x => x.type === t)?.value || 0);
  return { year: n("year"), month: n("month"), day: n("day"), hour: n("hour"), minute: n("minute"), second: n("second") };
}

function secondsUntilPrayer(now: Date, timezone: string, hhmm?: string) {
  const m = String(hhmm || "").match(/^(\d{1,2}):(\d{2})/);
  if (!m) return 0;
  const z = zonedParts(now, timezone);
  const targetMinutes = Number(m[1]) * 60 + Number(m[2]);
  const currentSeconds = z.hour * 3600 + z.minute * 60 + z.second;
  let targetSeconds = targetMinutes * 60;
  if (targetSeconds <= currentSeconds) targetSeconds += 24 * 3600;
  return Math.max(0, targetSeconds - currentSeconds);
}

function youtubeVideoId(raw: string) {
  const value = String(raw || "").trim();
  if (!value) return "";
  const patterns = [
    /(?:youtube\.com\/watch\?[^#]*v=)([A-Za-z0-9_-]{11})/,
    /(?:youtu\.be\/)([A-Za-z0-9_-]{11})/,
    /(?:youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/,
    /(?:youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match?.[1]) return match[1];
  }
  return "";
}

function humanLeft(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m left`;
  return `${Math.max(1, m)}m left`;
}

const LAYOUT_BACKUP_KEY = "hassoun:tablet-layout-backup:v3"; // HASSOUN_TABLET_LAYOUT_PERSIST_V3

export default function MasjidDisplayPage({ locale, onBack }: Props) {
  useKeepAwake();
  // HASSOUN_TABLET_IMMERSIVE_FULLSCREEN_V1
  const enterTabletImmersive = useCallback(() => {
    StatusBar.setHidden(true, "none");
    if (Platform.OS === "android") {
      void NavigationBar.setVisibilityAsync("hidden").catch(() => undefined);
      const navAny = NavigationBar as any;
      if (typeof navAny.setPositionAsync === "function") void navAny.setPositionAsync("absolute").catch(() => undefined);
    }
  }, []);

  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  const ar = locale === "ar";
  const t = (en: string, a: string) => ar ? a : en;

  const [now, setNow] = useState(new Date());
  const [times, setTimes] = useState<PrayerTimes>({});
  const [location, setLocation] = useState<PrayerLocation>({ latitude: 42.3149, longitude: -83.0364, timezone: "America/Toronto", label: "Current location", source: "saved" });
  const [loading, setLoading] = useState(true);
  const [setup, setSetup] = useState(false);
  const [device, setDevice] = useState<Device | null>(null);
  const [paired, setPaired] = useState(false);
  const [slide, setSlide] = useState(0);
  const [slideSeconds, setSlideSeconds] = useState(8);
  const [tabletPrayerRuntimeStatus, setTabletPrayerRuntimeStatus] = useState("arming");
  const [tabletPrayerPrefs, setTabletPrayerPrefs] = useState<PrayerAlertPreferences | null>(null);
  const exactAlarmTabletPromptRef = useRef(false);
  const beatAnim = useRef(new Animated.Value(1)).current;
  const [remoteTheme, setRemoteTheme] = useState<Record<string, any>>({ fitFullScreen: true, mainCardScale: 1, lowerCardScale: 1 });
  const tabletLayoutBackupReadyRef = useRef(false);

  // HASSOUN_TABLET_LAYOUT_RESTORE_EFFECT_V3
  useEffect(() => {
    enterTabletImmersive();
    const t1 = setTimeout(enterTabletImmersive, 120);
    const t2 = setTimeout(enterTabletImmersive, 500);
    const t3 = setTimeout(enterTabletImmersive, 1500);
    const keepHidden = setInterval(enterTabletImmersive, 1800);
    const sub = AppState.addEventListener("change", state => { if (state === "active") enterTabletImmersive(); });
    return () => {
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearInterval(keepHidden); sub.remove();
      StatusBar.setHidden(false, "none");
      if (Platform.OS === "android") void NavigationBar.setVisibilityAsync("visible").catch(() => undefined);
    };
  }, [enterTabletImmersive]);

  useEffect(() => {
    let alive = true;
    void AsyncStorage.getItem(LAYOUT_BACKUP_KEY).then(raw => {
      if (!alive) return;
      if (raw) {
        try {
          const backupTheme = JSON.parse(raw) as Record<string, any>;
          if (backupTheme && typeof backupTheme === "object") {
            setRemoteTheme(current => ({ ...backupTheme, ...current }));
          }
        } catch {}
      }
      tabletLayoutBackupReadyRef.current = true;
    });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!tabletLayoutBackupReadyRef.current) return;
    void AsyncStorage.setItem(LAYOUT_BACKUP_KEY, JSON.stringify(remoteTheme));
  }, [remoteTheme]);

  const refresh = useCallback(async () => {
    try {
      const x = await loadPrayerTimes();
      setTimes(x.prayerTimes);
      setLocation(x.location);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [raw, loaded] = await Promise.all([AsyncStorage.getItem(DEVICE_KEY), loadInitialPrayerTimes()]);
      if (!alive) return;
      let d: Device;
      try { d = raw ? JSON.parse(raw) : makeDevice(); } catch { d = makeDevice(); }
      setDevice(d);
      await AsyncStorage.setItem(DEVICE_KEY, JSON.stringify(d));
      const saved = await AsyncStorage.getItem(SETTINGS_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          const storedTheme = parsed?.tabletTheme && typeof parsed.tabletTheme === "object" ? parsed.tabletTheme : parsed;
          setRemoteTheme(current => ({ ...current, ...(storedTheme || {}) }));
          const storedSlide = Number(storedTheme?.sliderSeconds ?? parsed?.slideSeconds);
          if (storedSlide >= 4) setSlideSeconds(storedSlide);
        } catch {}
      }
      setTimes(loaded.prayerTimes);
      setLocation(loaded.location);
      setLoading(false);
      void refresh();
    })();

    const id = setInterval(() => setNow(new Date()), 1000);
    void ScreenOrientation.unlockAsync().catch(() => undefined);
    if (Platform.OS === "android") {
      void NavigationBar.setVisibilityAsync("hidden").catch(() => undefined);
    }
    return () => {
      alive = false;
      clearInterval(id);
      if (Platform.OS === "android") void NavigationBar.setVisibilityAsync("visible").catch(() => undefined);
    };
  }, [refresh]);

  useEffect(() => {
    const id = setInterval(() => setSlide(n => (n + 1) % PRAYERS.length), Math.max(4, slideSeconds) * 1000);
    return () => clearInterval(id);
  }, [slideSeconds]);

  // HASSOUN_TABLET_PRAYER_RUNTIME_V1
  useEffect(() => {
    if (loading || !Object.keys(times).length) return;
    let dead = false;
    let arming = false;
    const arm = async () => {
      if (arming || dead) return;
      arming = true;
      try {
        const preferences = await loadPhonePrayerAlertPreferences();
        if (!dead) setTabletPrayerPrefs(preferences);
        const result = await schedulePrayerNotifications(times, locale, preferences, {
          timeZone: location.timezone,
          locationLabel: location.label,
        });
        if (!dead) {
          if (!result.granted) setTabletPrayerRuntimeStatus("notification-permission-needed");
          else if ("exactAlarmGranted" in result && result.exactAlarmGranted === false) {
            setTabletPrayerRuntimeStatus("exact-alarm-permission-needed");
            if (!exactAlarmTabletPromptRef.current && AppState.currentState === "active") {
              exactAlarmTabletPromptRef.current = true;
              Alert.alert(
                "Allow Alarms & reminders",
                "Tablet mode needs Android Alarms & reminders access for the Adhan to play exactly at prayer time, even while this display stays open.",
                [
                  { text: "Not now", style: "cancel", onPress: () => { exactAlarmTabletPromptRef.current = false; } },
                  { text: "Open settings", onPress: () => openExactAlarmSettings() },
                ]
              );
            }
          }
          else setTabletPrayerRuntimeStatus(`armed:${result.count}`);
        }
      } catch {
        if (!dead) setTabletPrayerRuntimeStatus("error");
      } finally {
        arming = false;
      }
    };
    void arm();
    const appSub = AppState.addEventListener("change", state => { if (state === "active") void arm(); });
    const keepArmed = setInterval(() => { void arm(); }, 6 * 60 * 60 * 1000);
    return () => { dead = true; appSub.remove(); clearInterval(keepArmed); };
  }, [loading, times, locale, location.timezone, location.label]);

  useEffect(() => {
    if (!device) return;
    let dead = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const register = async () => {
      try {
        await fetch(`${API}/masjid-displays/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceId: device.id, pairCode: device.code, deviceSecret: device.secret, name: device.name, settings: { displayMode: "native-tablet-grand", displayMarker: DISPLAY_MARKER } }),
        });
      } catch {}
    };
    const poll = async () => {
      if (dead) return;
      try {
        const r = await fetch(`${API}/masjid-displays/device/${encodeURIComponent(device.id)}?secret=${encodeURIComponent(device.secret)}`, { cache: "no-store" });
        if (r.status === 404) await register();
        else if (r.ok) {
          const data = await r.json() as { pairCode?: string; settings?: Record<string, any>; paired?: boolean; controllerCount?: number };
          if (data.pairCode && /^\d{6}$/.test(data.pairCode) && data.pairCode !== device.code) {
            const n = { ...device, code: data.pairCode };
            setDevice(n);
            await AsyncStorage.setItem(DEVICE_KEY, JSON.stringify(n));
          }
          const incomingSettings = data.settings && typeof data.settings === "object" ? data.settings : {};
          const incomingTheme = incomingSettings.tabletTheme && typeof incomingSettings.tabletTheme === "object" ? incomingSettings.tabletTheme : {};
          setRemoteTheme(current => Object.keys(incomingTheme).length ? ({ ...current, ...incomingTheme }) : current);
          const remoteSlide = Number(incomingTheme.sliderSeconds ?? incomingSettings.sliderSeconds);
          if (remoteSlide >= 4 && remoteSlide <= 60) setSlideSeconds(remoteSlide);
          await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...incomingSettings, tabletTheme: incomingTheme }));
          setPaired(Boolean(data.paired) || (Number(data.controllerCount) || 0) > 0);
        }
      } catch {}
      timer = setTimeout(poll, 1000);
    };
    void register().then(poll);
    return () => { dead = true; if (timer) clearTimeout(timer); };
  }, [device?.id]);

  const key = dateKey(now, location.timezone);
  const day = times[key];
  const cur = nowMinutes(now, location.timezone);
  const next = useMemo(() => {
    if (!day) return "fajr" as PrayerKey;
    for (const p of PRAYER_KEYS) {
      const m = minutes(day[p]);
      if (m !== null && m > cur) return p;
    }
    return "fajr" as PrayerKey;
  }, [day, cur]);
  const freezeBeforeMinutes = Math.max(1, Number(remoteTheme.freezeBeforeMinutes) || 5);
  const beatEnabled = remoteTheme.beatBeforePrayer !== false;
  const imminentSeconds = secondsUntilPrayer(now, location.timezone, day?.[next]);
  const imminentPrayer = imminentSeconds > 0 && imminentSeconds <= freezeBeforeMinutes * 60 ? next : null;

  const prayerNow = useMemo(() => {
    if (!day) return null as PrayerKey | null;
    for (const p of PRAYER_KEYS) {
      const m = minutes(day[p]);
      if (m !== null && cur >= m && cur < m + 5) return p;
    }
    return null as PrayerKey | null;
  }, [day, cur]);

  useEffect(() => {
    if (!prayerNow) return;
    const index = PRAYERS.findIndex(p => p.key === prayerNow);
    if (index >= 0) setSlide(index);
  }, [prayerNow]);

  const lockedPrayer = prayerNow || imminentPrayer;
  const current = lockedPrayer ? (PRAYERS.find(p => p.key === lockedPrayer) || PRAYERS[slide]) : PRAYERS[slide];
  const currentTimeBase = prayerParts(day?.[current.key]);
  const currentTime = { ...currentTimeBase, period: remoteTheme.showPrayerPeriod !== false ? currentTimeBase.period : "" }; // HASSOUN_TABLET_PRAYER_PERIOD_TOGGLE_V3
  const isPrayerNow = prayerNow === current.key;
  const isImminent = imminentPrayer === current.key;
  const isNext = !isPrayerNow && current.key === next;

  // HASSOUN_TABLET_5MIN_BEAT_V1
  useEffect(() => {
    if (!isImminent || !beatEnabled) { beatAnim.stopAnimation(); beatAnim.setValue(1); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(beatAnim,{toValue:1.025,duration:420,useNativeDriver:true}),
      Animated.timing(beatAnim,{toValue:1,duration:420,useNativeDriver:true}),
    ]));
    loop.start();
    return () => { loop.stop(); beatAnim.setValue(1); };
  }, [isImminent, beatEnabled, beatAnim]);
  const nextSeconds = secondsUntilPrayer(now, location.timezone, day?.[next]);
  const date = new Intl.DateTimeFormat(ar ? "ar" : "en-CA", { timeZone: location.timezone, weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(now);
  const clockParts = zonedParts(now, location.timezone);
  const clock24Hour = remoteTheme.clock24Hour === true;
  const clockHour12 = clockParts.hour % 12 || 12;
  const clockPeriod = clockParts.hour >= 12 ? "PM" : "AM";
  const clock = clock24Hour
    ? `${String(clockParts.hour).padStart(2, "0")}:${String(clockParts.minute).padStart(2, "0")}:${String(clockParts.second).padStart(2, "0")}`
    : `${String(clockHour12).padStart(2, "0")}:${String(clockParts.minute).padStart(2, "0")}:${String(clockParts.second).padStart(2, "0")} ${clockPeriod}`;
  const clampScale = (value: any, fallback = 1) => { const n = Number(value); return Number.isFinite(n) && n > 0 ? n : fallback; };
  const clampTextScale = (value: any, fallback = 1) => { const n = Number(value); return Number.isFinite(n) && n > 0 ? n : fallback; };
  const fitFullScreen = remoteTheme.fitFullScreen !== false;
  const mainCardScale = clampScale(remoteTheme.mainCardScale);
  const lowerCardScale = clampScale(remoteTheme.lowerCardScale);
  const metaScale = clampTextScale(remoteTheme.metaSize);
  const clockScale = clampTextScale(remoteTheme.clockSize);
  const arabicScale = clampTextScale(remoteTheme.arabicSize);
  const englishScale = clampTextScale(remoteTheme.englishSize);
  const prayerTimeScale = clampTextScale(remoteTheme.prayerTimeSize);
  const themeHex = (value: any, fallback: string) => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
  const metaColor = themeHex(remoteTheme.metaColor, CLASSIC.meta);
  const clockColor = themeHex(remoteTheme.clockColor, CLASSIC.clock);
  const cardA = themeHex(remoteTheme.cardGradientA, CLASSIC.cardA);
  const cardB = themeHex(remoteTheme.cardGradientB, CLASSIC.cardB);
  const cardBorder = themeHex(remoteTheme.cardBorder, CLASSIC.gold);
  const arabicColor = themeHex(remoteTheme.arabicColor, CLASSIC.gold);
  const englishColor = themeHex(remoteTheme.englishColor, CLASSIC.white);
  const prayerTimeColor = themeHex(remoteTheme.prayerTimeColor, CLASSIC.white);
  const clockFont = typeof remoteTheme.clockFont === "string" ? remoteTheme.clockFont : undefined;
  const arabicFont = typeof remoteTheme.arabicFont === "string" ? remoteTheme.arabicFont : undefined;
  const englishFont = typeof remoteTheme.englishFont === "string" ? remoteTheme.englishFont : undefined;
  const prayerTimeFont = typeof remoteTheme.prayerTimeFont === "string" ? remoteTheme.prayerTimeFont : undefined;
  const countdownScale = clampTextScale(remoteTheme.countdownSize);
  const countdownColor = themeHex(remoteTheme.countdownColor, cardBorder);
  const countdownFont = typeof remoteTheme.countdownFont === "string" ? remoteTheme.countdownFont : undefined;
  const showCountdown = remoteTheme.showCountdown !== false;
  const displayClock = new Intl.DateTimeFormat("en-US", { timeZone: location.timezone, hour: "2-digit", minute: "2-digit", second: remoteTheme.showSeconds !== false ? "2-digit" : undefined, hour12: remoteTheme.showClockPeriod !== false }).format(now);
  const prayerLabelText = typeof remoteTheme.prayerLabelText === "string" && remoteTheme.prayerLabelText.trim() ? remoteTheme.prayerLabelText.trim() : (isPrayerNow ? "PRAYER NOW" : isImminent ? "PRAYER SOON" : isNext ? "NEXT PRAYER" : "PRAYER");
  const prayerLabelEmoji = typeof remoteTheme.prayerLabelEmoji === "string" ? remoteTheme.prayerLabelEmoji.trim() : "";
  const showPrayerLabel = remoteTheme.showPrayerLabel !== false;
  const adhanText = typeof remoteTheme.adhanText === "string" && remoteTheme.adhanText.trim() ? remoteTheme.adhanText.trim() : "Adhan On";
  const adhanEmoji = typeof remoteTheme.adhanEmoji === "string" && remoteTheme.adhanEmoji.trim() ? remoteTheme.adhanEmoji.trim() : "🔊";
  const showAdhan = remoteTheme.showAdhan !== false;
  const showCustomMessage = remoteTheme.showCustomMessage === true;
  const customMessage = typeof remoteTheme.customMessage === "string" ? remoteTheme.customMessage.trim() : "";
  const customMessageColor = themeHex(remoteTheme.customMessageColor, CLASSIC.white);
  const customMessageScale = clampTextScale(remoteTheme.customMessageSize);
  const customMessageFont = typeof remoteTheme.customMessageFont === "string" ? remoteTheme.customMessageFont : undefined;
  const customLogoUrl = typeof remoteTheme.customLogoUrl === "string" ? remoteTheme.customLogoUrl.trim() : "";
  const requestedClockBand = Math.max(.05, Number(remoteTheme.clockBandScale) || clockScale || 1);
  const requestedMiniBand = Math.max(.05, Number(remoteTheme.lowerCardScale) || 1, ...PRAYER_KEYS.map(p => Number(remoteTheme[`mini_${p}_height`]) || 1));
  const requestedHeroBand = Math.max(.05, (Number(remoteTheme.mainCardScale) || 1) * (Number(remoteTheme.mainCardHeightScale) || 1));
  const contentHeight = Math.max(320, height - Math.round(height * .045));
  const clockWeight = .12 * requestedClockBand;
  const heroWeight = .76 * requestedHeroBand;
  const miniWeight = .12 * requestedMiniBand;
  const totalWeight = Math.max(.01, clockWeight + heroWeight + miniWeight);
  const clockBandHeight = Math.max(42, Math.round(contentHeight * clockWeight / totalWeight));
  const miniBandHeight = Math.max(42, Math.round(contentHeight * miniWeight / totalWeight));
  const heroAvailableHeight = Math.max(120, contentHeight - clockBandHeight - miniBandHeight);
  const backgroundMode = remoteTheme.backgroundMode === "image" || remoteTheme.backgroundMode === "video" ? remoteTheme.backgroundMode : "color";
  const backgroundImageUrl = typeof remoteTheme.backgroundImageUrl === "string" ? remoteTheme.backgroundImageUrl.trim() : "";
  const backgroundVideoUrl = typeof remoteTheme.backgroundVideoUrl === "string" ? remoteTheme.backgroundVideoUrl.trim() : "";
  const backgroundYouTubeId = youtubeVideoId(backgroundVideoUrl);
  const backgroundYouTubeUrl = backgroundYouTubeId ? `https://www.youtube.com/embed/${backgroundYouTubeId}?autoplay=1&mute=1&controls=0&loop=1&playlist=${backgroundYouTubeId}&playsinline=1&rel=0&modestbranding=1` : "";
  const pageA = themeHex(remoteTheme.pageGradientA, CLASSIC.pageA);
  const pageB = themeHex(remoteTheme.pageGradientB, CLASSIC.pageB);
  const mainCardWidthScale = Number(remoteTheme.mainCardWidthScale) > 0 ? Number(remoteTheme.mainCardWidthScale) : 1;
  const mainCardHeightScale = Number(remoteTheme.mainCardHeightScale) > 0 ? Number(remoteTheme.mainCardHeightScale) : 1;
  const backgroundPlayer = useVideoPlayer(backgroundMode === "video" && backgroundVideoUrl && !backgroundYouTubeId ? backgroundVideoUrl : null, player => { player.loop = true; player.muted = true; if (backgroundVideoUrl && !backgroundYouTubeId) player.play(); });
  const mainCardHeight = Math.round((landscape ? height * .48 : height * .57) * mainCardScale);
  const lowerCardHeight = Math.round(104 * lowerCardScale);
  const pairUrl = device ? `https://hassoun.app/masjid-tv/pair/?device=${encodeURIComponent(device.id)}&code=${device.code}` : "";
  const qr = pairUrl ? `https://api.qrserver.com/v1/create-qr-code/?size=360x360&margin=8&data=${encodeURIComponent(pairUrl)}` : "";
  // HASSOUN_TABLET_FORCED_CLOCK_V3
  // HASSOUN_TABLET_CLOCK_FORMAT_CONTROLS_V1
  const forcedClockPartsV1033 = zonedParts(now, location.timezone);
  const forcedClock24HourV1033 = remoteTheme.clock24Hour === true;
  const forcedClockShowSecondsV1035 = remoteTheme.showSeconds !== false;
  const forcedClockHour12V1033 = forcedClockPartsV1033.hour % 12 || 12;
  const forcedClockPeriodV1033 = forcedClockPartsV1033.hour >= 12 ? "PM" : "AM";
  const forcedClockMinuteV1035 = String(forcedClockPartsV1033.minute).padStart(2,"0");
  const forcedClockSecondV1035 = String(forcedClockPartsV1033.second).padStart(2,"0");
  const forcedClockSuffixV1035 = forcedClockShowSecondsV1035 ? `:${forcedClockSecondV1035}` : "";
  const forcedClockTextV1033 = forcedClock24HourV1033
    ? `${String(forcedClockPartsV1033.hour).padStart(2,"0")}:${forcedClockMinuteV1035}${forcedClockSuffixV1035}`
    : `${String(forcedClockHour12V1033).padStart(2,"0")}:${forcedClockMinuteV1035}${forcedClockSuffixV1035} ${forcedClockPeriodV1033}`;

  const toggleTabletPrayerAthan = useCallback(async (prayer: PrayerKey) => {
    try {
      const currentPrefs = tabletPrayerPrefs || await loadPhonePrayerAlertPreferences();
      const nextPrefs: PrayerAlertPreferences = {
        ...currentPrefs,
        [prayer]: { ...currentPrefs[prayer], athan: !currentPrefs[prayer].athan },
      };
      const saved = await savePhonePrayerAlertPreferences(nextPrefs);
      setTabletPrayerPrefs(saved);

      // HASSOUN_TABLET_AUDIO_MUTE_SAFE_V1
      // A mini-card tap only changes the native Adhan schedule. Leave already-armed
      // 20m/10m reminder notifications untouched so a normal display interaction
      // cannot cancel or shift reminder sounds.
      const audio = await scheduleAndroidPrayerAudio(times, saved, location.timezone);
      if (!audio.available) setTabletPrayerRuntimeStatus("error");
      else if (!audio.exact) setTabletPrayerRuntimeStatus("exact-alarm-permission-needed");
      else setTabletPrayerRuntimeStatus(`armed:${audio.count}`);
    } catch {
      setTabletPrayerRuntimeStatus("error");
    }
  }, [tabletPrayerPrefs, times, location.timezone]);



  return (
    <Modal visible animationType="fade" presentationStyle="fullScreen" statusBarTranslucent onRequestClose={onBack}>
      <LinearGradient colors={[pageA, pageB]} style={styles.root}>
        <StatusBar hidden translucent backgroundColor="transparent" />
        {backgroundMode === "video" && backgroundYouTubeUrl ? <WebView source={{ uri: backgroundYouTubeUrl }} style={StyleSheet.absoluteFill} javaScriptEnabled allowsInlineMediaPlayback mediaPlaybackRequiresUserAction={false} scrollEnabled={false} bounces={false} pointerEvents="none" /> : null}
        {backgroundMode === "video" && backgroundVideoUrl && !backgroundYouTubeId ? <VideoView player={backgroundPlayer} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} /> : null}
        <View style={styles.meta}>
          <Text style={[styles.metaText, { fontSize: 16 * metaScale, color: metaColor }]}>✦ {location.label}</Text>
          <View style={styles.metaDivider} />
          <Text style={[styles.metaText, { fontSize: 16 * metaScale, color: metaColor }]}>▣ {date}</Text>
        </View>

        <Pressable onPress={() => setSetup(true)} style={[styles.clockButton,{width:"100%",alignSelf:"stretch",justifyContent:"center",alignItems:"center",overflow:"hidden",paddingHorizontal:2,height:clockBandHeight,flexShrink:0}]}>
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.01} allowFontScaling={false} style={[styles.clock, { width:"100%", maxWidth:"100%", height:"100%", textAlign:"center", textAlignVertical:"center", alignSelf:"stretch", fontSize: Math.max(72,width*.19*clockScale), color: clockColor, fontFamily: clockFont, includeFontPadding:true, letterSpacing:-1 }]}>{forcedClockTextV1033}</Text>
        </Pressable>

        <Animated.View style={{width:"100%",height:heroAvailableHeight,alignItems:"center",justifyContent:"center",transform:[{scale:beatAnim}]}}><LinearGradient colors={[cardA, cardB]} style={[styles.hero, { borderColor: cardBorder, width: `${Math.min(100,Math.max(1,Math.round(mainCardWidthScale*100)))}%`, alignSelf:"center", flexShrink:1, minHeight:100 }, { flex:0, height:heroAvailableHeight }]}>
          <View style={styles.ornamentRow}><View style={styles.ornamentLine} /><Text style={styles.diamond}>◆</Text><View style={styles.ornamentLine} /></View>
          {showPrayerLabel ? <View style={styles.prayerPill}><Text style={styles.pillText}>{prayerLabelEmoji ? `${prayerLabelEmoji} ` : ""}{prayerLabelText}</Text></View> : null}
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.01} allowFontScaling={false} style={[styles.arabic,{width:"96%",alignSelf:"center",textAlign:"center",paddingVertical:8,includeFontPadding:true,fontSize:(landscape?58:78)*arabicScale,lineHeight:(landscape?68:92)*arabicScale,color:arabicColor,fontFamily:arabicFont,flexShrink:1}]}>{current.ar}</Text>
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.01} allowFontScaling={false} style={[styles.english,{width:"96%",alignSelf:"center",textAlign:"center",paddingVertical:5,includeFontPadding:true,fontSize:(landscape?42:54)*englishScale,lineHeight:(landscape?50:64)*englishScale,color:englishColor,fontFamily:englishFont,flexShrink:1}]}>{current.en}</Text>
          <View style={styles.ruleRow}><View style={styles.rule} /><Text style={styles.ruleIcon}>۞</Text><View style={styles.rule} /></View>
          <View style={[styles.timeRow,{width:"96%",maxHeight:"24%",alignSelf:"center",flexShrink:1}]}><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.01} allowFontScaling={false} style={[styles.prayerTime,{flexShrink:1,fontSize:(landscape?62:82)*prayerTimeScale,color:prayerTimeColor,fontFamily:prayerTimeFont}]}>{currentTime.main}</Text><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.01} allowFontScaling={false} style={[styles.prayerPeriod,{flexShrink:1,fontSize:26*prayerTimeScale,color:prayerTimeColor,fontFamily:prayerTimeFont}]}>{currentTime.period}</Text></View>
          {showCountdown && (isNext || isImminent) && !isPrayerNow ? <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.01} style={[styles.countdown,{color:countdownColor,fontSize:22*countdownScale,fontFamily:countdownFont}]}>◉ {humanLeft(isImminent ? imminentSeconds : nextSeconds)}</Text> : null}
          {customLogoUrl ? <Image source={{uri:customLogoUrl}} style={{width:72,height:72,resizeMode:"contain",alignSelf:"center",marginVertical:4}} /> : null}{showCustomMessage && customMessage ? <Text numberOfLines={4} adjustsFontSizeToFit minimumFontScale={0.01} allowFontScaling={false} style={{width:"92%",maxHeight:"24%",alignSelf:"center",textAlign:"center",color:customMessageColor,fontFamily:customMessageFont,fontSize:24*customMessageScale,flexShrink:1,paddingHorizontal:8}}>{customMessage}</Text> : null}{showAdhan ? <View style={styles.adhan}><Text style={styles.adhanText}>{adhanEmoji} {adhanText}</Text></View> : null}
        </LinearGradient></Animated.View>

        <View style={[styles.miniRow,{height:miniBandHeight,flexShrink:0,alignItems:"stretch"}]}>
          {PRAYERS.map((p, i) => {
            const active = lockedPrayer ? p.key === lockedPrayer : p.key === next;
            const m = prayerParts(day?.[p.key]);
            const miniPrefix = `mini_${p.key}_`;
            const miniWidth = Number(remoteTheme[`${miniPrefix}width`]) > 0 ? Number(remoteTheme[`${miniPrefix}width`]) : 1;
            const miniHeight = Number(remoteTheme[`${miniPrefix}height`]) > 0 ? Number(remoteTheme[`${miniPrefix}height`]) : 1;
            const miniArabicScale = clampTextScale(remoteTheme[`${miniPrefix}arabicSize`]);
            const miniEnglishScale = clampTextScale(remoteTheme[`${miniPrefix}englishSize`]);
            const miniTimeScale = clampTextScale(remoteTheme[`${miniPrefix}timeSize`]);
            const miniTextColor = themeHex(remoteTheme[`${miniPrefix}textColor`], active ? CLASSIC.white : CLASSIC.miniText);
            const miniA = themeHex(remoteTheme[`${miniPrefix}bgA`], active ? CLASSIC.nextA : CLASSIC.mini);
            const miniB = themeHex(remoteTheme[`${miniPrefix}bgB`], active ? CLASSIC.nextB : "#f3f0f4");
            const miniFont = typeof remoteTheme[`${miniPrefix}font`] === "string" ? remoteTheme[`${miniPrefix}font`] : undefined;
            const miniEmoji = typeof remoteTheme[`${miniPrefix}emoji`] === "string" && remoteTheme[`${miniPrefix}emoji`].trim() ? remoteTheme[`${miniPrefix}emoji`].trim() : p.icon;
            return (
              <Pressable key={p.key} onPress={() => { setSlide(i); void toggleTabletPrayerAthan(p.key); }} style={[styles.miniWrap, { flex: miniWidth, height: Math.max(34, Math.round(miniBandHeight * (miniHeight / requestedMiniBand))), alignSelf: "flex-end" }]}>
                <LinearGradient colors={[miniA, miniB]} style={[styles.mini, active && styles.miniActive]}>
                  <Text style={[styles.miniAr, { color: miniTextColor, fontSize: 13 * miniArabicScale, fontFamily: miniFont }]}>{p.ar}</Text>
                  <Text style={[styles.miniEn, { color: miniTextColor, fontSize: 14 * miniEnglishScale, fontFamily: miniFont }]}>{p.en}</Text>
                  <Text style={[styles.miniIcon, { color: miniTextColor, fontFamily: miniFont }]}>{miniEmoji}</Text>
                  <Text style={[styles.miniTime, { color: miniTextColor, fontSize: 16 * miniTimeScale, fontFamily: miniFont }]}>{m.main}</Text><Text style={{fontSize:13,fontWeight:"900",marginTop:2,color:active?(remoteTheme.miniNextText||"#ffffff"):(remoteTheme.miniTextColor||"#27312f")}}>{tabletPrayerPrefs?.[p.key]?.athan===false?"🔇 MUTED":"🔊 ADHAN"}</Text>
                </LinearGradient>
              </Pressable>
            );
          })}
        </View>

        {loading ? <View style={styles.loading}><ActivityIndicator size="large" color={CLASSIC.gold} /></View> : null}

        <Modal visible={setup} transparent animationType="fade" onRequestClose={() => setSetup(false)}>
          <View style={styles.backdrop}>
            <View style={styles.sheet}>
              <ScrollView contentContainerStyle={styles.sheetBody}>
                <View style={styles.sheetHead}>
                  <View style={{ flex: 1 }}><Text style={styles.sheetTitle}>{t("Native Tablet Display", "شاشة الجهاز اللوحي")}</Text><Text style={styles.sheetSub}>{t("Always-on native mode. Hassoun notifications and Adhan alarms continue running in the app.", "وضع أصلي دائم التشغيل مع استمرار التنبيهات والأذان داخل التطبيق.")}</Text></View>
                  <Pressable onPress={() => setSetup(false)} style={styles.close}><Text style={styles.closeText}>×</Text></Pressable>
                </View>
                <View style={styles.health}><Text style={styles.healthTitle}>✓ Native display active</Text><Text style={styles.healthText}>Screen stays awake • Android navigation hidden • prayer notifications/Adhan remain managed by Hassoun</Text></View>
                <Text style={styles.label}>{t("CONNECT THIS TABLET", "ربط هذا الجهاز")}</Text>
                <View style={styles.pair}>
                  {qr ? <Image source={{ uri: qr }} style={styles.qr} /> : null}
                  <View style={styles.pairCopy}><Text style={styles.codeLabel}>PAIRING CODE</Text><Text style={styles.code}>{device?.code || "------"}</Text><Text style={styles.pairHelp}>{t("Use Hassoun → Settings → Displays → Connect Display.", "استخدم حسّون ← الإعدادات ← الشاشات ← ربط شاشة.")}</Text><Text style={[styles.status, paired && styles.statusOn]}>{paired ? "● CONNECTED · LIVE" : "○ WAITING FOR APP"}</Text></View>
                </View>
                <Pressable onPress={onBack} style={styles.exit}><Text style={styles.exitText}>{t("Exit tablet display", "الخروج من وضع الشاشة")}</Text></Pressable>
              </ScrollView>
            </View>
          </View>
        </Modal>
      </LinearGradient>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 8 },
  meta: { height: 34, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12 },
  metaText: { color: CLASSIC.meta, fontSize: 16, fontWeight: "800" },
  metaDivider: { width: 1, height: 16, backgroundColor: "#8e958f" },
  clockButton: { height: 138, alignItems: "center", justifyContent: "center" },
  clock: { color: CLASSIC.clock, fontWeight: "900", letterSpacing: -3, textShadowColor: "rgba(80,20,30,.28)", textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 1 },
  hero: { flex: 1, minHeight: 0, borderRadius: 30, borderWidth: 1.5, borderColor: "#d3b45f", alignItems: "center", justifyContent: "center", paddingHorizontal: 18, paddingVertical: 14, overflow: "hidden" },
  ornamentRow: { width: "56%", flexDirection: "row", alignItems: "center", marginBottom: 8 },
  ornamentLine: { flex: 1, height: 1, backgroundColor: CLASSIC.gold, opacity: .8 },
  diamond: { color: CLASSIC.gold, fontSize: 13, marginHorizontal: 8 },
  prayerPill: { borderWidth: 1.5, borderColor: CLASSIC.gold, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 6, marginBottom: 18 },
  pillText: { color: CLASSIC.gold, fontSize: 14, fontWeight: "900", letterSpacing: 1.2 },
  arabic: { color: CLASSIC.gold, fontWeight: "900", lineHeight: 88, textAlign: "center" },
  english: { color: "#f2eee8", fontWeight: "900", marginTop: 8 },
  ruleRow: { width: "68%", flexDirection: "row", alignItems: "center", marginVertical: 18 },
  rule: { flex: 1, height: 1, backgroundColor: CLASSIC.gold, opacity: .75 },
  ruleIcon: { color: CLASSIC.gold, fontSize: 18, marginHorizontal: 10 },
  timeRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "center" },
  prayerTime: { color: CLASSIC.white, fontWeight: "900", letterSpacing: -2 },
  prayerPeriod: { color: CLASSIC.white, fontSize: 26, fontWeight: "800", marginLeft: 8 },
  countdown: { color: CLASSIC.gold, fontSize: 18, fontWeight: "900", marginTop: 12 },
  adhan: { marginTop: 14, borderWidth: 1.2, borderColor: CLASSIC.gold, borderRadius: 999, paddingHorizontal: 15, paddingVertical: 5 },
  adhanText: { color: CLASSIC.white, fontWeight: "900", fontSize: 14 },
  miniRow: { height: 104, flexDirection: "row", gap: 5, marginTop: 7 },
  miniWrap: { flex: 1 },
  mini: { flex: 1, borderWidth: 1.1, borderColor: "#a39aa6", borderRadius: 11, alignItems: "center", justifyContent: "center", paddingVertical: 4 },
  miniActive: { borderColor: CLASSIC.gold },
  miniAr: { color: CLASSIC.miniText, fontSize: 15, fontWeight: "700" },
  miniEn: { color: CLASSIC.miniText, fontSize: 13, fontWeight: "800", marginTop: 1 },
  miniIcon: { color: CLASSIC.miniText, fontSize: 13, marginTop: 1 },
  miniTime: { color: CLASSIC.miniText, fontSize: 17, fontWeight: "900", marginTop: 1 },
  miniTextActive: { color: "#ffffff" },
  loading: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(250,248,243,.62)", alignItems: "center", justifyContent: "center" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,.66)", alignItems: "center", justifyContent: "center", padding: 18 },
  sheet: { width: "94%", maxWidth: 760, maxHeight: "92%", backgroundColor: "#073f35", borderRadius: 24, borderWidth: 1, borderColor: "#6f9e91", overflow: "hidden" },
  sheetBody: { padding: 20 },
  sheetHead: { flexDirection: "row", gap: 14, alignItems: "flex-start" },
  sheetTitle: { color: "#ffffff", fontSize: 24, fontWeight: "900" },
  sheetSub: { color: "#bed1cc", fontSize: 13, marginTop: 5, lineHeight: 18 },
  close: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#20584d", alignItems: "center", justifyContent: "center" },
  closeText: { color: "#ffffff", fontSize: 27, lineHeight: 30 },
  health: { backgroundColor: "#0d5548", borderRadius: 14, padding: 13, marginTop: 16, borderWidth: 1, borderColor: "#4f8175" },
  healthTitle: { color: "#e9c96d", fontSize: 15, fontWeight: "900" },
  healthText: { color: "#d2e1dd", fontSize: 12, lineHeight: 17, marginTop: 4 },
  label: { color: "#f0c86a", fontSize: 11, letterSpacing: 1.5, fontWeight: "900", marginTop: 18, marginBottom: 8 },
  pair: { flexDirection: "row", gap: 15, borderWidth: 1, borderColor: "#58877b", borderRadius: 16, padding: 13, backgroundColor: "#093329" },
  qr: { width: 126, height: 126, borderRadius: 9 },
  pairCopy: { flex: 1, justifyContent: "center" },
  codeLabel: { color: "#a9c4bc", fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
  code: { color: "#f5cf70", fontSize: 34, fontWeight: "900", letterSpacing: 4, marginVertical: 4 },
  pairHelp: { color: "#c8d9d4", fontSize: 12, lineHeight: 17 },
  status: { color: "#c5d6d1", marginTop: 8, fontSize: 11, fontWeight: "800" },
  statusOn: { color: "#78e1a7" },
  exit: { marginTop: 18, borderRadius: 12, borderWidth: 1, borderColor: "#6e948b", padding: 13, alignItems: "center" },
  exitText: { color: "#ffffff", fontWeight: "900" },
});
