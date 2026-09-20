# AGENTS.MD

Telegraph style. Root rules only. Read scoped `AGENTS.md` before subtree work.
Skills own workflows; root owns hard policy and routing.

## Start

- Repo: `https://github.com/openclaw/openclaw`
- Replies: repo-root refs only: `extensions/telegram/src/index.ts:80`. No absolute paths, no `~/`.
- Docs/user-visible work: `pnpm docs:list`, then read relevant docs only.
- Fix/triage answers need source, tests, current/shipped behavior, and dependency contract proof.
- Dependency-backed behavior: read upstream docs/source/types first. No API/default/error/timing guesses.
- Live-verify when feasible. Never print secrets.
- Missing deps: `pnpm install`, retry once, then report first actionable error.
- CODEOWNERS: maint/refactor/tests ok. Larger behavior/product/security/ownership: owner ask/review.
- Product/docs/UI/changelog wording: "plugin/plugins"; `extensions/` is internal.
- New channel/plugin/app/doc surface: update `.github/labeler.yml` + GH labels.
- New `AGENTS.md`: add sibling `CLAUDE.md` symlink; edit `AGENTS.md` only.

## ClawSweeper Review Policy

- ClawSweeper-owned schema, labels, close reasons, protected-label gates, maintainer-item gates, and mutation rules live in `openclaw/clawsweeper`.
- Review workers read this full root `AGENTS.md` plus every scoped `AGENTS.md` owning touched paths; no reliance on search snippets, partial ranges, or truncated copies.
- Findings need concrete behavior regressions, missing changed-surface proof, owner-boundary violations, security/API contract issues, or docs/config mismatches. No findings for style/policy preference with no user-visible, runtime, security, or maintainer-risk impact.
- Compatibility-sensitive surfaces (config/default adds/removes, provider/plugin routing, auth/session state, persisted prefs, setup/startup, fallback behavior) are merge risk even with green CI; emit a `reviewMetrics` entry for config/default surface changes when practical.
- One-sided fixes need sibling-surface proof or an explanation of why sibling surfaces are unaffected.

## Map

- Core TS: `src/`, `ui/`, `packages/`; plugins: `extensions/`; SDK: `src/plugin-sdk/*`; channels: `src/channels/*`; loader: `src/plugins/*`; protocol: `src/gateway/protocol/*`; docs/apps: `docs/`, `apps/`.
- Installers: sibling `../openclaw.ai`.
- Scoped guides: `extensions/`, `src/{plugin-sdk,channels,plugins,gateway,gateway/protocol,agents}/`, `test/helpers*/`, `docs/`, `ui/`, `scripts/`.

## Docs

- Source docs: `docs/**`; publish repo: `openclaw/docs`; host: `https://docs.openclaw.ai`.
- Flow: source -> `docs-sync-publish.yml` -> mirror build -> R2 -> Worker router.
- Docs AI: `openclaw/ask-molty`; see its `AGENTS.md`.

## Architecture

- Core stays plugin-agnostic. No bundled ids/defaults/policy in core when manifest/registry/capability contracts work.
- Plugins cross into core only via `openclaw/plugin-sdk/*`, manifest metadata, injected runtime helpers, documented barrels (`api.ts`, `runtime-api.ts`).
- Plugin prod code: no core `src/**`, `src/plugin-sdk-internal/**`, other plugin `src/**`, or relative outside package.
- Core/tests: no deep plugin internals (`extensions/*/src/**`, `onboard.js`). Use public barrels, SDK facade, generic contracts.
- Owner boundary: owner-specific repair/detection/onboarding/auth/defaults/provider behavior lives in owner plugin. Shared/core gets generic seams only.
- Dependency ownership follows runtime ownership: plugin-only deps stay plugin-local; root deps only for core imports or intentionally internalized bundled plugin runtime.
- Internal bundled plugins ship in core dist; bundled-only facade loader ok only for them.
- External official plugins own package/deps and are excluded from core dist; core uses registry-aware `facade-runtime` or generic contracts.
- Externalizing a bundled plugin: update package excludes, official catalogs, docs, tests, and prove core runtime paths resolve installed plugin roots before root-dep removal.
- Runtime reads canonical config only. No silent compat for old/malformed config keys. If a config change invalidates existing files, add a matching `openclaw doctor --fix` migration. Core/auth config repairs live in core doctor; plugin-owned config repairs live in that plugin's doctor contract (`legacyConfigRules` / `normalizeCompatibilityConfig`).
- Fix shape: default to clean bounded refactor, not smallest patch. Move ownership to right boundary; delete stale abstractions, duplicate policy, dead branches, wrappers, fallback stacks.
- Fix observed local failures with generic product rules; do not hardcode names, ids, log phrases, or user examples in prod code unless they are an explicit contract.
- Tests may use observed examples, but prod literals need a short contract reason.
- Compatibility is opt-in. "Shipped" means reachable from a release Git tag; main/GitHub/PR/unreleased code is not shipped.
- Refactor default: one canonical path. Delete the old path unless user explicitly wants compat or the shipped public contract is obvious and cited.
- Keep old behavior only for an explicit public API/config/plugin SDK/data contract, tagged upgrade path, security/migration boundary, dependency contract, or observed prod state.
- If unsure, ask before preserving compat. Do not keep aliases, shims, fallback stacks, stale names, or obsolete tests just in case.
- Tests alone do not make internals contracts. If compat stays, name the contract and migration/removal plan in code, test, or PR.
- Lean code is a goal. No internal shims, aliases, legacy names, broad fallbacks, or defensive branches just to reduce diff or handle unrealistic edge cases.
- Handle real production states, tagged upgrade paths, security boundaries, and dependency contracts. Public/hostile/observed malformed input gets care; hypothetical malformed input does not.
- Deprecate shipped public contracts only.
- Plugin SDK exception: shipped external API gets new API first plus named compat/deprecation, small tests/docs if useful, removal plan.
- Migrate internal/bundled callers to modern API in the same change. Do not let internal compat become permanent architecture.
- Channels are implementation under `src/channels/**`; plugin authors get SDK seams. Providers own auth/catalog/runtime hooks; core owns generic loop.
- Hot paths should carry prepared facts forward: provider id, model ref, channel id, target, capability family, attachment class. Do not rediscover with broad plugin/provider/channel/capability loaders.
- Do not fix repeated request-time discovery with scattered caches. Move the canonical fact earlier; reuse prepared runtime objects; delete duplicate lookup branches.
- Gateway/plugin metadata is process-stable: installs, manifests, catalogs, generated paths, bundled metadata. Changes require restart or explicit owner reload/install/doctor flow.
- Runtime hot paths: no freshness polling (`stat`/`realpath`/JSON reread/hash). Reuse current snapshots, install records, discovery, lookup tables, root scopes, resolved paths.
- Process-local metadata caches ok when lifecycle-owned and bounded/single-slot. Freshness exceptions need named owner + tests.
- Inline comments: preserve reviewer context at the code site. Use for cross-path/state invariants, platform/dependency caps, deterministic ordering, compact encoded state, lifecycle ordering, ownership boundaries, session/id adoption, queue-depth symmetry, fallbacks, or intentional caller differences.
- Comment shape: 1-3 short lines; state why the branch/helper exists, what contract it protects, and the bad outcome if removed. Cite nearby constants/helpers when useful. No syntax narration, PR/user-specific lore, or obvious mechanics.
- Gateway protocol changes: additive first; incompatible needs versioning/docs/client follow-through.
- Protocol version bumps: explicit owner confirmation only; never automatic/generated.
- Config contract: exported types, schema/help, metadata, baselines, docs aligned. Retired public keys stay retired; compat in raw migration/doctor only.
- Prompt cache: deterministic ordering for maps/sets/registries/plugin lists/files/network results before model/tool payloads. Preserve old transcript bytes when possible.
- Agent tool schema cleanup: remove stale args cleanly; no hidden compat for model-facing params just to avoid churn.

## Commands

- Runtime: Node 22.19+; Node 24 recommended. Keep Node + Bun paths working.
- Package manager/runtime: repo defaults only. No swaps without approval.
- Install: `pnpm install` (keep Bun lock/patches aligned if touched).
- CLI: `pnpm openclaw ...` or `pnpm dev`; build: `pnpm build`.
- Tests in a normal source checkout: `pnpm test <path-or-filter> [vitest args...]`, `pnpm test:changed`, `pnpm test:serial`, `pnpm test:coverage`; never raw `vitest`.
- Tests in a Codex worktree or linked/sparse checkout: avoid direct local `pnpm test*`; use `node scripts/run-vitest.mjs <path-or-filter>` for tiny explicit-file proof, or Crabbox/Testbox for anything broader.
- Checks in a normal source checkout: `pnpm check:changed`; lanes: `pnpm changed:lanes --json`; staged: `pnpm check:changed --staged`; full: `pnpm check`.
- Checks in a Codex worktree or linked/sparse checkout: avoid direct local `pnpm check*`; use `node scripts/crabbox-wrapper.mjs run ... --shell -- "pnpm check:changed"` so pnpm runs inside Testbox, not locally.
- Extension tests: `pnpm test:extensions`, `pnpm test extensions`, `pnpm test extensions/<id>`.
- Typecheck: `tsgo` lanes only (`pnpm tsgo*`, `pnpm check:test-types`); never add `tsc --noEmit`, `typecheck`, `check:types`.
- Formatting: `oxfmt`, not Prettier. Use repo wrappers (`pnpm format:*`, `pnpm lint:*`, `scripts/run-oxlint.mjs`).
- Build before push when build output, packaging, lazy/module boundaries, dynamic imports, or published surfaces can change.

## Validation

- Test/CI choice: `$openclaw-testing`. Remote/full/E2E proof: `$crabbox` — real scenario proof (install/update/call/repro user path), not copied tests.
- One/few files may run locally in a healthy checkout; anything that fans out or bogs down the Mac goes to Crabbox/Testbox.
- Do not land related failing format/lint/type/build/tests. If proof is blocked, say exactly what is missing and why.

## GitHub / PRs

- Maintainer-side OpenClaw issue/PR work: use `$openclaw-pr-maintainer` immediately. PR refs via `gh pr view/diff` / `gh api`, never web search; verify live before mutation.
- Bare issue/PR URL/number = review/report in chat only; mutate only when asked. No unsolicited PR comments/reviews/labels/retitles/rebases/fixups/landing.
- Maintainer decision closes the cluster: comment+close all directly associated open issues/PRs with rationale (decision, why, supported alternative, what evidence would change it); do not leave them open for hypothetical future repros.
- Landing/close/sweep requires evidence: comment proof + canonical commit/PR before closing. Final answers end with the full GitHub URL.
- PR create/refresh: real body (Summary + Verification); takeover-ready branch, `maintainer_can_modify` for forks. Issue/PR create: read `$agent-transcript`.
- Never push screenshots/videos/proof assets to product repo branches; use Crabbox artifact publishing plus manifest URL.

## Code

- TS ESM, strict. Avoid `any`; prefer real types, `unknown`, narrow adapters. No `@ts-nocheck`.
- External boundaries: prefer `zod` or existing schema helpers. Runtime branching: discriminated unions/closed codes over freeform strings; avoid semantic sentinels (`?? 0`, empty object/string).
- Make impossible states unrepresentable: closed mode/result shapes over parallel nullable fields callers must keep in sync.
- Keep old behavior only for explicit contracts (public API/config/plugin SDK, tagged upgrade path, security/migration boundary, dependency contract, observed prod state). Refactor default: one canonical path; delete the old path.
- Lean code: no internal shims, aliases, legacy names, broad fallbacks, or defensive branches just to reduce diff. Handle real production states; hypothetical malformed input gets none.
- Dynamic import: no static+dynamic import for same prod module. Use `*.runtime.ts` lazy boundary. After edits: `pnpm build`; check `[INEFFECTIVE_DYNAMIC_IMPORT]`.
- Cycles: keep `pnpm check:import-cycles` + architecture/madge green.
- Naming: **OpenClaw** product/docs; `openclaw` CLI/package/path/config. American spelling.

## Tests

- Vitest. Colocated `*.test.ts`; e2e `*.e2e.test.ts`; example models `sonnet-4.6`, `gpt-5.5`; test GPT with 5.5 preferred, 5.4 ok; no GPT-4.x agent-smoke defaults.
- Prefer behavior tests over workflow/docs string greps. Put operator policy reminders in AGENTS/docs.
- Clean timers/env/globals/mocks/sockets/temp dirs/module state; `--isolate=false` safe.
- Prefer injection and narrow `*.runtime.ts` mocks over broad barrels or `openclaw/plugin-sdk/*`.
- Do not edit baseline/inventory/ignore/snapshot/expected-failure files to silence checks without explicit approval.
- Do not run independent `pnpm test`/Vitest commands concurrently in one worktree; Vitest cache races with `ENOTEMPTY`. Group one command or use distinct `OPENCLAW_VITEST_FS_MODULE_CACHE_PATH`.
- Test workers max 16. Memory pressure: `OPENCLAW_VITEST_MAX_WORKERS=1 pnpm test`.
- Live: `OPENCLAW_LIVE_TEST=1 pnpm test:live`; verbose `OPENCLAW_LIVE_TEST_QUIET=0`.
- Guide: `docs/reference/test.md`.

## Docs / Changelog

- Use `$technical-documentation` for docs writing/review. Docs change with behavior/API.
- Codex harness upgrade (`extensions/codex/package.json` `@openai/codex`): refresh `docs/plugins/codex-harness.md` model snapshot from the new harness `model/list`.
- Docs final answers: include relevant full `https://docs.openclaw.ai/...` URL(s). If issue/PR work too, GitHub URL last.
- `CHANGELOG.md`: release-owned. Do not edit for normal PRs, direct `main` fixes, or `ship it`; only explicit release/changelog generation may rewrite it. Do not ask contributors/agents for changelog edits.
- User-facing `fix`/`feat`/`perf`: put release-note context in PR body, squash message, or direct commit: behavior, surface, issue/PR refs, credited human author/reporter.
- Release generation: derive `CHANGELOG.md` from merged PRs + all direct `main` commits. Entries: active `### Changes`/`### Fixes`, single-line, thank credited humans; never thank bots/forbidden handles: `@openclaw`, `@clawsweeper`, `@codex`, `@steipete`.

## Git

- Commit via `scripts/committer "<msg>" <file...>`; stage intended files only.
- Commits: conventional-ish, concise, grouped.
- No manual stash/autostash unless explicit. No branch/worktree changes unless requested.
- `main`: no merge commits; rebase on latest `origin/main` before push. After one green run plus clean rebase sanity, do not chase moving `main` with repeated full gates.
- User says `commit`: your changes only. `commit all`: all changes in grouped chunks. `push`: may `git pull --rebase` first.
- User says `ship it`: commit intended changes, pull --rebase, push.
- Do not delete/rename unexpected files; ask if blocking, else ignore.
- Bulk PR close/reopen >5: ask with count/scope.

## Security / Release

- Never commit real phone numbers, videos, credentials, live config.
- Secrets: channel/provider creds in `~/.openclaw/credentials/`; model auth profiles in `~/.openclaw/agents/<agentId>/agent/auth-profiles.json`.
- Dependency patches/overrides/vendor changes need explicit approval. `pnpm-workspace.yaml` patched dependencies use exact versions only.
- Lockfiles/shrinkwrap are security surface: review `pnpm-lock.yaml`, `npm-shrinkwrap.json`, `package-lock.json`; root/plugin npm packages ship shrinkwrap, not package-lock.
- Carbon pins owner-only: do not change `@buape/carbon` unless Shadow (`@thewilloftheshadow`, verified by `gh`) asks.
- Releases/publish/version bumps need explicit approval. Use `$release-openclaw-maintainer`.
- GHSA/advisories: `$openclaw-ghsa-maintainer` / `$security-triage`. Secret scanning: `$openclaw-secret-scanning-maintainer`.
- Beta tag/version match: `vYYYY.M.D-beta.N` -> npm `YYYY.M.D-beta.N --tag beta`.

## Platform / Ops

- Real devices before simulator/emulator testing. Platform-specific rules live in scoped guides and skills: macOS `$release-openclaw-maintainer` / `$openclaw-parallels-smoke` / `$parallels-discord-roundtrip`; ClawSweeper ops `$clawsweeper`.
- Rebrand/migration/config warnings: run `openclaw doctor`.
- Never edit `node_modules`. Local-only `.agents` ignores go in `.git/info/exclude`, not repo `.gitignore`.
- Provider tool schemas: prefer flat string enum helpers over `Type.Union([Type.Literal(...)])`; some providers reject `anyOf`.
- External messaging: no token-delta channel messages. Follow `docs/concepts/streaming.md`.

## Code Exploration

- Code navigation: prefer jcodemunch MCP tools (the server injects its own usage guide at connect); TS symbol navigation may also use typegraph MCP `ts_*` tools. `rg`/grep for non-TS assets, docs, and text search.
- `Read` is still required before `Edit`/`Write` (harness requirement); use MCP tools to find and understand code, then Read only the file being modified.
