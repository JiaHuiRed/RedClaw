import type { GatewayBrowserClient } from "../gateway.ts";
import { applyConfig, updateConfigFormValue, type ConfigState } from "./config.ts";

export type ModelProviderPresetModel = {
  id: string;
  name?: string;
  contextWindow?: number;
};

export type ModelProviderPreset = {
  id: string;
  name?: string;
  docs?: string;
  baseUrl?: string;
  api?: string;
  installed: boolean;
  configured: boolean;
  modelCount: number;
  models: ModelProviderPresetModel[];
};

export type ModelProviderProbeOutcome = {
  ok: boolean;
  kind: string;
  status?: number;
  detail?: string;
};

export type ModelProviderAddDraft = {
  providerId: string;
  baseUrl: string;
  api: string;
  apiKey: string;
  modelId: string;
  contextWindow: string;
};

export type ModelProviderAddMode = "gallery" | "preset" | "custom";

export type ModelProviderAddState = {
  open: boolean;
  loading: boolean;
  presets: ModelProviderPreset[];
  filter: string;
  mode: ModelProviderAddMode;
  selected: ModelProviderPreset | null;
  draft: ModelProviderAddDraft;
  probing: boolean;
  probe: ModelProviderProbeOutcome | null;
  saving: boolean;
  error: string | null;
};

export function createModelProviderAddState(): ModelProviderAddState {
  return {
    open: false,
    loading: false,
    presets: [],
    filter: "",
    mode: "gallery",
    selected: null,
    draft: createEmptyDraft(),
    probing: false,
    probe: null,
    saving: false,
    error: null,
  };
}

/**
 * Render paths evaluate dialog helpers on every app render, including sparse
 * test states that predate this field — treat a missing slot as "closed".
 */
function resolveAddState(state: ConfigState): ModelProviderAddState | null {
  return state.modelProviderAdd ?? null;
}

function createEmptyDraft(): ModelProviderAddDraft {
  return {
    providerId: "",
    baseUrl: "",
    api: "openai-completions",
    apiKey: "",
    modelId: "",
    contextWindow: "",
  };
}

function requireConnected(state: ConfigState): GatewayBrowserClient | null {
  if (!state.client || !state.connected) {
    state.modelProviderAdd.error = "Not connected to gateway";
    return null;
  }
  return state.client;
}

export async function loadModelProviderPresets(state: ConfigState) {
  const client = requireConnected(state);
  if (!client) {
    return;
  }
  const add = state.modelProviderAdd;
  add.loading = true;
  add.error = null;
  try {
    const res = await client.request<{ providers: ModelProviderPreset[] }>(
      "models.providers.presets",
      {},
    );
    add.presets = res.providers ?? [];
  } catch (err) {
    add.error = String(err);
  } finally {
    add.loading = false;
  }
}

export function openModelProviderAdd(state: ConfigState) {
  state.modelProviderAdd = createModelProviderAddState();
  state.modelProviderAdd.open = true;
  void loadModelProviderPresets(state);
}

export function closeModelProviderAdd(state: ConfigState) {
  state.modelProviderAdd = createModelProviderAddState();
}

export function setModelProviderAddFilter(state: ConfigState, filter: string) {
  state.modelProviderAdd.filter = filter;
}

function focusPreset(
  state: ConfigState,
  mode: ModelProviderAddMode,
  preset: ModelProviderPreset | null,
) {
  const add = state.modelProviderAdd;
  add.mode = mode;
  add.selected = preset;
  add.probe = null;
  add.error = null;
  add.draft = createEmptyDraft();
  if (preset) {
    add.draft.api = preset.api ?? "openai-completions";
    add.draft.baseUrl = preset.baseUrl ?? "";
    add.draft.modelId = preset.models[0]?.id ?? "";
  } else {
    add.draft.providerId = suggestProviderId(add.draft.baseUrl);
  }
}

export function selectModelProviderPreset(state: ConfigState, preset: ModelProviderPreset) {
  focusPreset(state, "preset", preset);
}

export function selectModelProviderCustom(state: ConfigState) {
  focusPreset(state, "custom", null);
}

export function backToModelProviderGallery(state: ConfigState) {
  const add = state.modelProviderAdd;
  add.mode = "gallery";
  add.selected = null;
  add.probe = null;
  add.error = null;
}

export function patchModelProviderDraft(state: ConfigState, patch: Partial<ModelProviderAddDraft>) {
  Object.assign(state.modelProviderAdd.draft, patch);
  state.modelProviderAdd.probe = null;
}

export function suggestProviderId(baseUrl: string): string {
  try {
    const url = new URL(baseUrl);
    const host = url.hostname.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    const port = url.port ? `-${url.port}` : "";
    const candidate = `custom-${host}${port}`.replace(/^-+|-+$/g, "");
    return candidate || "custom";
  } catch {
    return "custom";
  }
}

export function canProbeModelProviderDraft(state: ConfigState): boolean {
  const add = resolveAddState(state);
  if (!add || add.probing) {
    return false;
  }
  if (add.mode === "preset") {
    const preset = add.selected;
    if (!preset?.baseUrl) {
      return false;
    }
    if (preset.api === "ollama") {
      return true;
    }
    return add.draft.apiKey.trim().length > 0 && add.draft.modelId.trim().length > 0;
  }
  const { baseUrl, apiKey, modelId, api } = add.draft;
  if (!baseUrl.trim() || !URL.canParse(baseUrl.trim())) {
    return false;
  }
  if (api === "ollama") {
    return true;
  }
  return apiKey.trim().length > 0 && modelId.trim().length > 0;
}

export async function probeModelProviderDraft(state: ConfigState) {
  if (!canProbeModelProviderDraft(state)) {
    return;
  }
  const client = requireConnected(state);
  if (!client) {
    return;
  }
  const add = state.modelProviderAdd;
  add.probing = true;
  add.error = null;
  try {
    add.probe = await client.request<ModelProviderProbeOutcome>("models.providers.probe", {
      api: add.draft.api,
      baseUrl: add.draft.baseUrl.trim() || add.selected?.baseUrl,
      apiKey: add.draft.apiKey.trim(),
      modelId: add.draft.modelId.trim() || add.selected?.models[0]?.id,
    });
  } catch (err) {
    add.probe = { ok: false, kind: "error", detail: String(err) };
  } finally {
    add.probing = false;
  }
}

function parseContextWindow(raw: string): number | undefined {
  const parsed = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function buildProviderEntry(state: ConfigState): Record<string, unknown> | null {
  const add = resolveAddState(state);
  if (!add) {
    return null;
  }
  const existingProviders = ((state.configForm?.models as Record<string, unknown> | undefined)
    ?.providers ?? {}) as Record<string, Record<string, unknown>>;
  if (add.mode === "preset") {
    const preset = add.selected;
    if (!preset || !add.draft.apiKey.trim()) {
      return null;
    }
    // Installed plugin providers resolve their catalog at runtime; the config
    // entry only needs the credential (plus whatever the entry already has).
    return {
      ...existingProviders[preset.id],
      apiKey: add.draft.apiKey.trim(),
    };
  }
  const { providerId, baseUrl, api, apiKey, modelId } = add.draft;
  if (!providerId.trim() || !baseUrl.trim() || !modelId.trim()) {
    return null;
  }
  const contextWindow = parseContextWindow(add.draft.contextWindow);
  return {
    ...existingProviders[providerId.trim()],
    baseUrl: baseUrl.trim(),
    api,
    ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
    models: [
      {
        id: modelId.trim(),
        name: modelId.trim(),
        ...(contextWindow ? { contextWindow } : {}),
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      },
    ],
  };
}

export function canSaveModelProvider(state: ConfigState): boolean {
  return buildProviderEntry(state) !== null;
}

export async function saveModelProvider(state: ConfigState): Promise<boolean> {
  const add = state.modelProviderAdd;
  const entry = buildProviderEntry(state);
  if (!entry) {
    add.error = "missing-fields";
    return false;
  }
  const providerId = add.mode === "preset" ? add.selected!.id : add.draft.providerId.trim();
  add.saving = true;
  add.error = null;
  try {
    updateConfigFormValue(state, ["models", "providers", providerId], entry);
    // On failure the staged provider stays in the draft as a visible pending
    // change in the Models form; the apply error surfaces via state.lastError.
    const ok = await applyConfig(state);
    if (ok) {
      closeModelProviderAdd(state);
    }
    return ok;
  } catch (err) {
    add.error = String(err);
    return false;
  } finally {
    add.saving = false;
  }
}

export function filterModelProviderPresets(state: ConfigState): ModelProviderPreset[] {
  const add = resolveAddState(state);
  if (!add) {
    return [];
  }
  const query = add.filter.trim().toLowerCase();
  if (!query) {
    return add.presets;
  }
  return add.presets.filter(
    (preset) =>
      preset.id.toLowerCase().includes(query) || (preset.name ?? "").toLowerCase().includes(query),
  );
}
