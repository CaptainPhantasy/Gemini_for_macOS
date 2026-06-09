/**
 * PEBKAC Defense Extension -- auto-installed by pebkac unboxing.
 * Do not edit. Re-run `pebkac init` to reinstall if deleted.
 */
// @bun
// packages/pebkac-harness/src/commands/flags.ts
import * as fs2 from "fs/promises";
import * as path from "path";

// packages/pebkac-harness/src/utils/dirs.ts
import * as fs from "fs";
function standardizeMacOSPath(p) {
  if (process.platform !== "darwin" || !p.startsWith("/private/"))
    return p;
  const stripped = p.slice("/private".length);
  try {
    if (fs.realpathSync(p) === fs.realpathSync(stripped)) {
      return stripped;
    }
  } catch {}
  return p;
}
var projectDir = standardizeMacOSPath(process.cwd());
function getProjectDir() {
  return projectDir;
}
// packages/pebkac-harness/src/utils/logger.ts
var isDebug = process.argv.includes("--debug") || process.argv.includes("-d");
// packages/pebkac-harness/src/commands/flags.ts
var FEATURE_FLAGS = [
  {
    name: "input_normalization",
    description: "Normalize and preprocess user input before agent execution",
    stage: "stable",
    enabled: true,
    default: true
  },
  {
    name: "evidence_contracts",
    description: "Generate evidence requirements for task completion",
    stage: "stable",
    enabled: true,
    default: true
  },
  {
    name: "phase_display",
    description: "Show visual phase indicators during execution",
    stage: "stable",
    enabled: true,
    default: true
  },
  {
    name: "loop_profiles",
    description: "Detect and apply appropriate execution pipelines",
    stage: "stable",
    enabled: true,
    default: true
  },
  {
    name: "interactive_tui",
    description: "Enable interactive TUI mode",
    stage: "beta",
    enabled: true,
    default: false
  },
  {
    name: "structured_logging",
    description: "Use structured JSON logging format",
    stage: "beta",
    enabled: true,
    default: false
  },
  {
    name: "session_resume",
    description: "Enable session persistence and resume",
    stage: "beta",
    enabled: true,
    default: false
  },
  {
    name: "update_notifier",
    description: "Check for updates on startup",
    stage: "stable",
    enabled: true,
    default: true
  },
  {
    name: "telemetry",
    description: "Anonymous usage telemetry",
    stage: "stable",
    enabled: false,
    default: false
  },
  {
    name: "ai_guardrails",
    description: "AI-powered guardrail suggestions",
    stage: "alpha",
    enabled: false,
    default: false
  },
  {
    name: "auto_fix",
    description: "Automatically fix common issues",
    stage: "alpha",
    enabled: false,
    default: false
  },
  {
    name: "harness_disabled",
    description: "Disable entire PEBKAC harness - bypass all enforcement layers and run vanilla oh-my-pi",
    stage: "stable",
    enabled: false,
    default: false
  }
];
function getFlagsPath(cwd) {
  return path.join(cwd, ".harness", "state", "feature-flags.json");
}
async function loadFeatureFlags(cwd) {
  const flagsPath = getFlagsPath(cwd);
  try {
    const raw = await fs2.readFile(flagsPath, "utf8");
    const data = JSON.parse(raw);
    return data.flags;
  } catch {
    return {};
  }
}
async function getFlag(name) {
  const cwd = getProjectDir() ?? process.cwd();
  const userFlags = await loadFeatureFlags(cwd);
  if (name in userFlags) {
    return userFlags[name];
  }
  const flag = FEATURE_FLAGS.find((f) => f.name === name);
  return flag?.default ?? false;
}
var FLAGS_ACTIONS = new Set(["list", "ls", "get", "show", "enable", "disable", "reset"]);

// packages/pebkac-harness/src/core/audit-log.ts
import * as fs3 from "fs/promises";
import * as path2 from "path";

class AuditLog {
  #filePath;
  constructor(cwd) {
    this.#filePath = path2.join(cwd, ".harness", "audit.log");
  }
  async init() {
    const dir = path2.dirname(this.#filePath);
    await fs3.mkdir(dir, { recursive: true });
    await fs3.appendFile(this.#filePath, "", "utf8");
  }
  async append(record) {
    const line = `${JSON.stringify(record)}
`;
    await fs3.appendFile(this.#filePath, line, "utf8");
  }
  async readAll() {
    try {
      const content = await fs3.readFile(this.#filePath, "utf8");
      return content.split(`
`).filter(Boolean).map((line) => JSON.parse(line));
    } catch (err) {
      if (err.code === "ENOENT")
        return [];
      throw err;
    }
  }
  get path() {
    return this.#filePath;
  }
}

// packages/pebkac-harness/src/core/checkpoint-manager.ts
import * as fs4 from "fs/promises";
import * as path3 from "path";
var DEFAULT_CHECKPOINT_DIR = ".harness/checkpoints";

class CheckpointManager {
  #state;
  #checkpointDir;
  #turnCount = 0;
  constructor(cwd) {
    this.#checkpointDir = path3.join(cwd, DEFAULT_CHECKPOINT_DIR);
    this.#state = this.#emptyState();
  }
  async init() {
    const loaded = await this.#loadLatest();
    if (loaded)
      this.#state = loaded;
  }
  getState() {
    return this.#state;
  }
  #emptyState() {
    return {
      workingApproaches: [],
      failedApproaches: [],
      pendingAmendments: [],
      identifiers: {},
      currentTask: null,
      evidenceSummary: [],
      itemStatuses: {},
      savedAt: Date.now(),
      turnCount: 0
    };
  }
  recordWorkingApproach(approach) {
    if (!this.#state.workingApproaches.includes(approach)) {
      this.#state.workingApproaches.push(approach);
    }
  }
  recordFailedApproach(approach, reason) {
    if (!this.#state.failedApproaches.some((f) => f.approach === approach)) {
      this.#state.failedApproaches.push({ approach, reason });
    }
  }
  addPendingAmendment(amendment) {
    if (!this.#state.pendingAmendments.includes(amendment)) {
      this.#state.pendingAmendments.push(amendment);
    }
  }
  getPendingAmendments() {
    return [...this.#state.pendingAmendments];
  }
  clearPendingAmendments() {
    this.#state.pendingAmendments = [];
  }
  storeIdentifier(key, value) {
    this.#state.identifiers[key] = value;
  }
  setCurrentTask(task) {
    this.#state.currentTask = task;
  }
  addEvidenceSummary(entry) {
    this.#state.evidenceSummary.push(entry);
    if (this.#state.evidenceSummary.length > 50) {
      this.#state.evidenceSummary = this.#state.evidenceSummary.slice(-50);
    }
  }
  tick() {
    this.#turnCount++;
    return this.#turnCount % 10 === 0;
  }
  async save() {
    this.#state.savedAt = Date.now();
    this.#state.turnCount = this.#turnCount;
    try {
      await fs4.mkdir(this.#checkpointDir, { recursive: true });
      const filepath = path3.join(this.#checkpointDir, "latest.json");
      await Bun.write(filepath, JSON.stringify(this.#state, null, 2));
      const backup = path3.join(this.#checkpointDir, `checkpoint-${Date.now()}.json`);
      await Bun.write(backup, JSON.stringify(this.#state, null, 2));
      await this.#pruneBackups();
    } catch (err) {
      console.error("[PEBKAC checkpoint] save failed:", err instanceof Error ? err.message : String(err));
    }
  }
  async#loadLatest() {
    try {
      const filepath = path3.join(this.#checkpointDir, "latest.json");
      return await Bun.file(filepath).json();
    } catch (err) {
      const code = err.code;
      if (code === "ENOENT")
        return null;
      console.error("[PEBKAC checkpoint] corrupt checkpoint, starting fresh:", err instanceof Error ? err.message : String(err));
      return null;
    }
  }
  buildRecoveryInjection() {
    const parts = [];
    parts.push("## POST-COMPACTION RECOVERY (from PEBKAC checkpoint)");
    parts.push("");
    if (this.#state.currentTask) {
      parts.push(`### Current Task
${this.#state.currentTask}`);
      parts.push("");
    }
    if (this.#state.failedApproaches.length > 0) {
      parts.push("### DO NOT RE-ATTEMPT (known failures)");
      for (const { approach, reason } of this.#state.failedApproaches) {
        parts.push(`- \u274C ${approach}: ${reason}`);
      }
      parts.push("");
    }
    if (this.#state.workingApproaches.length > 0) {
      parts.push("### WORKING APPROACHES (verified)");
      for (const approach of this.#state.workingApproaches) {
        parts.push(`- \u2705 ${approach}`);
      }
      parts.push("");
    }
    if (Object.keys(this.#state.identifiers).length > 0) {
      parts.push("### CRITICAL IDENTIFIERS");
      for (const [key, value] of Object.entries(this.#state.identifiers)) {
        parts.push(`- ${key}: ${value}`);
      }
      parts.push("");
    }
    if (this.#state.evidenceSummary.length > 0) {
      parts.push("### EVIDENCE TRAIL (last actions)");
      for (const entry of this.#state.evidenceSummary.slice(-10)) {
        parts.push(`- ${entry}`);
      }
    }
    return parts.join(`
`);
  }
  async#pruneBackups() {
    try {
      const files = (await fs4.readdir(this.#checkpointDir)).filter((f) => f.startsWith("checkpoint-") && f.endsWith(".json")).sort().reverse();
      for (const file of files.slice(10)) {
        await fs4.unlink(path3.join(this.#checkpointDir, file));
      }
    } catch {}
  }
  setItemStatus(itemId, status) {
    this.#state.itemStatuses[itemId] = status;
  }
  getItemStatus(itemId) {
    return this.#state.itemStatuses[itemId];
  }
  getAllItemStatuses() {
    return { ...this.#state.itemStatuses };
  }
}

// packages/pebkac-harness/src/core/circuit-breaker.ts
class CircuitBreaker {
  #state = "closed";
  #openReason = "";
  trip(reason) {
    if (this.#state === "closed") {
      this.#state = "open";
      this.#openReason = reason;
    }
  }
  recordEvidence() {
    if (this.#state === "open" || this.#state === "half-open") {
      this.#state = "closed";
      this.#openReason = "";
    }
  }
  halfOpen() {
    if (this.#state === "open") {
      this.#state = "half-open";
    }
  }
  get state() {
    return this.#state;
  }
  get isOpen() {
    return this.#state === "open";
  }
  get reason() {
    return this.#openReason;
  }
  buildCorrectionMessage() {
    return "[PEBKAC CIRCUIT BREAKER] Session quality has degraded. " + `Reason: ${this.#openReason}. ` + "Before continuing, you MUST: " + "(1) Show concrete evidence for your most recent action, " + "(2) Run a verification command and show its output, " + "(3) Only then resume normal operation.";
  }
}

// packages/pebkac-harness/src/core/conflict-detector.ts
var CONTRADICTION_PAIRS = [
  { a: /\bmust\s+(?:always\s+)?use\s+(\w+)/i, b: /\bmust\s+(?:not|never)\s+use\s+(\w+)/i },
  { a: /\bno\s+(?:web|internet|network)/i, b: /\b(?:always|must)\s+(?:self[- ])?ground/i },
  { a: /\boffline\s+only/i, b: /\bfetch|web[- ]?search|grounding/i }
];
function detectConflicts(rules) {
  const conflicts = [];
  for (const rule of rules) {
    for (const otherRule of rules) {
      if (rule === otherRule)
        continue;
      for (const pair of CONTRADICTION_PAIRS) {
        const matchA = pair.a.test(rule);
        const matchB = pair.b.test(otherRule);
        if (matchA && matchB) {
          conflicts.push({
            ruleA: rule,
            ruleB: otherRule,
            type: "logical_contradiction",
            resolution: "Precedence: harness safety > user preference. The safety constraint wins."
          });
        }
      }
    }
  }
  const unique = new Map;
  for (const c of conflicts) {
    const key = [c.ruleA, c.ruleB].sort().join("|||");
    if (!unique.has(key))
      unique.set(key, c);
  }
  const deduped = Array.from(unique.values());
  return {
    hasConflicts: deduped.length > 0,
    conflicts: deduped,
    resolution: deduped.length > 0 ? deduped.every((c) => c.resolution) ? "auto_resolved" : "rejected" : "none"
  };
}

// packages/pebkac-harness/src/core/contract-compiler.ts
var DEFAULT_FORBIDDEN_BEHAVIORS = [
  {
    id: "fb-1",
    description: 'Declare "done" without evidence for each requested item',
    consequence: "Immediate halt. Evidence required for all items. Task marked INCOMPLETE."
  },
  {
    id: "fb-2",
    description: 'Say "tests passed" without running the actual test command',
    consequence: "Status reverted to IN_PROGRESS. Must run tests and show output."
  },
  {
    id: "fb-3",
    description: 'Say "verified" without showing verification output',
    consequence: "Verification claim rejected. Must show command + output."
  },
  {
    id: "fb-4",
    description: "Skip a failed step without explicit BLOCKED status",
    consequence: "Silent skips detected. Must report BLOCKED with blocker details."
  },
  {
    id: "fb-5",
    description: "Collapse multiple items into one vague summary",
    consequence: "Summary rejected. Must provide per-item evidence ledger."
  },
  {
    id: "fb-6",
    description: 'Use "mostly done" -- only COMPLETE or BLOCKED allowed',
    consequence: "Ambiguous status rejected. Pick COMPLETE (with evidence) or BLOCKED (with reason)."
  },
  {
    id: "fb-7",
    description: "Continue past a BLOCKED item without reporting it",
    consequence: "Unreported blocker detected. Must surface before proceeding."
  },
  {
    id: "fb-8",
    description: "Run destructive git commands (reset --hard, clean -fd, force push) without explicit user confirmation",
    consequence: "Command blocked. Destructive operations require confirmation."
  }
];
var NUMBERED_ITEM = /^\s*(\d+)[.)]\s+(.+)/;
var BULLET_ITEM = /^\s*[-*]\s+(.+)/;
var GROUNDING_TRIGGERS = [/\b\d{4}\b/, /\bversion\b/i, /\bsecurity\b/i, /\bpric/i, /\bCVE\b/, /\bdeprecated\b/i];
function compileContract(taskDescription) {
  if (!taskDescription || taskDescription.trim().length === 0)
    return null;
  const lines = taskDescription.split(`
`);
  const items = [];
  let itemCounter = 0;
  for (const line of lines) {
    const numberedMatch = NUMBERED_ITEM.exec(line);
    const bulletMatch = BULLET_ITEM.exec(line);
    const description = numberedMatch ? numberedMatch[2].trim() : bulletMatch ? bulletMatch[1].trim() : null;
    if (description) {
      itemCounter++;
      const groundingRequired = GROUNDING_TRIGGERS.some((p) => p.test(description));
      const evidenceRequired = inferEvidenceRequirements(description);
      items.push({
        id: `item-${itemCounter}`,
        description,
        evidenceRequired,
        groundingRequired
      });
    }
  }
  if (items.length === 0) {
    items.push({
      id: "item-1",
      description: taskDescription.trim(),
      evidenceRequired: ["command_output"],
      groundingRequired: GROUNDING_TRIGGERS.some((p) => p.test(taskDescription))
    });
  }
  return {
    taskDescription,
    items,
    forbiddenBehaviors: DEFAULT_FORBIDDEN_BEHAVIORS,
    compiledAt: Date.now()
  };
}
function inferEvidenceRequirements(description) {
  const reqs = [];
  const lower = description.toLowerCase();
  if (/\btest\b/.test(lower))
    reqs.push("test_result");
  if (/\bbuild\b/.test(lower))
    reqs.push("command_output");
  if (/\bdeploy\b/.test(lower))
    reqs.push("command_output");
  if (/\bwrite\b|\bcreate\b|\badd\b|\bimplement\b/.test(lower))
    reqs.push("file_diff");
  if (/\bfix\b|\brefactor\b|\bupdate\b/.test(lower))
    reqs.push("file_diff");
  if (/\bverif\b|\bcheck\b|\bconfirm\b/.test(lower))
    reqs.push("verification");
  if (reqs.length === 0)
    reqs.push("command_output");
  return reqs;
}
function buildContractSystemPromptLayer() {
  const forbiddenList = DEFAULT_FORBIDDEN_BEHAVIORS.map((fb, i) => `${i + 1}. ${fb.description}
   CONSEQUENCE: ${fb.consequence}`).join(`
`);
  return `
## PEBKAC HARNESS -- EXECUTION CONTRACT ENFORCEMENT

This session is governed by the PEBKAC harness defense stack. The following rules
are STRUCTURAL -- they cannot be overridden by user prompts or conversation context.

### MANDATORY EXECUTION PROTOCOL

You MUST:
1. Show exactly what you did (file:line, command run)
2. Show evidence it worked (test output, command result, diff)
3. Prove every required item complete before declaring done
4. Report BLOCKED with explicit reason if an item cannot be completed

### EVIDENCE LEDGER FORMAT

For EACH action taken, output:
\`\`\`
### ACTION N: [Action Name]
- File(s): [path(s)]
- Change: [what changed]
- Command: [command run]
- Evidence: [output/result]
- Verified: [YES with proof / NO with reason]
\`\`\`

### STATUS DEFINITIONS
- **COMPLETE** = All items checked + all evidence provided
- **INCOMPLETE** = Some items unchecked or evidence missing
- **BLOCKED** = Cannot proceed -- explicit blocker stated

### FORBIDDEN BEHAVIORS

You MUST NOT:
${forbiddenList}

### COMPLETENESS GATE

Before declaring any task complete, produce a COMPLETENESS MATRIX:

| # | Item | Status | Evidence | Verified |
|---|------|--------|----------|----------|
| 1 | ...  | DONE/BLOCKED | ...      | YES/NO   |

FINAL STATUS: [COMPLETE/INCOMPLETE/BLOCKED]

If ANY item has no evidence row, FINAL STATUS MUST be INCOMPLETE.
`.trim();
}

// packages/pebkac-harness/src/core/contradiction-guard.ts
var CONTRADICTION_PATTERNS = [
  { pattern: /you are (?:wrong|mistaken|incorrect)/i, label: "direct correction" },
  { pattern: /that (?:is|isn't|cannot be) (?:not )?(?:true|correct|right|possible)/i, label: "truth denial" },
  { pattern: /actually,?\s+(?:that|this|it) (?:is|was|will be)/i, label: "factual override" },
  { pattern: /I (?:must|have to) (?:correct|disagree)/i, label: "explicit disagreement" },
  { pattern: /no,?\s+(?:that's|it's|this is) (?:not|wrong|incorrect)/i, label: "negation" },
  { pattern: /contrary to (?:what you|your)/i, label: "contrary claim" }
];
function detectContradiction(output) {
  for (const { pattern, label } of CONTRADICTION_PATTERNS) {
    const match = pattern.exec(output);
    if (match) {
      return {
        isContradiction: true,
        confidence: 0.8,
        fragment: match[0],
        label
      };
    }
  }
  return { isContradiction: false, confidence: 0 };
}
function rewriteContradiction(originalText, fragment) {
  const hedge = "[PEBKAC: My training data may be outdated on this point. " + "Rather than contradict you directly, I should verify with a current source. " + "Can you confirm, or shall I check?]";
  return originalText.replace(fragment, hedge);
}

// packages/pebkac-harness/src/core/degradation-scorer.ts
var THRESHOLD = 0.7;
function scoreDegradation(metrics) {
  let score = 0;
  const reasons = [];
  if (metrics.ceremonyRatio > 0.5) {
    score += 0.3;
    reasons.push(`ceremony ratio ${(metrics.ceremonyRatio * 100).toFixed(0)}%`);
  }
  if (metrics.turnsWithoutEvidence > 3) {
    score += 0.4;
    reasons.push(`${metrics.turnsWithoutEvidence} turns without evidence`);
  }
  if (metrics.failedToolCalls > 5) {
    score += 0.2;
    reasons.push(`${metrics.failedToolCalls} failed tool calls`);
  }
  if (metrics.compactionsSinceCheckpoint > 0) {
    score += 0.1;
    reasons.push("compacted without checkpoint recovery");
  }
  return {
    score: Math.min(score, 1),
    threshold: score >= THRESHOLD,
    reason: reasons.length > 0 ? `Degradation detected: ${reasons.join(", ")}` : undefined
  };
}

// packages/pebkac-harness/src/core/evidence-enforcer.ts
var CEREMONIAL_PATTERNS = [
  /tests?\s+pass(ed|ing)?/i,
  /verified?\s+(that|the|it)?/i,
  /confirm(ed|s)?\s+(that|the|it)?/i,
  /everything\s+(looks?\s+)?good/i,
  /all\s+(checks?\s+)?pass(ed|ing)?/i,
  /done\.?\s*$/i,
  /complet(ed|e)\.?\s*$/i
];
var EVIDENCE_PATTERNS = [
  /\$\s+\w+/,
  /\d+\s+(pass(ed|ing)?|fail(ed|ing)?)/i,
  /\u2713|\u2705|PASS/,
  /\u2717|\u274C|FAIL/,
  /^[+-]\s/m,
  /error\s*\[|warning\s*\[/i,
  /\bat\s+\S+:\d+/,
  /exit\s*code:?\s*\d+/i
];

class EvidenceEnforcer {
  #ledger;
  #turnEvidenceCount = 0;
  #turnClaimCount = 0;
  #itemStatuses = new Map;
  constructor(taskId = "default") {
    this.#ledger = {
      taskId,
      records: [],
      createdAt: Date.now(),
      lastUpdated: Date.now()
    };
  }
  hasSubstantiveEvidence(output) {
    return EVIDENCE_PATTERNS.some((p) => p.test(output));
  }
  detectCeremonialization(output) {
    const hasCeremonialClaim = CEREMONIAL_PATTERNS.some((p) => p.test(output));
    const hasActualEvidence = this.hasSubstantiveEvidence(output);
    if (hasCeremonialClaim && !hasActualEvidence) {
      return {
        ceremonial: true,
        reason: "Completion claim detected without substantive evidence. " + "Show actual command output, test results, or file diffs."
      };
    }
    return { ceremonial: false };
  }
  requestTransition(itemId, toStatus) {
    if (toStatus === "complete") {
      const itemEvidence = this.#ledger.records.filter((r) => r.itemId === itemId && r.verified);
      if (itemEvidence.length === 0) {
        return {
          allowed: false,
          reason: `BLOCKED: Cannot transition item "${itemId}" to complete without verified evidence. ` + "Show concrete evidence (command output, test results, file diffs) before marking complete.",
          requiredEvidence: "At least one verified evidence record for this item"
        };
      }
    }
    this.#itemStatuses.set(itemId, toStatus);
    return { allowed: true, reason: `Transition to ${toStatus} allowed` };
  }
  recordEvidence(record) {
    this.#ledger.records.push(record);
    this.#ledger.lastUpdated = Date.now();
    this.#turnEvidenceCount++;
  }
  recordClaim() {
    this.#turnClaimCount++;
  }
  getCeremonyRatio() {
    if (this.#turnClaimCount === 0)
      return 0;
    return 1 - this.#turnEvidenceCount / this.#turnClaimCount;
  }
  resetTurnCounters() {
    this.#turnEvidenceCount = 0;
    this.#turnClaimCount = 0;
  }
  getLedger() {
    return { ...this.#ledger, records: [...this.#ledger.records] };
  }
  getUnsubstantiatedClaims() {
    const verifiedItems = new Set(this.#ledger.records.filter((r) => r.verified).map((r) => r.itemId));
    const allItems = new Set([...this.#ledger.records.map((r) => r.itemId), ...this.#itemStatuses.keys()]);
    return Array.from(allItems).filter((id) => !verifiedItems.has(id));
  }
  get turnEvidenceCount() {
    return this.#turnEvidenceCount;
  }
}

// packages/pebkac-harness/src/core/flare-planner.ts
function buildFlarePlanningInjection() {
  return [
    "### FLARE PLANNING REQUIRED",
    "",
    "Before implementing, produce a FLARE plan:",
    "1. List each step with confidence level (high/medium/low)",
    "2. For each medium/low step, identify what information you need",
    "3. Gather that information FIRST (web search, code search, doc read)",
    "4. Revise the plan based on findings",
    "5. Only then begin implementation",
    "",
    "Attempting to execute (bash, write, edit) without resolving",
    "low-confidence uncertainties will be BLOCKED."
  ].join(`
`);
}

// packages/pebkac-harness/src/core/git-guard.ts
var DESTRUCTIVE_COMMANDS = [
  { pattern: /git\s+reset\s+--hard/, risk: "Destroys all uncommitted changes", severity: "critical" },
  { pattern: /git\s+clean\s+-[fd]+/, risk: "Permanently deletes untracked files", severity: "critical" },
  { pattern: /git\s+checkout\s+--\s*\./, risk: "Discards all unstaged changes", severity: "critical" },
  { pattern: /git\s+push\s+.*--force(?!-with-lease)/, risk: "Overwrites remote history", severity: "critical" },
  { pattern: /git\s+push\s+-f\b/, risk: "Overwrites remote history", severity: "critical" },
  { pattern: /git\s+reflog\s+expire/, risk: "Destroys recovery data", severity: "critical" },
  { pattern: /git\s+branch\s+-D\s/, risk: "Force-deletes branch regardless of merge status", severity: "high" },
  { pattern: /git\s+stash\s+drop/, risk: "Permanently deletes stashed changes", severity: "medium" },
  { pattern: /git\s+rebase\s+(?!--(abort|continue|skip)\b)/, risk: "Rewrites commit history", severity: "medium" },
  { pattern: /rm\s+-rf?\s+\.git/, risk: "Destroys entire repository", severity: "critical" }
];
var HOOK_BYPASS_PATTERNS = [/--no-verify/, /-n\s/];
function evaluateGitCommand(command) {
  const trimmed = command.trim();
  for (const { pattern, risk, severity } of DESTRUCTIVE_COMMANDS) {
    if (pattern.test(trimmed)) {
      const alternatives = getAlternatives(trimmed);
      return {
        blocked: true,
        reason: `BLOCKED by Git Guard: ${risk}. ` + `Command: "${trimmed}". ` + "This operation can cause irreversible data loss. " + (alternatives.length > 0 ? `Safer alternatives: ${alternatives.join(", ")}` : "Ask the user for explicit confirmation if this is intentional."),
        severity,
        alternatives
      };
    }
  }
  for (const pattern of HOOK_BYPASS_PATTERNS) {
    if (pattern.test(trimmed) && /git\s+(commit|push|merge)/.test(trimmed)) {
      return {
        blocked: true,
        reason: `BLOCKED by Git Guard: --no-verify bypasses git hooks. ` + "Pre-commit hooks exist for a reason. Remove --no-verify flag.",
        severity: "high"
      };
    }
  }
  return { blocked: false };
}
function getAlternatives(command) {
  if (/git\s+reset\s+--hard/.test(command)) {
    return [
      "git stash (to save changes before reset)",
      "git reset --soft (keeps changes staged)",
      "git checkout <file> (reset specific file only)"
    ];
  }
  if (/git\s+push.*--force/.test(command)) {
    return ["git push --force-with-lease (safer \u2014 checks remote first)"];
  }
  if (/git\s+clean/.test(command)) {
    return [
      "git clean -n (dry run first to see what would be deleted)",
      "git stash --include-untracked (save untracked files instead)"
    ];
  }
  if (/git\s+branch\s+-D/.test(command)) {
    return ["git branch -d (lowercase d \u2014 only deletes if merged)"];
  }
  return [];
}

// packages/pebkac-harness/src/core/input-normalizer.ts
var INTENT_PATTERNS = {
  implementation: [/\b(create|build|implement|add|mak[ee]|writ[ei])\b/i, /\bfix\b.*\bbug\b/i, /\bupdate\b.*\bcode\b/i],
  investigation: [/\b(fix|debug|investigate|diagnos|troubleshoot)\b/i, /\b(find|search|grep|look).*\b(up|for)\b/i],
  refactoring: [
    /\b(refactor|restructure|reorgani[sz]|clean)\b/i,
    /\b(extract|inline|mov[ei])\b.*\b(method|function|class)\b/i
  ],
  testing: [/\b(test|spec|unit|integ[eration]|e2e)\b/i, /\b(run|execut[ei])\b.*\b(spec|test)\b/i],
  documentation: [/\b(doc|comment|readme|guide)\b/i, /\b(write|creat[ei])\b.*\b(docs?|document)\b/i, /\bdocs?\b/i],
  deployment: [/\b(deploy|release|publish|ship)\b/i, /\b(build|packag[ei])\b.*\b(docker|container|image)\b/i],
  analysis: [/\b(anal[ysi]|inspect|review|audit)\b/i, /\b(profile|benchmark|measur[ei])\b/i],
  unknown: []
};
var LOOP_PROFILE_PATTERNS = {
  "single-pass": [/^(?:show|list|get|view|check)\b/i, /\b(one.?shot|single)\b/i],
  loop: [/\b(loop|iterat|repeat|again)\b/i, /\b(fix|update|change|modif[yi])\b.*\buntil\b/i],
  "eval-first": [/\b(?:must|should).*test\b/i, /\b(test.?first|tdd|bdd)\b/i, /\b(run|execut[ei]).*verif/i],
  complex: [/\b(multi|complex|large|big)\b/i, /\b(phase|step|stag[ei])\b.*\b\d+\b/i, /\b(plan|design|architect)\b/i]
};
var FILE_PATH_PATTERN = /(?:[a-zA-Z]:\\)?(?:[./]?(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9]+)?)/g;
var GLOB_PATTERN = /[*?[\]{}]/g;
var CONSTRAINT_INDICATORS = [
  /(?:must|should|require|need|mandatory)\s+(?:be\s+)?(.+?)(?:\.|,|$)/gi,
  /(?:only|except|excluding?)\s+(.+?)(?:\.|,|$)/gi,
  /(?:without|no|never)\s+(.+?)(?:\.|,|$)/gi
];
function normalizeInput(input) {
  const trimmed = input.trim();
  const normalizedAt = Date.now();
  const cleaned = cleanedInput(trimmed);
  const intent = detectIntent(cleaned);
  const loopProfile = detectLoopProfile(cleaned);
  const identifiers = extractIdentifiers(cleaned);
  const constraints = extractConstraints(cleaned);
  const contract = compileContract(cleaned);
  return {
    command: cleaned,
    intent,
    loopProfile,
    contract,
    identifiers,
    constraints,
    original: input,
    normalizedAt
  };
}
function cleanedInput(input) {
  return input.replace(/\s+/g, " ").replace(/[""]/g, '"').replace(/['']/g, "'").replace(/[\u2013\u2014]/g, "-").replace(/[.,;:!]$/, "").trim();
}
function detectIntent(input) {
  for (const [intent, patterns] of Object.entries(INTENT_PATTERNS)) {
    if (intent === "unknown")
      continue;
    for (const pattern of patterns) {
      if (pattern.test(input)) {
        return intent;
      }
    }
  }
  return "unknown";
}
function detectLoopProfile(input) {
  for (const [profile, patterns] of Object.entries(LOOP_PROFILE_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(input)) {
        return profile;
      }
    }
  }
  if (input.length > 500)
    return "complex";
  if (input.includes("test") || input.includes("verify"))
    return "eval-first";
  return "loop";
}
function extractIdentifiers(input) {
  const matches = input.match(FILE_PATH_PATTERN) || [];
  return Array.from(new Set(matches.filter((m) => !m.match(GLOB_PATTERN))));
}
function extractConstraints(input) {
  const constraints = [];
  for (const pattern of CONSTRAINT_INDICATORS) {
    pattern.lastIndex = 0;
    let match = null;
    do {
      match = pattern.exec(input);
      if (match !== null) {
        if (match[0].length === 0) {
          pattern.lastIndex++;
          continue;
        }
        const extracted = match[1].trim();
        if (extracted.length > 3 && extracted.length < 200) {
          constraints.push(extracted);
        }
      }
    } while (match !== null);
  }
  return Array.from(new Set(constraints));
}
function generateEvidenceContract(input) {
  const requirements = [];
  requirements.push({
    id: "cmd-output",
    description: "Show command execution output",
    requiredFor: ["all"]
  });
  if (input.intent === "implementation") {
    requirements.push({
      id: "code-changes",
      description: "Show diff or new file content",
      requiredFor: ["implementation"]
    });
  }
  if (input.intent === "testing") {
    requirements.push({
      id: "test-results",
      description: "Show test pass/fail output",
      requiredFor: ["testing"]
    });
  }
  if (input.intent === "refactoring") {
    requirements.push({
      id: "before-after",
      description: "Show code before and after refactor",
      requiredFor: ["refactoring"]
    });
  }
  for (const identifier of input.identifiers) {
    requirements.push({
      id: `file:${identifier}`,
      description: `Evidence related to: ${identifier}`,
      requiredFor: ["specific"],
      scope: identifier
    });
  }
  return requirements;
}

// packages/pebkac-harness/src/core/lifecycle.ts
var PHASE_POLICIES = [
  {
    phase: "planning",
    allowed: new Set(["read", "grep", "find", "web_search", "fetch"]),
    blocked: new Set(["bash", "write", "edit", "notebook"]),
    blockReason: "Execution tools are blocked during planning phase. Complete your FLARE plan first, then transition to implementation."
  },
  {
    phase: "review",
    allowed: new Set(["read", "grep", "find", "bash"]),
    blocked: new Set(["write", "edit", "notebook"]),
    blockReason: "File modification is blocked during review phase. Complete the review before making changes."
  }
];
function checkToolPolicy(phase, toolName) {
  const policy = PHASE_POLICIES.find((p) => p.phase === phase);
  if (!policy)
    return { allowed: true };
  if (policy.blocked.has(toolName)) {
    return { allowed: false, reason: policy.blockReason };
  }
  return { allowed: true };
}
function inferPhase(messageCount, hasFlareplan) {
  if (messageCount < 4 && !hasFlareplan)
    return "planning";
  return;
}

// packages/pebkac-harness/src/core/loop-orchestrator.ts
class SequentialPipeline {
  #stages;
  #results = [];
  #currentIndex = 0;
  constructor(stages) {
    this.#stages = stages;
  }
  get currentStage() {
    return this.#stages[this.#currentIndex];
  }
  get isComplete() {
    return this.#currentIndex >= this.#stages.length;
  }
  get results() {
    return [...this.#results];
  }
  completeStage(evidence) {
    const stage = this.#stages[this.#currentIndex];
    if (!stage) {
      return { stageId: "none", status: "blocked", evidence: [], blockerReason: "No more stages" };
    }
    const missing = stage.evidenceRequired.filter((req) => !evidence.some((e) => e.includes(req)));
    if (missing.length > 0) {
      const result2 = {
        stageId: stage.id,
        status: "blocked",
        evidence,
        blockerReason: `Missing evidence: ${missing.join(", ")}`
      };
      this.#results.push(result2);
      return result2;
    }
    const result = {
      stageId: stage.id,
      status: "complete",
      evidence
    };
    this.#results.push(result);
    this.#currentIndex++;
    return result;
  }
  blockStage(reason) {
    const stage = this.#stages[this.#currentIndex];
    const result = {
      stageId: stage?.id ?? "none",
      status: "blocked",
      evidence: [],
      blockerReason: reason
    };
    this.#results.push(result);
    return result;
  }
}

// packages/pebkac-harness/src/core/reality-gate.ts
var HIGH_RISK_PATTERNS = [
  { pattern: /(?:version|v)\s*\d+\.\d+/i, category: "version_number" },
  { pattern: /(?:release[sd]?|launch(?:es|ed)?|ship(?:s|ped)?)\s+(?:in|on|by)\s+\d{4}/i, category: "release_date" },
  { pattern: /(?:deprecated|removed|discontinued|end[- ]of[- ]life)/i, category: "deprecation" },
  { pattern: /(?:CVE|vulnerability|security\s+(?:flaw|issue|advisory))/i, category: "security" },
  { pattern: /(?:pricing|costs?|free\s+tier|quota|limit)\s+(?:is|are|was|changed)/i, category: "pricing" },
  { pattern: /(?:best\s+practice|recommended|standard)\s+(?:is|are)\s+(?:to|now)/i, category: "best_practice" }
];
async function buildRealityProfile(toolVersions) {
  const now = new Date;
  const languageVersions = {};
  if (toolVersions) {
    for (const [tool, version] of Object.entries(toolVersions)) {
      if (version)
        languageVersions[tool] = version;
    }
  }
  return {
    timestamp: now.getTime(),
    currentDate: now.toISOString().split("T")[0],
    osReleases: { [process.platform]: process.version },
    languageVersions,
    bestPracticesDigest: `Session grounded at ${now.toISOString()}. Tool versions captured from local environment.`,
    notes: [
      `System date: ${now.toISOString()}`,
      `Platform: ${process.platform} ${process.arch}`,
      `Node/Bun: ${process.version}`
    ],
    staleSinceMs: 0
  };
}
function isHighRiskClaim(text) {
  for (const { pattern, category } of HIGH_RISK_PATTERNS) {
    const match = pattern.exec(text);
    if (match) {
      return { isHighRisk: true, category, fragment: match[0] };
    }
  }
  return { isHighRisk: false };
}
function buildGroundingInjection(profile) {
  const parts = [
    `Today's date is ${profile.currentDate}.`,
    "Your training data has a cutoff. For time-sensitive facts (versions, releases, deprecations, pricing, security advisories), verify with web search before asserting."
  ];
  if (Object.keys(profile.languageVersions).length > 0) {
    const versions = Object.entries(profile.languageVersions).map(([k, v]) => `${k}: ${v}`).join(", ");
    parts.push(`Installed tools: ${versions}`);
  }
  return parts.join(" ");
}

// packages/pebkac-harness/src/core/secrets-guard.ts
var MAX_SCAN_LENGTH = 100 * 1024;
var SECRET_EXPOSURE_COMMANDS = [
  /\bprintenv\b/,
  /\benv\b(?!\s+\w+=)/,
  /\bset\b\s*$/,
  /\bexport\s+-p\b/,
  /cat\s+.*\.(env|pem|key)\b/,
  /cat\s+.*credentials/i,
  /cat\s+.*secrets?\b/i,
  /cat\s+.*config\.ya?ml.*vault/i,
  /echo\s+\$\{?\w*(KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL)\w*\}?/i
];
var SECRET_PATTERNS = [
  /(?:AKIA|ASIA)[A-Z0-9]{16}/g,
  /(?<=AWS_SECRET_ACCESS_KEY\s*=\s*)[A-Za-z0-9/+=]{40}/g,
  /(?<=(?:API_KEY|SECRET_KEY|ACCESS_TOKEN|AUTH_TOKEN|PRIVATE_KEY)\s*=\s*["']?)[A-Za-z0-9_\-./+=]{20,}/gi,
  /(?<=Bearer\s+)[A-Za-z0-9_\-./+=]{20,}/g,
  /(?<=:\/\/\w+:)[^@]+(?=@)/g,
  /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA )?PRIVATE KEY-----/g,
  /gh[pousr]_[A-Za-z0-9_]{36,}/g,
  /sk_(?:live|test)_[A-Za-z0-9]{24,}/g,
  /xox[bpoas]-[A-Za-z0-9-]+/g
];
function capInput(input) {
  return input.length > MAX_SCAN_LENGTH ? input.slice(0, MAX_SCAN_LENGTH) : input;
}
function checkSecretExposure(command) {
  const capped = capInput(command);
  for (const pattern of SECRET_EXPOSURE_COMMANDS) {
    if (pattern.test(capped)) {
      return {
        blocked: true,
        reason: `BLOCKED by Secrets Guard: Command "${command.trim().slice(0, 200)}" could expose credentials. ` + "Use the vault proxy system to access credentials safely, " + "or request specific non-secret environment variables by name."
      };
    }
  }
  return { blocked: false };
}
function redactSecrets(output) {
  const chunks = [];
  for (let offset = 0;offset < output.length; offset += MAX_SCAN_LENGTH) {
    let chunk = output.slice(offset, offset + MAX_SCAN_LENGTH);
    for (const pattern of SECRET_PATTERNS) {
      pattern.lastIndex = 0;
      chunk = chunk.replace(pattern, "[REDACTED]");
    }
    chunks.push(chunk);
  }
  return chunks.join("");
}
function containsSecrets(output) {
  const capped = capInput(output);
  return SECRET_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(capped);
  });
}
function checkSecretExposureInContent(content) {
  if (containsSecrets(content)) {
    return {
      blocked: true,
      reason: "BLOCKED by Secrets Guard: Content contains embedded credentials. " + "Use environment variables or the vault proxy system instead of " + "hardcoding secrets in files."
    };
  }
  return { blocked: false };
}

// packages/pebkac-harness/src/core/subagent.ts
function serializeHandoff(handoff) {
  const parts = ["## SUBAGENT TASK", "", `### Task Description`, handoff.taskDescription, ""];
  if (handoff.checkpointState.workingApproaches?.length) {
    parts.push("### Known Working Approaches");
    for (const approach of handoff.checkpointState.workingApproaches) {
      parts.push(`- ${approach}`);
    }
    parts.push("");
  }
  if (handoff.checkpointState.failedApproaches?.length) {
    parts.push("### DO NOT RE-ATTEMPT");
    for (const { approach, reason } of handoff.checkpointState.failedApproaches) {
      parts.push(`- ${approach}: ${reason}`);
    }
    parts.push("");
  }
  if (handoff.checkpointState.identifiers && Object.keys(handoff.checkpointState.identifiers).length > 0) {
    parts.push("### Critical Identifiers");
    for (const [key, value] of Object.entries(handoff.checkpointState.identifiers)) {
      parts.push(`- ${key}: ${value}`);
    }
    parts.push("");
  }
  parts.push(`### Vault Access: ${handoff.vaultAccess.length > 0 ? handoff.vaultAccess.join(", ") : "none"}`);
  parts.push(`### Timeout: ${Math.round(handoff.timeoutMs / 1000)}s`);
  return parts.join(`
`);
}
function parseSubagentResult(output, durationMs) {
  const hasEvidence = /\d+\s+pass/i.test(output) || /exit\s*code:?\s*0/i.test(output);
  return {
    status: hasEvidence ? "complete" : "blocked",
    evidence: [],
    checkpointUpdates: {},
    output,
    durationMs
  };
}

// packages/pebkac-harness/src/core/index.ts
var CONTENT_BEARING_TOOLS = new Set(["write", "edit", "notebook"]);
function buildEvidenceRequirementsInjection(requirements) {
  if (requirements.length === 0)
    return "";
  const lines = ["", "## EVIDENCE REQUIREMENTS", "", "You must produce evidence for each of the following:", ""];
  for (const req of requirements) {
    lines.push(`- **${req.id}**: ${req.description}`);
  }
  lines.push("", "For each item, you MUST show:", "");
  lines.push("- The command executed");
  lines.push("- The actual output");
  lines.push("- Verification that the output meets the requirement");
  lines.push("");
  return lines.join(`
`);
}
function buildLoopProfileInjection(profile) {
  const profiles = {
    "single-pass": `
## PROCESSING MODE: Single Pass

This is a read-only or informational task. Execute once, verify, and report.
Do NOT loop or retry unless explicitly requested.
`.trim(),
    loop: `
## PROCESSING MODE: Iterative

This task requires multiple iterations. After each action:
1. Verify the result
2. If incomplete, plan the next step
3. Continue until evidence requirements are met
4. Use checkpoint tool to save progress
`.trim(),
    "eval-first": `
## PROCESSING MODE: Test-First

For this task, you MUST:
1. Write or identify the test before implementation
2. Run the test and show it fails
3. Implement to make the test pass
4. Run the test and show it passes
5. Only then consider the task complete
`.trim(),
    complex: `
## PROCESSING MODE: Multi-Phase

This is a complex task requiring structured phases:
1. Investigation: Gather information, understand context
2. Planning: Break into smaller tasks with evidence requirements
3. Implementation: Execute with checkpoints
4. Verification: Show all evidence
5. Documentation: Update relevant docs

Use the todo-write tool to track progress across phases.
`.trim()
  };
  return `

${profiles[profile]}
`;
}
async function pebkacDefenseExtension(pi) {
  pi.setLabel("PEBKAC Harness [L1-L4]");
  const harnessDisabled = await getFlag("harness_disabled");
  if (harnessDisabled) {
    pi.setLabel("PEBKAC Harness [DISABLED]");
    console.log("PEBKAC Harness disabled - running vanilla oh-my-pi");
    return;
  }
  let enforcer;
  let checkpoint;
  let auditLog;
  const breaker = new CircuitBreaker;
  let realityProfile;
  let turnsWithoutEvidence = 0;
  let compactionsSinceCheckpoint = 0;
  let failedToolCallsThisTurn = 0;
  let sessionMessageCount = 0;
  let hasFlarePlan = false;
  let currentPhase;
  let normalizedInput;
  pi.on("session_start", async (_event, ctx) => {
    enforcer = new EvidenceEnforcer;
    checkpoint = new CheckpointManager(ctx.cwd);
    auditLog = new AuditLog(ctx.cwd);
    await Promise.all([checkpoint.init(), auditLog.init()]);
    ctx.ui.setStatus("pebkac", "PEBKAC Harness Active");
    await auditLog.append({
      timestamp: Date.now(),
      event: "session_start",
      details: { cwd: ctx.cwd }
    });
    let toolVersions;
    try {
      const toolVersionsPath = `${ctx.cwd}/.harness/state/tool-versions.json`;
      toolVersions = await Bun.file(toolVersionsPath).json();
    } catch {}
    realityProfile = await buildRealityProfile(toolVersions);
    const recovery = checkpoint.buildRecoveryInjection();
    if (recovery.includes("DO NOT RE-ATTEMPT") || recovery.includes("WORKING APPROACHES")) {
      pi.sendMessage({
        customType: "pebkac-recovery",
        content: recovery,
        display: true,
        attribution: "agent"
      });
    }
  });
  pi.on("before_agent_start", async (event, _ctx) => {
    const contractLayer = buildContractSystemPromptLayer();
    let fullPrompt = `${event.systemPrompt}

${contractLayer}`;
    if (realityProfile) {
      fullPrompt += `

${buildGroundingInjection(realityProfile)}`;
    }
    const taskDesc = event.taskDescription;
    if (taskDesc) {
      normalizedInput = normalizeInput(taskDesc);
      const evidenceRequirements = generateEvidenceContract(normalizedInput);
      if (normalizedInput.contract) {
        const rules = normalizedInput.contract.items.map((item) => item.description);
        const conflicts = detectConflicts(rules);
        if (conflicts.hasConflicts && conflicts.resolution === "rejected") {
          fullPrompt += `

[PEBKAC] WARNING: Conflicting constraints detected in task. Review the contract carefully.`;
        }
      }
      fullPrompt += buildEvidenceRequirementsInjection(evidenceRequirements);
      fullPrompt += buildLoopProfileInjection(normalizedInput.loopProfile);
      if (auditLog) {
        auditLog.append({
          timestamp: Date.now(),
          event: "input_normalized",
          details: {
            intent: normalizedInput.intent,
            loopProfile: normalizedInput.loopProfile,
            identifiers: normalizedInput.identifiers,
            constraints: normalizedInput.constraints
          }
        });
      }
    }
    if (currentPhase === "planning" || sessionMessageCount < 4 && !hasFlarePlan) {
      fullPrompt += `

${buildFlarePlanningInjection()}`;
    }
    return { systemPrompt: fullPrompt };
  });
  pi.on("session_before_compact", async (_event, _ctx) => {
    if (checkpoint) {
      await checkpoint.save();
    }
  });
  pi.on("session_compact", async (_event, _ctx) => {
    compactionsSinceCheckpoint++;
    if (checkpoint) {
      const recovery = checkpoint.buildRecoveryInjection();
      if (recovery.length > 100) {
        pi.sendMessage({
          customType: "pebkac-recovery",
          content: recovery,
          display: true,
          attribution: "agent"
        });
        compactionsSinceCheckpoint = 0;
      }
    }
  });
  pi.on("turn_start", async (_event, _ctx) => {
    if (enforcer) {
      enforcer.resetTurnCounters();
    }
    failedToolCallsThisTurn = 0;
    sessionMessageCount++;
    currentPhase = inferPhase(sessionMessageCount, hasFlarePlan);
  });
  pi.on("turn_end", async (_event, _ctx) => {
    if (checkpoint?.tick()) {
      await checkpoint.save();
    }
    if (enforcer) {
      if (enforcer.turnEvidenceCount === 0) {
        turnsWithoutEvidence++;
      } else {
        turnsWithoutEvidence = 0;
      }
      const metrics = {
        ceremonyRatio: enforcer.getCeremonyRatio(),
        evidenceCount: enforcer.turnEvidenceCount,
        failedToolCalls: failedToolCallsThisTurn,
        turnsWithoutEvidence,
        compactionsSinceCheckpoint
      };
      const degradation = scoreDegradation(metrics);
      if (degradation.threshold) {
        breaker.trip(degradation.reason ?? "Degradation threshold exceeded");
      } else if (enforcer.turnEvidenceCount > 0) {
        breaker.recordEvidence();
      }
      await auditLog.append({
        timestamp: Date.now(),
        event: "turn_end",
        details: { metrics, breakerState: breaker.state }
      });
    }
  });
  pi.on("tool_call", async (event, _ctx) => {
    if (breaker.state === "half-open" && event.toolName !== "harness-status" && event.toolName !== "harness-audit") {
      failedToolCallsThisTurn++;
      return {
        block: true,
        reason: "Circuit half-open: only retrieval commands are allowed until evidence is produced."
      };
    }
    if (breaker.isOpen) {
      failedToolCallsThisTurn++;
      return { block: true, reason: breaker.buildCorrectionMessage() };
    }
    const effectivePhase = currentPhase ?? "implementation";
    const policyResult = checkToolPolicy(effectivePhase, event.toolName);
    if (!policyResult.allowed) {
      failedToolCallsThisTurn++;
      return { block: true, reason: policyResult.reason };
    }
    if (event.toolName === "bash") {
      const command = event.input.command ?? "";
      const gitResult = evaluateGitCommand(command);
      if (gitResult.blocked) {
        failedToolCallsThisTurn++;
        return { block: true, reason: gitResult.reason };
      }
      const secretsResult = checkSecretExposure(command);
      if (secretsResult.blocked) {
        failedToolCallsThisTurn++;
        return { block: true, reason: secretsResult.reason };
      }
    }
    if (CONTENT_BEARING_TOOLS.has(event.toolName)) {
      const input = event.input;
      const content = input.content ?? input.text ?? "";
      if (content) {
        const contentResult = checkSecretExposureInContent(content);
        if (contentResult.blocked) {
          failedToolCallsThisTurn++;
          return { block: true, reason: contentResult.reason };
        }
      }
    }
  });
  pi.on("tool_result", async (event, _ctx) => {
    const content = event.content;
    if (!content || content.length === 0)
      return;
    let modified = false;
    const newContent = content.map((c) => {
      if (c.type !== "text")
        return c;
      let text = c.text;
      if (containsSecrets(text)) {
        text = redactSecrets(text);
        modified = true;
      }
      if (enforcer) {
        if (enforcer.hasSubstantiveEvidence(text)) {
          enforcer.recordEvidence({
            itemId: event.toolCallId,
            actionDescription: `${event.toolName} tool result`,
            evidenceSnippet: text.slice(0, 500),
            verifier: event.toolName,
            verified: !event.isError,
            timestamp: Date.now(),
            type: "command_output"
          });
          if (checkpoint) {
            checkpoint.addEvidenceSummary(`[${event.toolName}] ${text.slice(0, 100).replace(/\n/g, " ")}`);
          }
          breaker.recordEvidence();
        }
        const ceremony = enforcer.detectCeremonialization(text);
        if (ceremony.ceremonial) {
          const transition = enforcer.requestTransition(event.toolCallId, "complete");
          if (!transition.allowed) {
            text += `

[PEBKAC HARD BLOCK] ${transition.reason}`;
          } else {
            text += `

PEBKAC NOTICE: ${ceremony.reason}`;
          }
          modified = true;
        }
        const contradiction = detectContradiction(text);
        if (contradiction.isContradiction && contradiction.fragment) {
          text = rewriteContradiction(text, contradiction.fragment);
          modified = true;
        }
      }
      const highRisk = isHighRiskClaim(text);
      if (highRisk.isHighRisk) {
        text += `

[PEBKAC GROUNDING] This output contains a ${highRisk.category} claim ("${highRisk.fragment}"). Verify with a current source before asserting.`;
        modified = true;
      }
      return { ...c, text };
    });
    const summaryText = newContent.filter((b) => b.type === "text").map((b) => b.text).join(" ").trim();
    const status = event.isError ? "error" : "success";
    const nextActions = event.isError ? [
      "Review the error and root cause hints in this result.",
      "If the error is transient, retry once after confirming preconditions.",
      "If the error persists, mark this item as BLOCKED and escalate."
    ] : [
      "Continue with the next contract item.",
      "Verify outputs against expected results.",
      "Only mark COMPLETE once evidence is in place."
    ];
    const artifacts = [];
    for (const match of summaryText.matchAll(/(?:\/[\w\-./]+)/g)) {
      artifacts.push(match[0]);
    }
    const details = event.details && typeof event.details === "object" ? { ...event.details } : {};
    details.harnessMetadata = { status, summary: summaryText.slice(0, 1000), next_actions: nextActions, artifacts };
    if (!modified) {
      return { details };
    }
    return { content: newContent, details };
  });
  pi.on("context", async (event, _ctx) => {
    if (!hasFlarePlan) {
      for (const msg of event.messages) {
        const msgContent = "content" in msg && typeof msg.content === "string" ? msg.content : "";
        if (msgContent) {
          if (msgContent.includes("FLARE") || msgContent.includes("confidence:") && /step\s*\d+/i.test(msgContent) || /^#{1,3}\s*(plan|steps)/im.test(msgContent)) {
            hasFlarePlan = true;
            currentPhase = inferPhase(sessionMessageCount, hasFlarePlan);
            break;
          }
        }
      }
    }
    if (event.messages.length < 10)
      return;
    const reminderParts = [
      "[PEBKAC] Execution contract active.",
      "Evidence required for every status claim.",
      "No 'done' without proof. No skipped items without BLOCKED status."
    ];
    if (realityProfile) {
      reminderParts.push(`Session grounded: ${realityProfile.currentDate}.`);
    }
    if (enforcer) {
      const ratio = enforcer.getCeremonyRatio();
      if (ratio > 0.3) {
        reminderParts.push(`WARNING: Ceremony ratio ${(ratio * 100).toFixed(0)}% -- increase substantive evidence.`);
      }
    }
    if (breaker.isOpen) {
      reminderParts.push(`CIRCUIT BREAKER OPEN: ${breaker.reason}`);
    }
    const messages = [...event.messages];
    messages.push({
      role: "user",
      content: reminderParts.join(" ")
    });
    return { messages };
  });
  pi.registerCommand("harness-status", {
    description: "Show PEBKAC harness defense status and evidence ledger",
    handler: async (_args, ctx) => {
      const status = [
        "## PEBKAC Harness Status",
        "",
        "| Layer | Module | Status |",
        "|-------|--------|--------|",
        "| L1 | Contract Compiler | Active (before_agent_start) |",
        "| L2 | Evidence Enforcer | Active (tool_result + hard blocking) |",
        "| L2 | Contradiction Guard | Active (tool_result rewrite) |",
        "| L3 | Git Guard | Active (tool_call intercept) |",
        "| L3 | Secrets Guard | Active (all tools) |",
        `| L3 | Reality Gate | ${realityProfile ? `Active (grounded: ${realityProfile.currentDate})` : "Pending"} |`,
        `| L3 | Circuit Breaker | ${breaker.isOpen ? `OPEN: ${breaker.reason}` : "Closed (monitoring)"} |`,
        "| L3 | Lifecycle Policy | Active (tool_call gating) |",
        "| L4 | Checkpoint | Active (pre-compact persistence) |",
        "| L4 | Anti-attenuation | Active (context injection) |"
      ];
      status.push(`| L4 | FLARE Planner | ${hasFlarePlan ? "Plan complete" : currentPhase === "planning" ? "Planning" : "Available"} |`);
      status.push(`| L4 | Lifecycle Phase | ${currentPhase ?? "implementation"} (messages: ${sessionMessageCount}) |`);
      if (enforcer) {
        const ledger = enforcer.getLedger();
        status.push("");
        status.push(`**Evidence Records:** ${ledger.records.length}`);
        status.push(`**Ceremony Ratio:** ${(enforcer.getCeremonyRatio() * 100).toFixed(1)}%`);
        status.push(`**Turns Without Evidence:** ${turnsWithoutEvidence}`);
      }
      ctx.ui.notify(status.join(`
`), "info");
    }
  });
  pi.registerCommand("flare-complete", {
    description: "Mark FLARE planning phase as complete, enabling implementation tools",
    handler: async (_args, ctx) => {
      hasFlarePlan = true;
      currentPhase = inferPhase(sessionMessageCount, hasFlarePlan);
      ctx.ui.notify(`FLARE plan marked complete. Phase transitioned to: ${currentPhase ?? "implementation"}. Implementation tools now enabled.`, "info");
    }
  });
  let activePipeline = null;
  pi.registerCommand("harness-delegate", {
    description: "Prepare a subtask handoff for a fresh agent context (prints structured handoff)",
    handler: async (args, ctx) => {
      const taskDescription = args || "No task description provided";
      const handoff = {
        taskDescription,
        checkpointState: checkpoint ? {
          workingApproaches: checkpoint.getState().workingApproaches,
          failedApproaches: checkpoint.getState().failedApproaches,
          identifiers: checkpoint.getState().identifiers
        } : {},
        vaultAccess: [],
        timeoutMs: 30 * 60 * 1000
      };
      const serialized = serializeHandoff(handoff);
      ctx.ui.notify([
        "## Subagent Handoff Generated",
        "",
        "Copy this to a fresh agent context:",
        "",
        "```",
        serialized,
        "```",
        "",
        "When subtask completes, use `/harness-subagent-result` to parse the output."
      ].join(`
`), "info");
    }
  });
  pi.registerCommand("harness-subagent-result", {
    description: "Parse subtask result output and update checkpoint",
    handler: async (args, ctx) => {
      const output = args;
      const result = parseSubagentResult(output, 0);
      if (result.status === "complete") {
        ctx.ui.notify(`Subtask completed. Evidence items: ${result.evidence.length}`, "info");
      } else {
        ctx.ui.notify(`Subtask blocked. Review output for blockers.`, "warning");
      }
    }
  });
  pi.registerCommand("harness-pipeline", {
    description: "Start or interact with a sequential pipeline (subcommands: start, status, complete, block)",
    handler: async (args, ctx) => {
      const argsArray = args.split(/\s+/).filter(Boolean);
      const [subcommand, ...rest] = argsArray;
      switch (subcommand) {
        case "start": {
          const stages = rest.map((arg, i) => {
            const [name, evidenceStr] = arg.split(":");
            return {
              id: `stage-${i + 1}`,
              name: name || `Stage ${i + 1}`,
              description: name || "",
              evidenceRequired: evidenceStr?.split(",") ?? [],
              dependencies: []
            };
          });
          if (stages.length === 0) {
            ctx.ui.notify("Usage: /harness-pipeline start Build:test,lint Deploy:exit_code", "warning");
            return;
          }
          activePipeline = new SequentialPipeline(stages);
          ctx.ui.notify(`Pipeline started with ${stages.length} stages. Current: ${activePipeline.currentStage?.name ?? "none"}`, "info");
          break;
        }
        case "status": {
          if (!activePipeline) {
            ctx.ui.notify("No active pipeline. Use /harness-pipeline start <stages>", "warning");
            return;
          }
          const current = activePipeline.currentStage;
          const results = activePipeline.results;
          const status = [
            "## Pipeline Status",
            "",
            `Complete: ${activePipeline.isComplete}`,
            `Current stage: ${current?.name ?? "none"}`,
            "",
            "### Results:",
            ...results.map((r) => `- ${r.stageId}: ${r.status}${r.blockerReason ? ` (${r.blockerReason})` : ""}`)
          ];
          ctx.ui.notify(status.join(`
`), "info");
          break;
        }
        case "complete": {
          if (!activePipeline) {
            ctx.ui.notify("No active pipeline.", "warning");
            return;
          }
          const result = activePipeline.completeStage(rest);
          if (result.status === "complete") {
            const next = activePipeline.currentStage;
            ctx.ui.notify(`Stage ${result.stageId} complete. ${next ? `Next: ${next.name}` : "Pipeline complete!"}`, "info");
          } else {
            ctx.ui.notify(`Stage ${result.stageId} blocked: ${result.blockerReason}`, "warning");
          }
          break;
        }
        case "block": {
          if (!activePipeline) {
            ctx.ui.notify("No active pipeline.", "warning");
            return;
          }
          const reason = rest.join(" ") || "Blocked by user";
          const result = activePipeline.blockStage(reason);
          ctx.ui.notify(`Stage ${result.stageId} blocked: ${reason}`, "warning");
          break;
        }
        default:
          ctx.ui.notify(`Usage: /harness-pipeline <start|status|complete|block> [args]
` + `  start Build:test,lint Deploy:exit_code  - Start pipeline
` + `  status                                  - Show current state
` + `  complete test lint                      - Complete stage with evidence
` + "  block <reason>                          - Block current stage", "info");
      }
    }
  });
}
export {
  pebkacDefenseExtension as default
};
