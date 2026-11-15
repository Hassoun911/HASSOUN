import AsyncStorage from "@react-native-async-storage/async-storage";

export const SHOW_NEAREST_MOSQUE_HOME_KEY = "hassoun:nearest-mosque-home:v1";
const listeners = new Set<(enabled: boolean) => void>();

export async function loadShowNearestMosqueOnHome() {
  try {
    return (await AsyncStorage.getItem(SHOW_NEAREST_MOSQUE_HOME_KEY)) === "1";
  } catch {
    return false;
  }
}

export async function saveShowNearestMosqueOnHome(enabled: boolean) {
  await AsyncStorage.setItem(SHOW_NEAREST_MOSQUE_HOME_KEY, enabled ? "1" : "0");
  for (const listener of listeners) {
    try { listener(enabled); } catch {}
  }
}

export function subscribeShowNearestMosqueOnHome(listener: (enabled: boolean) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
