// harness/hermes/onboarding.fills.ts — Hermes slot/invoke fills for the
// neutral onboarding template (core/templates/onboarding.md).
//
// The packager concatenates onboarding-harness.md, filled here, then neutral
// onboarding in dist/hermes/ONBOARDING.md before transforming tokens.

import type { OnboardingFills } from "../../scripts/onboarding.ts";

const fills: OnboardingFills = {
  invoke: "/aidlc",
  slots: {
    frontmatter: "",
    title_block: `@.hermes/rules/aidlc.md

<!--
  The @-line above pulls the AIDLC method into Hermes's ambient context. It is
  the first hop of a reference chain: ONBOARDING.md imports @.hermes/rules/aidlc.md,
  which imports @../../aidlc/active-memory/*.md, AI-DLC's git-ignored copy of
  the active space's method that the engine refreshes at session start and on
  a space switch. The method is authored ONCE at the workspace root under
  aidlc/spaces/<space>/memory/ (org/team/project + phases/), so edit it there,
  never in .hermes/rules/aidlc.md and never in the copy.
-->

# AI-DLC

Your project's name, notes and rules go in \`aidlc/spaces/default/memory/project.md\`. Every AI tool in this project reads it.

This project uses AI-DLC (AI-Driven Development Life Cycle) for structured development. The workspace shell ships in \`.hermes/\` (no setup command); describe what you want to build and it sets up the workflow for you. Run \`/aidlc\` followed by a scope or project description to begin. Run \`/aidlc --doctor\` to validate your setup. Run \`/aidlc --version\` to print the framework version. Run \`/aidlc --stage <slug>\` to jump to a specific stage, \`/aidlc --phase <name>\` to jump to a phase, \`/aidlc --depth <level>\` to override depth, \`/aidlc --test-strategy <level>\` to override test volume, \`/aidlc --review <class>\` to cap stage reviews (adversarial, advisory, none). Run \`/aidlc compose "<task>"\` to get a plan tailored to that task (works up front, from a scan report via \`--report <path>\`, and mid-workflow to re-shape the pending stages - every proposal stops at an approve/edit/reject gate).`,
    prereq_bullets: `- **Runtime**: Framework commands run through \`{{INVOKE}}\`; keep that command and its runtime available.\n- **Model provider**: Hermes keeps your existing provider configuration. Run \`{{INVOKE}} config providers\` to record and validate a project provider choice.`,
    hook_permissions_note: `After copying the project shell, approve its hooks when Hermes prompts or through \`hermes hooks doctor\`, then fully restart Hermes; \`/clear\` is not enough. Hermes's shell hooks run via \`bun\` and each \`(event, command)\` pair needs first-use consent persisted to \`~/.hermes/shell-hooks-allowlist.json\`. For non-interactive runs set \`hooks_auto_accept: true\` or export \`HERMES_ACCEPT_HOOKS=1\`.`,
    prereq_bullets_tail: `- **Personal overrides**: Copy \`.hermes/settings.local.json.example\` to \`.hermes/settings.local.json\` (gitignored) to override the model or set environment variables without affecting shared settings; if that file already exists, add your keys to it.\n- **Status line**: AI-DLC's progress shows in your status line only when you choose it, in place of your own: setup asks once, and \`/aidlc --statusline on|off\` switches it any time. It is kept in your own settings file, so each teammate chooses.`,
    agents_note: `Each is a flat \`.md\` file prefixed \`aidlc-<role>-agent.md\`; the \`/aidlc\` session takes on each expert role itself where the stage calls for it, and hands work to a separate agent for the four delegated stages (2.1 pipeline, 2.2 subagent, 2.4 mob, 3.5 subagent), reviewer passes, and composer requests via the \`Task\` tool.`,
    structure_extra: "",
    sections_before_resumption: `## AI-DLC Method (imported)

The AI-DLC method — the layered practice files (\`org.md\`, \`team.md\`, \`project.md\`, and the per-phase \`phases/<phase>.md\`) — is authored once at the workspace root under \`aidlc/spaces/<active-space>/memory/\` and imported into Hermes's ambient context by reference (the \`@{{HARNESS_DIR}}/rules/aidlc.md\` import in this file), never copied. The shipped shell starts on \`default\`; switching spaces repoints that stub to the selected space. Edit the active space's memory files — they are the single hand-editable source of truth, identical on every harness. (AI-DLC's own stage resolver reads the same tree directly, so each stage is method-correct without this ambient import.)`,
    sections_after_resumption: `## Local settings

The shipped .gitignore block also ignores \`.hermes/settings.local.json\` (per-machine Hermes settings).`,
  },
};

export default fills;
