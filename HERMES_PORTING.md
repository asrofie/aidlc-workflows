# Hermes Harness Port — AI-DLC

Catatan prosedur mem-port AI-DLC (aidlc-workflows) ke Hermes Agent agar bisa menjalankan `/aidlc` workflow dengan `aidlc --doctor` bersih.

## Status

- **Proyek referensi:** `C:\Projects\aidlc-workflows-main`
- **Hermes terdaftar sebagai harness:** `harness/hermes/` di sumber AI-DLC
- **Binary aidlc:** `C:\Users\USER\AppData\Local\aidlc\versions\2.11.1\aidlc.exe` (v2.11.1, direbuild dengan dukungan Hermes)
- **`aidlc --doctor`:** Machine 13/13 ok, Project 45/45 ok, Framework 12/12 ok, 0 masalah

## File yang dibuat di `harness/hermes/`

| File | Fungsi |
|------|--------|
| `manifest.ts` | Deklarasi harness untuk packager: `hookActivation`, `onboarding`, `rootIntegrations`, `coreDirs`, `harnessFiles`, `tierFlavor: "opencode"` |
| `onboarding.fills.ts` | Isi semua slot onboarding (`title_block`, `prereq_bullets`, `agents_note`, dst.) |
| `dot-gitignore` | `.gitignore` project-root: mengabaikan `.aidlc/` dan `.hermes/` |
| `rules-aidlc.md` | Stub aturan: `@import` ke `../../aidlc/active-memory/*.md` |
| `skills/aidlc/SKILL.md` | Orchestrator conductor skill (adaptasi dari Claude, `.claude/` → `.hermes/`) |
| `skills/aidlc/question-rendering.md` | Rendering pertanyaan terstruktur via `AskUserQuestion` |
| `skills/aidlc/composer.md` | Workflow komposer adaptif |
| `hooks/aidlc-hermes-adapter.ts` | Hook shim Hermes — 12 target: `session-start`, `audit-and-sensors`, `sync-workflow-state`, `rebuild-stage-graph`, `validate-state`, `log-subagent`, `continue-workflow`, `record-human-turn`, `state-transition-guard`, `reviewer-scope`, `review-freeze`, `deliver-stage-rules`, `plan-approval-guard`, `guard-tool-call` |

## Patch core source (5 file)

| File | Perubahannya |
|------|-------------|
| `core/tools/aidlc-init.ts` | `modelHarness()` terima `"hermes"` |
| `core/tools/aidlc-tiers.ts` | `hermes` ditambahkan ke `TierProjection` dan `TIER_PROJECTIONS` (3 tier: model null, variant null/medium/null) |
| `core/tools/aidlc-config-diagnostics.ts` | `hermes` dalam daftar supported harness |
| `core/tools/aidlc-model-policy.ts` | `hermes` dalam `HARNESS_HONESTY` (model: true, effort: true, groupEffort: true) |
| `core/tools/aidlc-settings.ts` | `hermes` dalam skema kunci model agen |

## Verifikasi packager

```bash
bun scripts/package.ts hermes
bun scripts/package.ts hermes --check
# → deterministic across two independent build(s) for hermes
```

## Instalasi binary aidlc

```bash
# Build dispatcher saja (lebih cepat dari build-binaries.ts penuh):
bun build dist-release/claude/.claude/tools/aidlc.ts --compile --no-compile-autoload-dotenv --no-compile-autoload-bunfig --outfile build/binaries/native/aidlc.exe

# Copy ke lokasi terinstall
cp build/binaries/native/aidlc.exe C:\Users\USER\AppData\Local\aidlc\versions\2.11.1\aidlc.exe
```

Update 3 checksum di `version.json` dan `installed-files.json` (asset `aidlc-windows-x64.exe`, `installedRuntime.sha256`, `installedFiles.sha256`), lalu tambahkan `hermes` ke `distributions[]` dan regenerasi `runtime-integrity.json`.

## Konfigurasi di proyek baru

```powershell
cd C:\path\proyek-lain
aidlc config --harness hermes
aidlc --doctor
```

Ini membuat `.hermes/` di root proyek. `NVIDIA_API_KEY` (sudah di-set di Hermes) berlaku di semua proyek — tidak perlu ulang per proyek.

## Konfigurasi shell hooks Hermes

Tambahkan ke `~/.hermes/config.yaml`:

```yaml
hooks:
  pre_tool_call:
  - command: "bun .hermes/hooks/aidlc-hermes-adapter.ts guard-tool-call"
    matcher: "terminal|write_file|patch|web_search|web_extract"
  post_tool_call:
  - command: "bun .hermes/hooks/aidlc-hermes-adapter.ts audit-and-sensors"
  - command: "bun .hermes/hooks/aidlc-hermes-adapter.ts sync-workflow-state"
  on_session_start:
  - command: "bun .hermes/hooks/aidlc-hermes-adapter.ts session-start"
  on_session_end:
  - command: "bun .hermes/hooks/aidlc-hermes-adapter.ts log-subagent"
```

Jalankan `hermes hooks doctor` untuk menyetujui setiap pasangan `(event, command)`. Untuk non-interaktif: `hooks_auto_accept: true` atau `HERMES_ACCEPT_HOOKS=1`.

## Sumber referensi

- `docs/harness-engineering/09-porting-to-a-new-harness.md` — kontrak manifest, hook adapter, emit.ts
- `docs/harness-engineering/00-overview.md` — panduan engineer harness
- `scripts/manifest-types.ts` — definisi tipe `HarnessManifest`
- `core/tools/onboarding.ts` — tipe `OnboardingFills` dan `renderOnboarding()`
- `harness/claude/manifest.ts` — referensi manifest minimal
- `harness/claude/onboarding.fills.ts` — referensi isi semua slot
- `harness/claude/hooks/aidlc-codex-adapter.ts` — referensi pola normalisasi payload hook

## Skill terkait

Skill `aidlc-harness-porting` tersedia di profil Hermes (`software-development/aidlc-harness-porting`) dengan prosedur generik untuk port ke harness apa pun.
