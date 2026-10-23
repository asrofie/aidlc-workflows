#!/usr/bin/env bun
// aidlc-hermes-adapter.ts — the Hermes hook shim (AUTHORED shell file; the
// aidlc-*.ts hook bodies beside it are PACKAGED core, byte-shared with the
// Claude Code harness). ONE shim normalizes the Hermes payload to the
// ClaudeCodeHookInput shape and subprocess-pipes into the named core hook,
// forwarding stdout/exit code.
//
// Hermes has three hook systems (shell hooks via ~/.hermes/config.yaml,
// plugin hooks via ctx.register_hook(), gateway hooks via ~/.hermes/hooks/).
// AI-DLC uses shell hooks because they run in CLI + Gateway + Desktop/TUI
// and can block via pre_tool_call with {"action":"block","message":str} —
// the same contract Claude Code's PreToolUse hooks use for AI-DLC's guards.
//
// Each (event, command) pair needs first-use consent persisted to
// ~/.hermes/shell-hooks-allowlist.json. Wire the adapter in ~/.hermes/config.yaml:
//
//   hooks:
//     pre_tool_call:
//     - command: "bun .hermes/hooks/aidlc-hermes-adapter.ts guard-tool-call"
//       matcher: "terminal|write_file|patch|web_search|web_extract"
//     post_tool_call:
//     - command: "bun .hermes/hooks/aidlc-hermes-adapter.ts audit-and-sensors"
//     - command: "bun .hermes/hooks/aidlc-hermes-adapter.ts sync-workflow-state"
//     on_session_start:
//     - command: "bun .hermes/hooks/aidlc-hermes-adapter.ts session-start"
//     on_session_end:
//     - command: "bun .hermes/hooks/aidlc-hermes-adapter.ts log-subagent"
//
// Usage:
//   bun .hermes/hooks/aidlc-hermes-adapter.ts <target> < stdin
// where <target> ∈ session-start | audit-and-sensors | sync-workflow-state |
//                  rebuild-stage-graph | validate-state | log-subagent |
//                  continue-workflow | record-human-turn |
//                  state-transition-guard | reviewer-scope | review-freeze |
//                  deliver-stage-rules | plan-approval-guard | guard-tool-call
//
// guard-tool-call is the one PreToolUse registration: it runs the four guards
// in this process, in this process. Every member runs even after one refuses;
// the call is refused when any member refuses.

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  collectHookOutput,
  emptyPickerResult,
  isNonAnswer,
  noteHelperSession,
  runHookHere,
  sessionsDir,
  stateFilePath,
  validSessionId,
} from "../tools/aidlc-lib.ts";

const HOOKS_DIR = dirname(fileURLToPath(import.meta.url));

interface HermesHookInput {
  hook_event_name?: string;
  session_id?: string;
  turn_id?: string;
  cwd?: string;
  source?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_response?: unknown;
  tool_use_id?: string;
  transcript_path?: string | null;
  agent_type?: string;
  agent_id?: string;
  stop_hook_active?: boolean;
  prompt?: string;
  user_prompt?: string;
  message?: string;
}

// --- Stdin read ---------------------------------------------------------------

let rawInput = "";
let hermes: HermesHookInput = {};
if (!process.stdin.isTTY) {
  try {
    rawInput = await Bun.stdin.text();
    if (rawInput.length > 0) hermes = JSON.parse(rawInput) as HermesHookInput;
  } catch {
    // malformed stdin — advisory hooks fail open
  }
}

// Project dir resolution (hermes may not set AIDLC_PROJECT_DIR yet).
const projectDirRaw =
  process.env.AIDLC_PROJECT_DIR ?? hermes.cwd ?? process.cwd();
const projectDir = isAbsolute(projectDirRaw)
  ? projectDirRaw
  : resolve(process.cwd(), projectDirRaw);
const payloadSessionId = validSessionId(hermes.session_id);
if (payloadSessionId) {
  process.env.AIDLC_SESSION_OVERRIDE = payloadSessionId;
  process.env.AIDLC_SESSION_OVERRIDE_SOURCE = "payload";
  const ownThread =
    typeof hermes.agent_id === "string"
      ? hermes.agent_id
      : rolloutThread(hermes.transcript_path);
  if (ownThread !== null) {
    noteHelperSession(projectDir, payloadSessionId, ownThread);
  }
}

const projectPins = {
  AIDLC_PROJECT_DIR: projectDir,
  CLAUDE_PROJECT_DIR: projectDir,
};
const projectEnv = { ...process.env, ...projectPins };

// --- Rollout / thread helpers -------------------------------------------------

function rolloutThread(transcriptPath: unknown): string | null {
  if (typeof transcriptPath !== "string") return null;
  const name = transcriptPath.split(/[\\/]/).pop() ?? "";
  return name.match(
    /^rollout-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:_[0-9a-f-]+)?\.jsonl(?:.[a-z0-9]+)?$/i,
  )?.[1]?.toLowerCase() ?? null;
}

function otherThreadInput(
  transcriptPath: unknown,
  sessionId: unknown,
): boolean {
  if (typeof sessionId !== "string" || !sessionId) return false;
  const thread = rolloutThread(transcriptPath);
  return thread !== null && thread.toLowerCase() !== sessionId.trim().toLowerCase();
}

// --- Core-hook subprocess plumbing --------------------------------------------

function runCore(
  hookFile: string,
  input: string,
): { stdout: string; code: number } {
  const executable = process.env.AIDLC_COMPILED_EXECUTABLE;
  const hook = hookFile.replace(/^aidlc-|\.ts$/g, "");
  const command = executable
    ? [executable, "engine", "hook", hook]
    : [process.execPath, join(HOOKS_DIR, "..", "tools", "aidlc.ts"), "engine", "hook", hook];
  const r = Bun.spawnSync(command, {
    stdin: Buffer.from(input, "utf-8"),
    stdout: "pipe",
    stderr: "ignore",
    cwd: projectDir,
    env: projectEnv,
  });
  return { stdout: r.stdout?.toString() ?? "", code: r.exitCode ?? 0 };
}

function runCoreWithStderr(
  hookFile: string,
  input: string,
): { stdout: string; stderr: string; code: number } {
  const executable = process.env.AIDLC_COMPILED_EXECUTABLE;
  const hook = hookFile.replace(/^aidlc-|\.ts$/g, "");
  const command = executable
    ? [executable, "engine", "hook", hook]
    : [process.execPath, join(HOOKS_DIR, "..", "tools", "aidlc.ts"), "engine", "hook", hook];
  const r = Bun.spawnSync(command, {
    stdin: Buffer.from(input, "utf-8"),
    stdout: "pipe",
    stderr: "pipe",
    cwd: projectDir,
    env: projectEnv,
  });
  return {
    stdout: r.stdout?.toString() ?? "",
    stderr: r.stderr?.toString() ?? "",
    code: r.exitCode ?? 0,
  };
}

async function runCoreHere(
  hookFile: string,
  input: string,
): Promise<{ stdout: string; stderr: string; code: number }> {
  return (
    (await runHookHere(join(HOOKS_DIR, hookFile), input, projectPins)) ??
    runCoreWithStderr(hookFile, input)
  );
}

// --- Targets ------------------------------------------------------------------

async function run(target: string): Promise<number> {
  switch (target) {
  case "session-start": {
    const fwd = JSON.stringify({
      hook_event_name: "SessionStart",
      source: hermes.source ?? "startup",
      ...(hermes.session_id ? { session_id: hermes.session_id } : {}),
      ...(typeof hermes.transcript_path === "string"
        ? { rollout_path: hermes.transcript_path }
        : {}),
    });
    const r = runCore("aidlc-session-start.ts", fwd);
    if (r.stdout) process.stdout.write(r.stdout);
    return 0;
  }

  case "audit-and-sensors": {
    const tool = hermes.tool_name ?? "";
    if (tool === "write_file" || tool === "patch") {
      const filePath =
        typeof hermes.tool_input?.file_path === "string"
          ? hermes.tool_input.file_path
          : typeof hermes.tool_input?.path === "string"
            ? hermes.tool_input.path
            : "";
      if (filePath) {
        const abs = isAbsolute(filePath)
          ? filePath
          : join(projectDir, filePath);
        const fwd = JSON.stringify({
          hook_event_name: "PostToolUse",
          tool_name: tool === "write_file" ? "Write" : "Edit",
          tool_input: { file_path: abs },
        });
        runCore("aidlc-write-audit-log.ts", fwd);
        runCore("aidlc-run-sensors.ts", fwd);
      }
    }
    return 0;
  }

  case "sync-workflow-state": {
    // Hermes tool_use_id / plan tool → PostToolUse TaskUpdate in_progress.
    const tool = hermes.tool_name ?? "";
    if (tool === "task" || tool === "update_plan") {
      const plan =
        (hermes.tool_input?.plan as Array<{ step?: string; status?: string }>) ??
        [];
      const active = plan.find((p) => p.status === "in_progress");
      if (active?.step) {
        const fwd = JSON.stringify({
          hook_event_name: "PostToolUse",
          tool_name: "TaskUpdate",
          tool_input: { status: "in_progress", activeForm: active.step },
        });
        runCore("aidlc-sync-workflow-state.ts", fwd);
      }
    }
    return 0;
  }

  case "rebuild-stage-graph": {
    const r = await runCoreHere("aidlc-rebuild-stage-graph.ts", rawInput);
    if (r.stdout) process.stdout.write(r.stdout);
    return 0;
  }

  case "validate-state": {
    runCore("aidlc-validate-state.ts", rawInput);
    return 0;
  }

  case "log-subagent": {
    runCore("aidlc-log-subagent.ts", rawInput);
    return 0;
  }

  case "continue-workflow": {
    const r = runCore("aidlc-continue-workflow.ts", rawInput);
    if (r.stdout) process.stdout.write(r.stdout);
    return r.code;
  }

  case "record-human-turn": {
    const selectionText =
      typeof hermes.tool_response === "string"
        ? explicitHumanSelectionText(hermes.tool_response)
        : "";
    const forwarded =
      hermes.tool_name === "request_user_input"
        ? {
            hook_event_name: "PostToolUse",
            ...(hermes.session_id ? { session_id: hermes.session_id } : {}),
            tool_name: "request_user_input",
            tool_input: hermes.tool_input,
            tool_response: { answer: selectionText },
            picker_reply: hermes.tool_response,
          }
        : {
            hook_event_name: "UserPromptSubmit",
            ...(hermes.session_id ? { session_id: hermes.session_id } : {}),
            prompt:
              hermes.prompt || hermes.user_prompt || hermes.message || "",
          };
    const turn = runCoreWithStderr(
      "aidlc-record-human-turn.ts",
      JSON.stringify(forwarded),
    );
    const context = wrapContext(turn.stdout, "UserPromptSubmit");
    if (context) process.stdout.write(context);
    return 0;
  }

  case "state-transition-guard": {
    if ((hermes.tool_name ?? "") === "terminal") {
      const r = await runCoreHere(
        "aidlc-state-transition-guard.ts",
        rawInput,
      );
      if (r.code === 2) {
        process.stderr.write(r.stderr);
        return 2;
      }
    }
    return 0;
  }

  case "reviewer-scope": {
    const tool = hermes.tool_name ?? "";
    if (tool === "terminal") {
      const r = await runCoreHere("aidlc-reviewer-scope.ts", rawInput);
      if (r.code === 2) {
        process.stderr.write(r.stderr);
        return 2;
      }
      return 0;
    }
    if (tool === "write_file" || tool === "patch") {
      const filePath =
        typeof hermes.tool_input?.file_path === "string"
          ? hermes.tool_input.file_path
          : typeof hermes.tool_input?.path === "string"
            ? hermes.tool_input.path
            : "";
      if (filePath) {
        const abs = isAbsolute(filePath)
          ? filePath
          : join(projectDir, filePath);
        const fwd = JSON.stringify({
          hook_event_name: "PreToolUse",
          tool_name: tool === "write_file" ? "Write" : "Edit",
          tool_input: { file_path: abs },
          ...(hermes.agent_type ? { agent_type: hermes.agent_type } : {}),
          ...(hermes.agent_id ? { agent_id: hermes.agent_id } : {}),
        });
        const r = await runCoreHere("aidlc-reviewer-scope.ts", fwd);
        if (r.code === 2) {
          process.stderr.write(r.stderr);
          return 2;
        }
      }
    }
    return 0;
  }

  case "review-freeze": {
    const tool = hermes.tool_name ?? "";
    if (tool === "terminal") {
      const r = await runCoreHere("aidlc-review-freeze.ts", rawInput);
      if (r.code === 2) {
        process.stderr.write(r.stderr);
        return 2;
      }
      return 0;
    }
    if (tool === "write_file" || tool === "patch") {
      const filePath =
        typeof hermes.tool_input?.file_path === "string"
          ? hermes.tool_input.file_path
          : typeof hermes.tool_input?.path === "string"
            ? hermes.tool_input.path
            : "";
      if (filePath) {
        const abs = isAbsolute(filePath)
          ? filePath
          : join(projectDir, filePath);
        const fwd = JSON.stringify({
          hook_event_name: "PreToolUse",
          tool_name: tool === "write_file" ? "Write" : "Edit",
          tool_input: { file_path: abs },
        });
        const r = await runCoreHere("aidlc-review-freeze.ts", fwd);
        if (r.code === 2) {
          process.stderr.write(r.stderr);
          return 2;
        }
      }
    }
    return 0;
  }

  case "deliver-stage-rules": {
    const r = runCoreWithStderr("aidlc-deliver-stage-rules.ts", rawInput);
    const stdout = r.code === 2 ? r.stdout : allowUpdatedInput(r.stdout);
    if (stdout) process.stdout.write(stdout);
    if (r.code === 2) {
      process.stderr.write(r.stderr);
      return 2;
    }
    return 0;
  }

  case "plan-approval-guard": {
    const tool = hermes.tool_name ?? "";
    if (tool === "terminal") {
      const r = await runCoreHere("aidlc-plan-approval-guard.ts", rawInput);
      if (r.code === 2) {
        process.stderr.write(r.stderr);
        return 2;
      }
      return 0;
    }
    if (tool === "write_file" || tool === "patch") {
      const filePath =
        typeof hermes.tool_input?.file_path === "string"
          ? hermes.tool_input.file_path
          : typeof hermes.tool_input?.path === "string"
            ? hermes.tool_input.path
            : "";
      if (filePath) {
        const abs = isAbsolute(filePath)
          ? filePath
          : join(projectDir, filePath);
        const fwd = JSON.stringify({
          hook_event_name: "PreToolUse",
          tool_name: tool === "write_file" ? "Write" : "Edit",
          tool_input: { file_path: abs },
          ...(payloadSessionId ? { session_id: payloadSessionId } : {}),
        });
        const r = await runCoreHere("aidlc-plan-approval-guard.ts", fwd);
        if (r.code === 2) {
          process.stderr.write(r.stderr);
          return 2;
        }
      }
    }
    return 0;
  }

  case "guard-tool-call": {
    // The one PreToolUse registration: the four guards run in order here.
    const members = [
      "state-transition-guard",
      "reviewer-scope",
      "review-freeze",
      "plan-approval-guard",
    ];
    let code = 0;
    let allowed = "";
    const refusals: string[] = [];
    for (const member of members) {
      const said = await collectHookOutput(() =>
        run(member, rawInput),
      );
      if (said.code === 2) {
        code = 2;
        if (said.stderr && !refusals.includes(said.stderr)) {
          refusals.push(said.stderr);
        }
      } else if (said.code === 0) {
        allowed += said.stdout;
      }
    }
    const stdout = code === 0 ? allowed : "";
    const stderr = refusals.join("");
    if (stdout) process.stdout.write(stdout);
    if (stderr) process.stderr.write(stderr);
    return code;
  }

  default:
    return 0;
  }
}

void collectHookOutput;
void emptyPickerResult;
void isNonAnswer;
void sessionsDir;
void stateFilePath;

function explicitHumanSelectionText(toolResponse: unknown): string {
  if (typeof toolResponse !== "string") return "";
  try {
    const parsed = JSON.parse(toolResponse) as {
      answers?: Record<string, { answers?: unknown[] }>;
    };
    for (const selection of Object.values(parsed.answers ?? {})) {
      for (const answer of selection.answers ?? []) {
        if (typeof answer === "string" && answer.trim()) return answer.trim();
      }
    }
  } catch {
    // non-structured prompt payloads use direct fields below
  }
  return "";
}

function wrapContext(coreStdout: string, eventName: string): string {
  try {
    const parsed = JSON.parse(coreStdout) as { additionalContext?: string };
    if (parsed.additionalContext) {
      return `${JSON.stringify({
        hookSpecificOutput: {
          hookEventName: eventName,
          additionalContext: parsed.additionalContext,
        },
      })}\n`;
    }
  } catch {
    // unparseable core output — pass through untouched
  }
  return coreStdout;
}

function allowUpdatedInput(coreStdout: string): string {
  try {
    const parsed = JSON.parse(coreStdout) as {
      hookSpecificOutput?: {
        hookEventName?: unknown;
        permissionDecision?: unknown;
        updatedInput?: unknown;
      };
    };
    const output = parsed.hookSpecificOutput;
    if (
      output?.hookEventName === "PreToolUse" &&
      output.updatedInput !== undefined &&
      output.permissionDecision === undefined
    ) {
      output.permissionDecision = "allow";
      return `${JSON.stringify(parsed)}\n`;
    }
  } catch {
    // unparseable core output is not a successful input rewrite
  }
  return coreStdout;
}

if (import.meta.main) {
  process.exit(await run(process.argv[2] ?? ""));
}

