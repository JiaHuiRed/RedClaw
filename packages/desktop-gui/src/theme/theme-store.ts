// Framework-agnostic theme store: localStorage + matchMedia + a `data-theme`
// DOM attribute, mirroring the plain-class singleton + subscriber-array shape
// already used by `gateway/client.ts`. No React import here on purpose -
// `useTheme.ts` is the only React-aware layer, wrapping this in
// useSyncExternalStore.

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export interface ThemeSnapshot {
  preference: ThemePreference;
  resolved: ResolvedTheme;
}

const STORAGE_KEY = "redclaw:theme";

function resolveSystemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function readStoredPreference(): ThemePreference {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
}

function resolve(preference: ThemePreference): ResolvedTheme {
  return preference === "system" ? resolveSystemTheme() : preference;
}

type Listener = () => void;

class ThemeStore {
  // A single cached object, only ever replaced (not mutated) when the theme
  // actually changes - useSyncExternalStore needs snapshot identity to stay
  // stable across calls that produce "no change", or it re-renders forever.
  private snapshot: ThemeSnapshot;
  private listeners: Listener[] = [];

  constructor() {
    const preference = readStoredPreference();
    this.snapshot = { preference, resolved: resolve(preference) };
    this.applyToDom();

    // Registered once here (not inside subscribe()), so mounting/unmounting
    // components that call useTheme() never adds a second listener.
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if (this.snapshot.preference !== "system") return;
      this.update(this.snapshot.preference);
    });
  }

  private applyToDom() {
    document.documentElement.setAttribute("data-theme", this.snapshot.resolved);
  }

  private update(preference: ThemePreference) {
    this.snapshot = { preference, resolved: resolve(preference) };
    this.applyToDom();
    this.listeners.forEach((fn) => fn());
  }

  getSnapshot = (): ThemeSnapshot => this.snapshot;

  subscribe = (fn: Listener) => {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  };

  setPreference(preference: ThemePreference) {
    if (preference === "system") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, preference);
    this.update(preference);
  }
}

export const themeStore = new ThemeStore();
