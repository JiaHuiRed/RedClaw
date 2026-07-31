import { useSyncExternalStore } from "react";
import { themeStore, type ThemePreference } from "./theme-store";

export function useTheme() {
  const snapshot = useSyncExternalStore(themeStore.subscribe, themeStore.getSnapshot);
  return {
    preference: snapshot.preference,
    resolved: snapshot.resolved,
    setPreference: (preference: ThemePreference) => themeStore.setPreference(preference),
  };
}
