// harness/hermes/manifest.ts — Hermes distribution row for AI-DLC.
//
// ONE CORE, MANY HARNESSES. This manifest tells scripts/package.ts how to
// project the harness-neutral core/ tree into dist/hermes/<harnessDir>/.
//
// Hermes is NOT yet a supported AI-DLC harness. This is a starter skeleton
// you must complete before `bun scripts/package.ts hermes` will generate a
// usable dist tree. See docs/harness-engineering/09-porting-to-a-new-harness.md.

import type { HarnessManifest } from "../../scripts/manifest-types.ts";
import onboardingFills from "./onboarding.fills.ts";

const manifest: HarnessManifest = {
  name: "hermes",
  productName: "Hermes",

  // Hermes has no VS Code terminal to probe; it is a desktop/CLI agent.
  // Set editorTerminalApp only if Hermes ships a VS Code-based editor
  // whose TERM_PROGRAM you can detect.
  editorTerminalApp: undefined,

  configNextStep:
    "open Hermes in this project and run `/aidlc --doctor`",

  // Hook activation guidance for Hermes.
  // Hermes has three hook systems (shell hooks via ~/.hermes/config.yaml,
  // plugin hooks via ctx.register_hook(), gateway hooks via ~/.hermes/hooks/).
  // AI-DLC's reviewer-scope, review-freeze, plan-approval, and state-transition
  // guards need a pre_tool_call-style blocking hook. Hermes shell hooks can
  // block via {"action": "block", "message": str} on pre_tool_call, but each
  // (event, command) pair needs first-use consent persisted to
  // ~/.hermes/shell-hooks-allowlist.json. Until a Hermes hook adapter
  // (harness/hermes/hooks/aidlc-hermes-adapter.ts) is wired into Hermes's
  // pre_tool_call / post_tool_call events, AI-DLC's guard hooks will not run.
  hookActivation: {
    recovery:
      "Add AI-DLC's shell hooks to this profile's ~/.hermes/config.yaml under " +
      "the hooks: block (pre_tool_call and post_tool_call entries pointing at " +
      "the Hermes hook adapter), then run `hermes hooks doctor` to verify " +
      "consent and allowlist status. For non-interactive runs set " +
      "hooks_auto_accept: true or export HERMES_ACCEPT_HOOKS=1 before starting " +
      "Hermes. Once the adapter is registered, exit Hermes and start it again " +
      "in this folder, then type <entry>.",
    agentStepEdits: "~/.hermes/config.yaml",
    notRunYet:
      "This is expected before your first Hermes chat in this folder with AI-DLC " +
      "hooks configured. Add the hook entries to ~/.hermes/config.yaml, run " +
      "`hermes hooks doctor` to approve them, then exit Hermes and start it " +
      "again in this folder. Then run doctor again.",
    agentStep:
      "Hermes is not running AI-DLC's hook adapter in this profile. First show " +
      "the person this line: \"Choose Yes when Hermes asks to approve the " +
      "AI-DLC hook command, then answer the question below.\" Then add the " +
      "pre_tool_call and post_tool_call shell-hook entries to " +
      "`~/.hermes/config.yaml` pointing at the Hermes hook adapter, keep every " +
      "other key as it is, and run `hermes hooks doctor`; Hermes asks the " +
      "person before it approves each new hook. It works in this chat: do not " +
      "ask for a restart and do not mention Hermes hook settings beyond the " +
      "config.yaml edit. Then run <next> and act on what it returns, so the " +
      "waiting question shows again. If it brings back this same message, the " +
      "hooks are still not approved: show this line instead and end your turn: " +
      "\"Hermes is still starting with AI-DLC hooks unapproved. Run `hermes " +
      "hooks doctor` to approve them, then start Hermes again in this folder " +
      "and type <entry>.\"",
    registration: {
      file: "~/.hermes/config.yaml",
      missing:
        "~/.hermes/config.yaml is missing from this profile, so Hermes runs " +
        "none of AI-DLC's hooks here. In a terminal, <repair>, then exit Hermes " +
        "and start it again in this folder, and type <entry>.",
      invalid:
        "Hermes cannot read this profile's ~/.hermes/config.yaml because it is " +
        "not valid YAML, so it runs none of AI-DLC's hooks here. Correct the " +
        "file, then exit Hermes and start it again in this folder, and type " +
        "<entry>.",
    },
  },

  harnessDir: ".hermes",

  // Root files emitted beside .hermes/ in the project root.
  rootIntegrations: [
    {
      path: ".gitignore",
      policy: "managed-block",
      marker: "gitignore",
      shared: "union",
      legacySignatures: {
        wholeFileHashes: [],
      },
    },
    {
      path: "ONBOARDING.md",
      policy: "managed-block",
      marker: "onboarding",
      shared: "union",
      legacySignatures: {
        wholeFileHashes: [],
      },
    },
  ],

  // Core directories projected into .hermes/. Hermes shares the same
  // methodology as Claude, so it keeps the same core dir names.
  coreDirs: [
    { src: "tools", dst: "tools" },
    { src: "aidlc-common", dst: "aidlc-common" },
    { src: "knowledge", dst: "knowledge" },
    { src: "sensors", dst: "sensors" },
    { src: "scopes", dst: "scopes" },
    { src: "agents", dst: "agents" },
    { src: "hooks", dst: "hooks" },
    { src: "skills/aidlc-session-cost", dst: "skills/aidlc-session-cost" },
    { src: "skills/aidlc-replay", dst: "skills/aidlc-replay" },
    { src: "skills/aidlc-outcomes-pack", dst: "skills/aidlc-outcomes-pack" },
    { src: "skills/aidlc-knowledge", dst: "skills/aidlc-knowledge" },
  ],

  // Authored harness surfaces copied into dist/hermes/.hermes/.
  // TODO: create these files under harness/hermes/ before packaging.
  harnessFiles: [
    { src: "dot-gitignore", dst: ".gitignore", projectRoot: true },
    { src: "skills/aidlc/SKILL.md", dst: "skills/aidlc/SKILL.md" },
    { src: "skills/aidlc/question-rendering.md", dst: "skills/aidlc/question-rendering.md" },
    { src: "skills/aidlc/composer.md", dst: "skills/aidlc/composer.md" },
    { src: "hooks/aidlc-hermes-adapter.ts", dst: "hooks/aidlc-hermes-adapter.ts" },
    { src: "rules-aidlc.md", dst: "rules/aidlc.md" },
  ],

  // Onboarding: neutral guidance + Hermes-specific setup.
  onboarding: { dst: "ONBOARDING.md", projectRoot: true, fills: onboardingFills },

  rulesRename: null,

  runnerFrontmatterAdditions: [],

  // Hermes is terminal-native like opencode. Pick the tier projection
  // flavor that best matches Hermes's model/effort surface:
  // "claude" | "codex" | "kiro" | "opencode" | "copilot" | "cursor"
  tierFlavor: "opencode",

  emit: null,

  plugin: undefined,
};

export default manifest;
