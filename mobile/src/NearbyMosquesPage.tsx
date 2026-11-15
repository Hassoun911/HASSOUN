import * as Location from "expo-location";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View
} from "react-native";
import {
  loadPrayerCalculationPreferences,
  savePrayerCalculationPreferences,
  type PrayerCalculationPreferences,
  type SelectedMosque
} from "./prayerCalculationSettings";
import { loadShowNearestMosqueOnHome, saveShowNearestMosqueOnHome } from "./nearestMosquePreference";

type Props = { locale: "en" | "ar"; onBack: () => void };
export type MosqueRow = SelectedMosque & { distanceKm: number };

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const rad = (v: number) => v * Math.PI / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function first(...values: unknown[]) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

function normalize(row: any, latitude: number, longitude: number): MosqueRow | null {
  const lat = Number(row?.lat);
  const lon = Number(row?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const address = row?.address || {};
  const displayName = String(row?.display_name || "").trim();
  const name = first(row?.name, row?.namedetails?.name, displayName.split(",")[0], "Mosque");
  const hay = `${name} ${displayName}`;
  if (!/mosque|masjid|islamic|muslim|جامع|مسجد/i.test(hay)) return null;
  return {
    id: String(row?.place_id || `${lat}:${lon}:${name}`),
    name,
    displayName: displayName || name,
    latitude: lat,
    longitude: lon,
    city: first(address.city, address.town, address.municipality, address.village, address.hamlet) || undefined,
    region: first(address.state, address.province, address.region) || undefined,
    country: first(address.country) || undefined,
    distanceKm: distanceKm(latitude, longitude, lat, lon)
  };
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function withDeadline<T>(promise: Promise<T>, timeoutMs: number, code: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(code)), timeoutMs))
  ]);
}

const WINDSOR_TRUSTED_MOSQUES = [
  { id: "windsor-mosque", name: "Windsor Mosque", address: "1320 Northwood St, Windsor, ON N9E 1A4, Canada", latitude: 42.27742, longitude: -83.03205 },
  { id: "wia-centre", name: "Windsor Islamic Association Centre", address: "2555 McKay Ave, Windsor, ON N9E 2P4, Canada", latitude: 42.27438, longitude: -83.03135 },
  { id: "tarbiyah-centre", name: "Tarbiyah Centre", address: "1955 Provincial Rd Unit 2 & 3, Windsor, ON N8W 5V7, Canada" },
  { id: "west-musallah", name: "West Musallah Windsor", address: "3324 Bloomfield Rd, Windsor, ON N9C 1R3, Canada" },
  { id: "rose-city", name: "Rose City Islamic Centre", address: "5420 Empress St, Windsor, ON N8T 1B4, Canada" },
  { id: "masjid-at-taqwa", name: "Masjid At-Taqwa", address: "1970 Tourangeau Rd, Windsor, ON N8W 4N3, Canada" },
  { id: "noor-ul-islam", name: "Masjid Noor-ul-Islam", address: "659 Lincoln Rd, Windsor, ON N8Y 2G8, Canada", latitude: 42.32117, longitude: -83.01546 },
  { id: "alber-mosque", name: "ALBER Mosque", address: "65 Ellis St E, Windsor, ON N8X 2G8, Canada" },
  { id: "al-hijra", name: "Al-Hijra Academy - Masjid And Islamic School", address: "5100 Howard Ave, Tecumseh, ON N9H 0M3, Canada", latitude: 42.22755, longitude: -82.9964 }
] as const;

const WINDSOR_DIRECTORY_CENTER = { latitude: 42.3149, longitude: -83.0364 };

function isWindsorDirectoryArea(latitude: number, longitude: number) {
  return distanceKm(latitude, longitude, WINDSOR_DIRECTORY_CENTER.latitude, WINDSOR_DIRECTORY_CENTER.longitude) <= 45;
}

function normalizedMosqueName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

async function resolveTrustedWindsorRows(latitude: number, longitude: number): Promise<MosqueRow[]> {
  const rows = await Promise.all(WINDSOR_TRUSTED_MOSQUES.map(async (seed) => {
    let lat = "latitude" in seed ? Number(seed.latitude) : NaN;
    let lon = "longitude" in seed ? Number(seed.longitude) : NaN;

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      try {
        const points = await withDeadline(Location.geocodeAsync(seed.address), 2800, "WINDSOR_MOSQUE_GEOCODE_TIMEOUT");
        const point = points[0];
        lat = Number(point?.latitude);
        lon = Number(point?.longitude);
      } catch {}
    }

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      // One final exact-address Nominatim attempt. It is independent from the
      // broad mosque directory query and only runs for a missing trusted seed.
      try {
        const params = new URLSearchParams({ format: "jsonv2", limit: "1", q: seed.address });
        const response = await fetchWithTimeout(`https://nominatim.openstreetmap.org/search?${params.toString()}`, { headers: { Accept: "application/json", "Accept-Language": "en" } }, 2200);
        if (response.ok) {
          const raw = (await response.json() as any[])[0];
          lat = Number(raw?.lat);
          lon = Number(raw?.lon);
        }
      } catch {}
    }

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return {
      id: `trusted:${seed.id}`,
      name: seed.name,
      displayName: seed.address,
      latitude: lat,
      longitude: lon,
      city: "Windsor",
      region: "Ontario",
      country: "Canada",
      distanceKm: distanceKm(latitude, longitude, lat, lon)
    } satisfies MosqueRow;
  }));
  const cleanRows: MosqueRow[] = [];
  for (const row of rows) {
    if (row) cleanRows.push(row);
  }
  return cleanRows;
}

async function findWindsorMosques(latitude: number, longitude: number) {
  // HASSOUN_NEAREST_MOSQUE_AUTO_V1045
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
  } catch {}

  // Quick live enrichment adds newly-mapped Windsor mosques without being able
  // to hide or replace the trusted nine above.
  try {
    const radiusMeters = 45000;
    const query = `[out:json][timeout:5];(node["amenity"="place_of_worship"]["religion"="muslim"](around:${radiusMeters},${latitude},${longitude});way["amenity"="place_of_worship"]["religion"="muslim"](around:${radiusMeters},${latitude},${longitude});relation["amenity"="place_of_worship"]["religion"="muslim"](around:${radiusMeters},${latitude},${longitude});node["building"="mosque"](around:${radiusMeters},${latitude},${longitude});way["building"="mosque"](around:${radiusMeters},${latitude},${longitude}););out center tags;`;
    const response = await fetchWithTimeout("https://overpass.kumi.systems/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: `data=${encodeURIComponent(query)}`
    }, 3200);
    if (response.ok) {
      const payload = await response.json() as { elements?: any[] };
      for (const element of payload.elements || []) {
        const lat = Number(element?.lat ?? element?.center?.lat);
        const lon = Number(element?.lon ?? element?.center?.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        const tags = element?.tags || {};
        const name = first(tags.name, tags["name:en"], tags["name:ar"], "Mosque");
        const d = distanceKm(latitude, longitude, lat, lon);
        if (d > 45) continue;
        const norm = normalizedMosqueName(name);
        const duplicate = [...map.values()].some((existing) =>
          normalizedMosqueName(existing.name) === norm || distanceKm(existing.latitude, existing.longitude, lat, lon) < 0.08
        );
        if (duplicate) continue;
        const address = [tags["addr:housenumber"], tags["addr:street"], tags["addr:city"] || tags["addr:town"], tags["addr:state"]].filter(Boolean).join(", ");
        map.set(`osm:${element?.type || "place"}:${element?.id || `${lat}:${lon}`}`, {
          id: `osm:${element?.type || "place"}:${element?.id || `${lat}:${lon}`}`,
          name,
          displayName: address || name,
          latitude: lat,
          longitude: lon,
          city: first(tags["addr:city"], tags["addr:town"], tags["addr:village"]) || undefined,
          region: first(tags["addr:state"], tags["addr:province"]) || undefined,
          country: first(tags["addr:country"]) || undefined,
          distanceKm: d
        });
      }
    }
  } catch {}

  return [...map.values()].sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 50);
}

export async function findNearbyMosques(latitude: number, longitude: number) {
  if (isWindsorDirectoryArea(latitude, longitude)) {
    return findWindsorMosques(latitude, longitude);
  }
  const map = new Map<string, MosqueRow>();
  const radiusMeters = 30000;
  let providerSucceeded = false;

  const addOsmElement = (element: any) => {
    const lat = Number(element?.lat ?? element?.center?.lat);
    const lon = Number(element?.lon ?? element?.center?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    const tags = element?.tags || {};
    const name = first(tags.name, tags["name:en"], tags["name:ar"], "Mosque");
    const street = first(tags["addr:street"]);
    const number = first(tags["addr:housenumber"]);
    const city = first(tags["addr:city"], tags["addr:town"], tags["addr:village"], tags["addr:suburb"]);
    const region = first(tags["addr:state"], tags["addr:province"]);
    const country = first(tags["addr:country"]);
    const address = [number, street, city, region, country].filter(Boolean).join(", ");
    const row: MosqueRow = {
      id: `osm:${element?.type || "place"}:${element?.id || `${lat}:${lon}`}`,
      name,
      displayName: address || [name, city, region].filter(Boolean).join(", "),
      latitude: lat,
      longitude: lon,
      city: city || undefined,
      region: region || undefined,
      country: country || undefined,
      distanceKm: distanceKm(latitude, longitude, lat, lon)
    };
    if (row.distanceKm <= 30) {
      const duplicate = [...map.values()].some((item) =>
        Math.abs(item.latitude - row.latitude) < 0.00008 && Math.abs(item.longitude - row.longitude) < 0.00008
      );
      if (!duplicate) map.set(row.id, row);
    }
  };

  const overpassQuery = `[out:json][timeout:16];(
    node["amenity"="place_of_worship"]["religion"="muslim"](around:${radiusMeters},${latitude},${longitude});
    way["amenity"="place_of_worship"]["religion"="muslim"](around:${radiusMeters},${latitude},${longitude});
    relation["amenity"="place_of_worship"]["religion"="muslim"](around:${radiusMeters},${latitude},${longitude});
    node["building"="mosque"](around:${radiusMeters},${latitude},${longitude});
    way["building"="mosque"](around:${radiusMeters},${latitude},${longitude});
    relation["building"="mosque"](around:${radiusMeters},${latitude},${longitude});
    node["name"~"mosque|masjid|islamic centre|islamic center|مسجد|جامع",i](around:${radiusMeters},${latitude},${longitude});
    way["name"~"mosque|masjid|islamic centre|islamic center|مسجد|جامع",i](around:${radiusMeters},${latitude},${longitude});
    relation["name"~"mosque|masjid|islamic centre|islamic center|مسجد|جامع",i](around:${radiusMeters},${latitude},${longitude});
  );out center tags;`;

  // Try more than one public Overpass instance. One overloaded instance should
  // never turn into a false "no mosques" result for the user.
  const overpassEndpoints = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter"
  ];

  for (const endpoint of overpassEndpoints) {
    try {
      const response = await fetchWithTimeout(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: `data=${encodeURIComponent(overpassQuery)}`
      }, 5000);
      if (!response.ok) continue;
      const payload = await response.json() as { elements?: any[] };
      providerSucceeded = true;
      for (const element of payload.elements || []) addOsmElement(element);
      if (map.size >= 8) break;
    } catch {}
  }

  // Nominatim is a separate fallback and also enriches sparse Overpass results.
  if (map.size < 8) {
    let city = "";
    let region = "";
    let country = "";
    try {
      const places = await Location.reverseGeocodeAsync({ latitude, longitude });
      const place = places[0];
      city = first(place?.city, place?.subregion, place?.district);
      region = first(place?.region);
      country = first(place?.country);
    } catch {}

    const latSpan = 0.32;
    const lonSpan = 0.42;
    const left = longitude - lonSpan;
    const right = longitude + lonSpan;
    const top = latitude + latSpan;
    const bottom = latitude - latSpan;
    const where = [city, region, country].filter(Boolean).join(" ");
    const terms = ["mosque", "masjid", "islamic centre", "islamic center", "مسجد", "جامع"];

    for (const word of terms) {
      if (map.size >= 25) break;
      try {
        const params = new URLSearchParams({
          format: "jsonv2",
          addressdetails: "1",
          namedetails: "1",
          limit: "50",
          q: [word, where].filter(Boolean).join(" "),
          viewbox: `${left},${top},${right},${bottom}`,
          bounded: "1"
        });
        const response = await fetchWithTimeout(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
          headers: { Accept: "application/json", "Accept-Language": "en,ar;q=0.9" }
        }, 3500);
        if (!response.ok) continue;
        const rows = await response.json() as any[];
        providerSucceeded = true;
        for (const raw of rows) {
          const normalized = normalize(raw, latitude, longitude);
          if (!normalized || normalized.distanceKm > 30) continue;
          const duplicate = [...map.values()].some((item) =>
            Math.abs(item.latitude - normalized.latitude) < 0.00008 && Math.abs(item.longitude - normalized.longitude) < 0.00008
          );
          if (!duplicate) map.set(normalized.id, normalized);
        }
      } catch {}
    }
  }

  if (!providerSucceeded) {
    throw new Error("MOSQUE_DIRECTORY_UNAVAILABLE");
  }

  return [...map.values()]
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 40);
}

export default function NearbyMosquesPage({ locale, onBack }: Props) {
  const ar = locale === "ar";
  const t = (en: string, arabic: string) => ar ? arabic : en;
  const [prefs, setPrefs] = useState<PrayerCalculationPreferences | null>(null);
  const [rows, setRows] = useState<MosqueRow[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [showNearestOnHome, setShowNearestOnHome] = useState(false);

  const refresh = async () => {
    setBusy(true);
    setError("");
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) throw new Error("LOCATION_PERMISSION_DENIED");
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const found = await withDeadline(
        findNearbyMosques(position.coords.latitude, position.coords.longitude),
        12000,
        "MOSQUE_SEARCH_TIMEOUT"
      );
      setRows(found);
      if (!found.length) setError(t("No mosques were found within 30 km. Tap refresh to try again, or keep GPS as your prayer source.", "لم يتم العثور على مساجد ضمن 30 كم. اضغط تحديث للمحاولة مرة أخرى أو استمر باستخدام GPS كمصدر لمواقيت الصلاة."));
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : String(cause);
      setError(code.includes("LOCATION")
        ? t("Location access is needed to find nearby mosques.", "يلزم السماح بالموقع للعثور على المساجد القريبة.")
        : code.includes("MOSQUE_SEARCH_TIMEOUT")
          ? t("Mosque search timed out. Tap refresh to try again.", "انتهت مهلة البحث عن المساجد. اضغط تحديث للمحاولة مرة أخرى.")
          : t("Mosque directory is temporarily unavailable. Tap refresh to try again.", "دليل المساجد غير متاح مؤقتاً. اضغط تحديث للمحاولة مرة أخرى."));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void loadPrayerCalculationPreferences().then(setPrefs);
    void loadShowNearestMosqueOnHome().then(setShowNearestOnHome);
    void refresh();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => `${row.name} ${row.displayName} ${row.city || ""}`.toLowerCase().includes(q));
  }, [query, rows]);

  const toggleNearestOnHome = async (enabled: boolean) => {
    setShowNearestOnHome(enabled);
    await saveShowNearestMosqueOnHome(enabled);
  };

  const chooseGps = async () => {
    const current = prefs || await loadPrayerCalculationPreferences();
    const next = { ...current, locationMode: "gps" as const, selectedMosque: null };
    await savePrayerCalculationPreferences(next);
    setPrefs(next);
    onBack();
  };

  const chooseMosque = async (mosque: MosqueRow) => {
    const current = prefs || await loadPrayerCalculationPreferences();
    const selected: SelectedMosque = {
      id: mosque.id,
      name: mosque.name,
      displayName: mosque.displayName,
      latitude: mosque.latitude,
      longitude: mosque.longitude,
      city: mosque.city,
      region: mosque.region,
      country: mosque.country
    };
    const next = { ...current, locationMode: "mosque" as const, selectedMosque: selected };
    await savePrayerCalculationPreferences(next);
    setPrefs(next);
    onBack();
  };

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{t("Mosques Near Me", "المساجد القريبة مني")}</Text>
          <Text style={styles.subtitle}>{t("Find, save and navigate to nearby mosques. Prayer times always stay based on your phone GPS.", "المساجد حول موقع GPS الحالي مرتبة حسب المسافة. اختيار المسجد للموقع والمسافة والاتجاهات فقط ولا يغيّر مواقيت الصلاة.")}</Text>
        </View>
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>{t("How this works", "كيف يعمل هذا الخيار")}</Text>
        <Text style={styles.infoText}>{t(
          "Mosques are shown for location, distance and directions only. Selecting a mosque never changes the prayer-time calculation. Hassoun always decides prayer times from your phone GPS.",
          "المساجد للموقع والمسافة والاتجاهات فقط. اختيار مسجد لا يغيّر مواقيت الصلاة، وحسون يعتمد دائماً على GPS للهاتف لتحديد مصدر المواقيت."
        )}</Text>
      </View>

      <Pressable onPress={() => void chooseGps()} style={[styles.gpsButton, prefs?.locationMode === "gps" && styles.gpsButtonActive]}>
        <Text style={styles.gpsTitle}>📍 {t("Use my GPS location", "استخدم موقعي عبر GPS")}</Text>
        <Text style={styles.gpsText}>{prefs?.locationMode === "gps" ? t("Prayer times always use phone GPS", "مصدر موقع الصلاة الحالي") : t("Clear the selected mosque", "العودة إلى الموقع التلقائي")}</Text>
      </Pressable>

      <View style={styles.homeNearestCard}>
        <View style={{ flex: 1 }}>
          <Text style={styles.homeNearestTitle}>{t("Show nearest mosque on Home", "إظهار أقرب مسجد في الصفحة الرئيسية")}</Text>
          <Text style={styles.homeNearestText}>{t(
            "Keep this on to always show the closest mosque and its distance on the Home page.",
            "اترك هذا الخيار مفعلاً لإظهار أقرب مسجد والمسافة إليه دائماً في الصفحة الرئيسية."
          )}</Text>
        </View>
        <Switch
          value={showNearestOnHome}
          onValueChange={(value) => { void toggleNearestOnHome(value); }}
          trackColor={{ false: "#cbd1cd", true: "#8fc7b7" }}
          thumbColor={showNearestOnHome ? "#0b6a53" : "#f4f4f4"}
        />
      </View>

      {prefs?.locationMode === "mosque" && prefs.selectedMosque ? (
        <View style={styles.selectedCard}>
          <Text style={styles.selectedLabel}>{t("SELECTED MOSQUE", "المسجد المحدد")}</Text>
          <Text style={styles.selectedName}>{prefs.selectedMosque.name}</Text>
          <Text style={styles.selectedText}>{prefs.selectedMosque.displayName}</Text>
        </View>
      ) : null}

      <View style={styles.searchRow}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t("Filter nearby mosques…", "ابحث ضمن المساجد القريبة…")}
          placeholderTextColor="#8b948f"
          style={styles.input}
        />
        <Pressable onPress={() => void refresh()} style={styles.refreshButton}><Text style={styles.refreshText}>↻</Text></Pressable>
      </View>

      {busy ? <View style={styles.loading}><ActivityIndicator color="#0b6a53" /><Text style={styles.loadingText}>{t("Loading mosques near you…", "جارٍ تحميل المساجد القريبة منك…")}</Text></View> : null}
      {!!error && !busy ? <Text style={styles.error}>{error}</Text> : null}

      {!busy ? filtered.map((row) => {
        const selected = prefs?.locationMode === "mosque" && prefs.selectedMosque?.id === row.id;
        return (
          <Pressable key={row.id} onPress={() => void chooseMosque(row)} style={[styles.mosqueCard, selected && styles.mosqueCardSelected]}>
            <View style={styles.mosqueIcon}><Text style={styles.mosqueEmoji}>🕌</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.mosqueName}>{row.name}</Text>
              <Text style={styles.mosqueAddress} numberOfLines={2}>{row.displayName}</Text>
              <Text style={styles.distance}>{row.distanceKm < 1 ? `${Math.round(row.distanceKm * 1000)} m` : `${row.distanceKm.toFixed(1)} km`} {t("away", "بعيداً")}</Text>
            </View>
            <Text style={styles.useText}>{selected ? "✓" : t("Use", "اختيار")}</Text>
          </Pressable>
        );
      }) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  homeNearestCard: { flexDirection: "row", alignItems: "center", gap: 14, padding: 15, borderRadius: 18, borderWidth: 1, borderColor: "#d6dbd5", backgroundColor: "#fff" },
  homeNearestTitle: { color: "#17463b", fontSize: 15, fontWeight: "900" },
  homeNearestText: { color: "#68756f", fontSize: 11.5, lineHeight: 17, marginTop: 4 },

  page: { flex: 1, backgroundColor: "#f4f2ea" },
  content: { padding: 18, paddingBottom: 52, gap: 12 },
  header: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  back: { width: 40, height: 44, justifyContent: "center" },
  backText: { fontSize: 44, color: "#0c433a", lineHeight: 46 },
  title: { color: "#153c35", fontSize: 26, fontWeight: "900" },
  subtitle: { color: "#6d7772", fontSize: 13, lineHeight: 19, marginTop: 3 },
  infoCard: { backgroundColor: "#0d493e", borderRadius: 18, padding: 15 },
  infoTitle: { color: "#fff", fontSize: 15, fontWeight: "900" },
  infoText: { color: "#e2efea", fontSize: 12, lineHeight: 19, marginTop: 6 },
  gpsButton: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#d9ddd7", borderRadius: 17, padding: 15 },
  gpsButtonActive: { borderColor: "#0b6a53", backgroundColor: "#edf7f3" },
  gpsTitle: { color: "#174d40", fontSize: 15, fontWeight: "900" },
  gpsText: { color: "#6e7b75", fontSize: 11, marginTop: 4 },
  selectedCard: { backgroundColor: "#fff8e7", borderWidth: 1, borderColor: "#dfc47e", borderRadius: 16, padding: 14 },
  selectedLabel: { color: "#91702d", fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  selectedName: { color: "#173f35", fontSize: 17, fontWeight: "900", marginTop: 4 },
  selectedText: { color: "#766f63", fontSize: 11, lineHeight: 16, marginTop: 3 },
  searchRow: { flexDirection: "row", gap: 8 },
  input: { flex: 1, minHeight: 48, borderRadius: 14, backgroundColor: "#fff", borderWidth: 1, borderColor: "#d8ddd7", paddingHorizontal: 13, color: "#173f35" },
  refreshButton: { width: 48, minHeight: 48, borderRadius: 14, backgroundColor: "#0b6a53", alignItems: "center", justifyContent: "center" },
  refreshText: { color: "#fff", fontSize: 24, fontWeight: "900" },
  loading: { flexDirection: "row", alignItems: "center", gap: 9, padding: 14 },
  loadingText: { color: "#61716b", fontSize: 12 },
  error: { backgroundColor: "#fff1ee", color: "#944a3e", borderRadius: 13, padding: 13, fontSize: 12, lineHeight: 18 },
  mosqueCard: { flexDirection: "row", alignItems: "center", gap: 11, backgroundColor: "#fff", borderWidth: 1, borderColor: "#dde0da", borderRadius: 18, padding: 13 },
  mosqueCardSelected: { borderColor: "#0b6a53", backgroundColor: "#edf7f3" },
  mosqueIcon: { width: 44, height: 44, borderRadius: 13, backgroundColor: "#f1eee4", alignItems: "center", justifyContent: "center" },
  mosqueEmoji: { fontSize: 22 },
  mosqueName: { color: "#173f35", fontSize: 14, fontWeight: "900" },
  mosqueAddress: { color: "#7b817d", fontSize: 10.5, lineHeight: 15, marginTop: 2 },
  distance: { color: "#0b6a53", fontSize: 10, fontWeight: "800", marginTop: 4 },
  useText: { color: "#0b6a53", fontSize: 12, fontWeight: "900" }
});
