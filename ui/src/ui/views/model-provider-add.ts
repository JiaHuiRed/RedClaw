/**
 * "Add model provider" dialog — preset gallery first, guided form second.
 *
 * Gallery rows come from the gateway (installed plugin static catalogs +
 * OpenClaw provider index), so the UI never hardcodes provider data.
 */

import { html, nothing, type TemplateResult } from "lit";
import { t } from "../../i18n/index.ts";
import type {
  ModelProviderAddDraft,
  ModelProviderAddState,
  ModelProviderPreset,
} from "../controllers/model-providers.ts";

export type ModelProviderAddProps = {
  add: ModelProviderAddState;
  presets: ModelProviderPreset[];
  canProbe: boolean;
  canSave: boolean;
  onClose: () => void;
  onFilterChange: (value: string) => void;
  onSelectPreset: (preset: ModelProviderPreset) => void;
  onSelectCustom: () => void;
  onBack: () => void;
  onDraftChange: (patch: Partial<ModelProviderAddDraft>) => void;
  onProbe: () => void;
  onSave: () => void;
};

const PROBE_STATUS: Record<string, { labelKey: string; tone: string }> = {
  ok: { labelKey: "modelProviders.add.probe.ok", tone: "success" },
  auth: { labelKey: "modelProviders.add.probe.auth", tone: "danger" },
  not_found: { labelKey: "modelProviders.add.probe.notFound", tone: "danger" },
  rate_limit: { labelKey: "modelProviders.add.probe.rateLimit", tone: "warn" },
  error: { labelKey: "modelProviders.add.probe.error", tone: "danger" },
  network: { labelKey: "modelProviders.add.probe.network", tone: "danger" },
};

const API_OPTIONS: Array<{ value: string; labelKey: string }> = [
  { value: "openai-completions", labelKey: "modelProviders.add.api.openai" },
  { value: "anthropic-messages", labelKey: "modelProviders.add.api.anthropic" },
  { value: "ollama", labelKey: "modelProviders.add.api.ollama" },
];

function renderPresetCard(props: ModelProviderAddProps, preset: ModelProviderPreset) {
  const selectable = preset.installed;
  return html`
    <button
      type="button"
      class="mpa-card ${selectable ? "" : "mpa-card--preview"}"
      ?disabled=${!selectable}
      data-test-id="mpa-preset-${preset.id}"
      @click=${() => props.onSelectPreset(preset)}
    >
      <span class="mpa-card__head">
        <span class="mpa-card__name">${preset.name ?? preset.id}</span>
        ${preset.configured
          ? html`<span class="mpa-badge mpa-badge--ok">${t("modelProviders.add.configured")}</span>`
          : nothing}
      </span>
      <span class="mpa-card__meta">
        ${preset.installed
          ? t("modelProviders.add.modelCount", { count: String(preset.modelCount) })
          : t("modelProviders.add.pluginMissing")}
      </span>
    </button>
  `;
}

function renderGallery(props: ModelProviderAddProps) {
  const add = props.add;
  return html`
    <div class="mpa-gallery">
      <input
        type="text"
        class="cfg-input"
        placeholder=${t("modelProviders.add.filterPlaceholder")}
        aria-label=${t("modelProviders.add.filterPlaceholder")}
        .value=${add.filter}
        @input=${(e: Event) => props.onFilterChange((e.target as HTMLInputElement).value)}
      />
      ${add.loading
        ? html`<div class="muted" style="margin-top: 12px">${t("common.loading")}</div>`
        : nothing}
      ${add.error
        ? html`<div class="callout danger" style="margin-top: 12px">${add.error}</div>`
        : nothing}
      <div class="mpa-grid">
        ${props.presets.map((preset) => renderPresetCard(props, preset))}
        <button
          type="button"
          class="mpa-card mpa-card--custom"
          data-test-id="mpa-preset-custom"
          @click=${props.onSelectCustom}
        >
          <span class="mpa-card__head">
            <span class="mpa-card__name">${t("modelProviders.add.custom.title")}</span>
          </span>
          <span class="mpa-card__meta">${t("modelProviders.add.custom.subtitle")}</span>
        </button>
      </div>
    </div>
  `;
}

function renderProbeStatus(add: ModelProviderAddState) {
  if (!add.probe) {
    return nothing;
  }
  const status = PROBE_STATUS[add.probe.kind] ?? PROBE_STATUS.error!;
  return html`
    <div class="mpa-probe mpa-probe--${status.tone}" data-test-id="mpa-probe-result">
      ${t(status.labelKey)}${add.probe.status !== undefined ? ` (HTTP ${add.probe.status})` : ""}
    </div>
  `;
}

function renderField(label: string, input: TemplateResult) {
  return html` <label class="field"> <span>${label}</span> ${input} </label> `;
}

function renderApiKeyField(props: ModelProviderAddProps) {
  const value = props.add.draft.apiKey;
  return renderField(
    t("modelProviders.add.apiKey"),
    html`<input
      type="password"
      class="cfg-input"
      autocomplete="off"
      data-test-id="mpa-api-key"
      .value=${value}
      @input=${(e: Event) => props.onDraftChange({ apiKey: (e.target as HTMLInputElement).value })}
    />`,
  );
}

function renderPresetForm(props: ModelProviderAddProps) {
  const preset = props.add.selected;
  if (!preset) {
    return nothing;
  }
  return html`
    <div class="mpa-form">
      <div class="mpa-form__summary">
        <strong>${preset.name ?? preset.id}</strong>
        <span class="muted">${preset.baseUrl ?? preset.id}</span>
      </div>
      ${preset.models.length > 0
        ? html`
            <div class="mpa-chips">
              ${preset.models.map(
                (model) =>
                  html`<span class="mpa-chip" title=${model.name ?? model.id}>${model.id}</span>`,
              )}
              ${preset.modelCount > preset.models.length
                ? html`<span class="mpa-chip mpa-chip--more"
                    >+${preset.modelCount - preset.models.length}</span
                  >`
                : nothing}
            </div>
          `
        : nothing}
      ${renderApiKeyField(props)} ${renderProbeStatus(props.add)}
    </div>
  `;
}

function suggestFromBaseUrl(baseUrl: string): string {
  try {
    const url = new URL(baseUrl);
    const host = url.hostname.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    const port = url.port ? `-${url.port}` : "";
    return `custom-${host}${port}`.replace(/^-+|-+$/g, "") || "custom";
  } catch {
    return "custom";
  }
}

function renderCustomForm(props: ModelProviderAddProps) {
  const draft = props.add.draft;
  const draftChange = (patch: Partial<ModelProviderAddDraft>) => props.onDraftChange(patch);
  return html`
    <div class="mpa-form">
      <div class="form-grid">
        ${renderField(
          t("modelProviders.add.custom.providerId"),
          html`<input
            type="text"
            class="cfg-input"
            data-test-id="mpa-provider-id"
            .value=${draft.providerId}
            @input=${(e: Event) =>
              draftChange({ providerId: (e.target as HTMLInputElement).value })}
          />`,
        )}
        ${renderField(
          t("modelProviders.add.custom.baseUrl"),
          html`<input
            type="text"
            class="cfg-input"
            placeholder="https://api.example.com/v1"
            data-test-id="mpa-base-url"
            .value=${draft.baseUrl}
            @input=${(e: Event) => {
              const baseUrl = (e.target as HTMLInputElement).value;
              const patch: Partial<ModelProviderAddDraft> = { baseUrl };
              if (!draft.providerId || draft.providerId.startsWith("custom-")) {
                patch.providerId = suggestFromBaseUrl(baseUrl);
              }
              draftChange(patch);
            }}
          />`,
        )}
        ${renderField(
          t("modelProviders.add.custom.api"),
          html`<select
            class="cfg-input"
            data-test-id="mpa-api"
            .value=${draft.api}
            @change=${(e: Event) => draftChange({ api: (e.target as HTMLSelectElement).value })}
          >
            ${API_OPTIONS.map(
              (option) => html`
                <option value=${option.value} ?selected=${draft.api === option.value}>
                  ${t(option.labelKey)}
                </option>
              `,
            )}
          </select>`,
        )}
        ${renderApiKeyField(props)}
        ${draft.api === "ollama"
          ? nothing
          : renderField(
              t("modelProviders.add.custom.modelId"),
              html`<input
                type="text"
                class="cfg-input"
                data-test-id="mpa-model-id"
                .value=${draft.modelId}
                @input=${(e: Event) =>
                  draftChange({ modelId: (e.target as HTMLInputElement).value })}
              />`,
            )}
        ${draft.api === "ollama"
          ? nothing
          : renderField(
              t("modelProviders.add.custom.contextWindow"),
              html`<input
                type="number"
                min="1"
                class="cfg-input"
                placeholder="128000"
                data-test-id="mpa-context-window"
                .value=${draft.contextWindow}
                @input=${(e: Event) =>
                  draftChange({ contextWindow: (e.target as HTMLInputElement).value })}
              />`,
            )}
      </div>
      ${renderProbeStatus(props.add)}
    </div>
  `;
}

export function renderModelProviderAdd(
  props: ModelProviderAddProps,
): TemplateResult | typeof nothing {
  const add = props.add;
  if (!add || !add.open) {
    return nothing;
  }
  const inForm = add.mode !== "gallery";
  return html`
    <div class="mpa-backdrop" @click=${props.onClose}>
      <section
        class="card mpa-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mpa-title"
        @click=${(event: Event) => event.stopPropagation()}
      >
        <div class="mpa-modal__header">
          <div id="mpa-title" class="card-title">${t("modelProviders.add.title")}</div>
          <button
            type="button"
            class="btn"
            data-test-id="mpa-close"
            title=${t("common.dismiss")}
            aria-label=${t("common.dismiss")}
            @click=${props.onClose}
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <div class="mpa-modal__body">
          ${inForm
            ? add.mode === "preset"
              ? renderPresetForm(props)
              : renderCustomForm(props)
            : renderGallery(props)}
        </div>
        <div class="mpa-modal__footer">
          ${inForm
            ? html`
                <button type="button" class="btn" @click=${props.onBack}>
                  ${t("modelProviders.add.back")}
                </button>
              `
            : nothing}
          <button type="button" class="btn" @click=${props.onClose}>${t("common.cancel")}</button>
          ${inForm
            ? html`
                <button
                  type="button"
                  class="btn"
                  ?disabled=${!props.canProbe || add.probing}
                  data-test-id="mpa-test"
                  @click=${props.onProbe}
                >
                  ${add.probing ? t("modelProviders.add.probing") : t("modelProviders.add.test")}
                </button>
                <button
                  type="button"
                  class="btn primary"
                  ?disabled=${!props.canSave || add.saving}
                  data-test-id="mpa-save"
                  @click=${props.onSave}
                >
                  ${add.saving
                    ? t("modelProviders.add.saving")
                    : t("modelProviders.add.saveAndApply")}
                </button>
              `
            : nothing}
        </div>
      </section>
    </div>
  `;
}
