# Research: GitHub Platforms Claiming End-to-End Autonomous Software Delivery

**Date:** 2026-05-24
**Subject:** Platforms on GitHub that claim to inspect/code/test/operate like an autonomous project delivery agent
**Method:** GitHub API metadata + official README/source documentation review
**Confidence:** Medium-high for repo claims and architecture; medium for real-world reliability because I did not run each platform end-to-end.

## Executive Summary

Five GitHub-hosted platforms credibly claim portions of the loop Douglas described: **OpenHands**, **Cline**, **Pythagora/GPT Pilot**, **SWE-agent**, and **Roo Code**. None proves the complete “idea → module research → build → dogfood → refactor → test → commit → PR with evidence” loop as a guaranteed product behavior, but **OpenHands** and **Cline** are closest to a currently active platform architecture, while **SWE-agent** is strongest on benchmark-style GitHub issue repair, **GPT Pilot** is closest to greenfield app generation but is no longer maintained, and **Roo Code** is functionally relevant but has product-continuity risk.

## Comparison Table

| Platform | GitHub repo | Claim | What it really appears to do | Fit to target loop |
|---|---|---|---|---|
| OpenHands | `OpenHands/OpenHands` | AI-driven development with SDK, CLI, local GUI, cloud/enterprise; local GUI includes REST API and React app [citation:OpenHands README](https://github.com/OpenHands/OpenHands/blob/main/README.md#L34-L51). | Has sandbox management, conversation lifecycle, GitHub issue resolver instructions that tell the agent to add tests, run tests, create branch, commit, push, and open PR [citation:OpenHands GitHub issue instructions](https://github.com/OpenHands/OpenHands/blob/main/openhands/app_server/integrations/templates/resolver/github/issue_conversation_instructions.j2). | **Closest full platform.** Strong issue-to-PR loop; less explicit on OSS module scouting/dogfood proof. |
| Cline | `cline/cline` | Autonomous coding agent as SDK, IDE extension, CLI; creates files, runs commands, browses web, uses tools with approval [citation:Cline README](https://github.com/cline/cline/blob/main/README.md#L78-L83). | Has plan/act mode, terminal execution, compiler/linter monitoring, checkpoints, MCP, multi-agent teams, scheduled agents, headless CI/CD, and broad model-provider support [citation:Cline README](https://github.com/cline/cline/blob/main/README.md#L138-L226). | **Closest local workstation model.** Strong interactive implementation loop; evidence gates depend on configuration/rules. |
| Pythagora / GPT Pilot | `Pythagora-io/gpt-pilot` | “Doesn't just generate code, it builds apps” and “first real AI developer companion” [citation:GPT Pilot README](https://github.com/Pythagora-io/gpt-pilot/blob/main/README.md#L32-L61). | Multi-agent pipeline: spec writer, architect, tech lead, developer, code monkey, reviewer, troubleshooter, debugger, technical writer [citation:GPT Pilot README](https://github.com/Pythagora-io/gpt-pilot/blob/main/README.md#L185-L198). It explicitly says it works with a developer and can debug issues step-by-step [citation:GPT Pilot README](https://github.com/Pythagora-io/gpt-pilot/blob/main/README.md#L202-L207). | **Best greenfield-app concept.** But README says repo is not maintained [citation:GPT Pilot README](https://github.com/Pythagora-io/gpt-pilot/blob/main/README.md#L36-L40). |
| SWE-agent | `SWE-agent/SWE-agent` | LM autonomously uses tools to fix issues in real GitHub repositories [citation:SWE-agent README](https://github.com/SWE-agent/SWE-agent/blob/main/README.md#L27-L35). | Strong sandboxed issue-solving architecture: `SWEEnv`/SWE-ReX starts shell in container, Agent prompts model, parses action, executes in shell [citation:SWE-agent architecture](https://github.com/SWE-agent/SWE-agent/blob/main/docs/background/architecture.md#L7-L17). Hello-world docs show running against a GitHub issue URL in Docker [citation:SWE-agent hello world](https://github.com/SWE-agent/SWE-agent/blob/main/docs/usage/hello_world.md#L3-L31). | **Best benchmarked bugfix agent.** Not a full product/project operator; narrower than your desired loop. |
| Roo Code | `RooCodeInc/Roo-Code` | “Whole dev team of AI agents” in editor; code, architect, ask, debug, custom modes, MCP [citation:Roo README](https://github.com/RooCodeInc/Roo-Code/blob/main/README.md#L35-L55). | CLI docs show command/browser/MCP approval states and auto-approval vs manual approval [citation:Roo Agent Loop](https://github.com/RooCodeInc/Roo-Code/blob/main/apps/cli/docs/AGENT_LOOP.md#L37-L71). Repo includes PR workflow rules with commit, PR creation, approval, and CI checks [citation:Roo PR workflow](https://github.com/RooCodeInc/Roo-Code/blob/main/.roo/rules-issue-fixer/5_pull_request_workflow.xml#L1-L50). | **Technically relevant but risky.** README states Roo Code extension was shut down May 15 and points users to forks/Cline [citation:Roo README](https://github.com/RooCodeInc/Roo-Code/blob/main/README.md#L64-L69). |

## Per-Platform Findings

### 1. OpenHands — closest to “agent platform”

OpenHands presents itself as a family of SDK, CLI, Local GUI, Cloud, and Enterprise offerings. Its README says the SDK contains the agentic engine, the CLI can be powered by Claude/GPT/other LLMs, and the Local GUI runs agents on a laptop with REST API and React app [citation:OpenHands README](https://github.com/OpenHands/OpenHands/blob/main/README.md#L34-L51). The repo also contains sandbox services described as secure containerized execution environments with Docker/remote/local backends and user-scoped access control [citation:OpenHands sandbox README](https://github.com/OpenHands/OpenHands/blob/main/openhands/app_server/sandbox/README.md).

The strongest evidence that OpenHands really attempts the GitHub delivery loop is its GitHub issue resolver prompt template: it instructs the agent to add tests for application-code changes, run tests, create a branch, commit, push, and use `create_pr` to open a PR [citation:OpenHands GitHub issue instructions](https://github.com/OpenHands/OpenHands/blob/main/openhands/app_server/integrations/templates/resolver/github/issue_conversation_instructions.j2). It also has PR-update instructions for handling review comments by retrieving diffs/context, modifying code, committing, and pushing updates [citation:OpenHands PR update instructions](https://github.com/OpenHands/OpenHands/blob/main/openhands/app_server/integrations/templates/resolver/github/pr_update_conversation_instructions.j2).

**Verdict:** It really does major parts of the desired loop, especially issue-to-PR. It does not, from inspected docs, guarantee your exact “research OSS modules D/E/F, dogfood browser build, evidence ledger, ask push permission” workflow as a polished golden path.

### 2. Cline — closest to local autonomous workstation

Cline claims to create files, run commands, browse web, and use tools with human-in-the-loop approval [citation:Cline README](https://github.com/cline/cline/blob/main/README.md#L78-L83). Its README says Cline reads project structure, makes coordinated changes, monitors linter/compiler errors, exposes diffs, and tracks changes with checkpoints [citation:Cline README](https://github.com/cline/cline/blob/main/README.md#L138-L140). It also claims terminal command execution with real-time output, package installation, build/test execution, deployment, database management, and long-running process monitoring [citation:Cline README](https://github.com/cline/cline/blob/main/README.md#L142-L144).

Cline’s Plan/Act split is very close to the approval flow Douglas wants: Plan mode explores and strategizes, then Act mode executes, with every file edit and command requiring approval unless auto-approve is enabled [citation:Cline README](https://github.com/cline/cline/blob/main/README.md#L146-L148). It also supports many model providers including Anthropic, OpenAI, Google, OpenRouter, Vercel AI Gateway, Bedrock, Vertex, Groq/Cerebras, Ollama/LM Studio, and OpenAI-compatible APIs [citation:Cline README](https://github.com/cline/cline/blob/main/README.md#L154-L169). It can use MCP servers and custom tools [citation:Cline README](https://github.com/cline/cline/blob/main/README.md#L171-L189), multi-agent teams [citation:Cline README](https://github.com/cline/cline/blob/main/README.md#L191-L197), schedules [citation:Cline README](https://github.com/cline/cline/blob/main/README.md#L199-L207), and headless CI/CD commands [citation:Cline README](https://github.com/cline/cline/blob/main/README.md#L219-L226).

**Verdict:** It really does the local coding-agent loop better than most. The gap is productized evidence governance: Cline can run tests/fix issues, but your “no fake 100% completion” policy would need rules/plugins/workflow enforcement.

### 3. GPT Pilot / Pythagora — closest to greenfield app builder concept, but stale

GPT Pilot explicitly says it “doesn't just generate code, it builds apps” [citation:GPT Pilot README](https://github.com/Pythagora-io/gpt-pilot/blob/main/README.md#L30-L34) and describes itself as core technology for a VS Code extension aiming to be a “real AI developer companion” that writes full features, debugs, talks through issues, and asks for review [citation:GPT Pilot README](https://github.com/Pythagora-io/gpt-pilot/blob/main/README.md#L57-L62). It states the goal is generating fully working production-ready apps under developer oversight [citation:GPT Pilot README](https://github.com/Pythagora-io/gpt-pilot/blob/main/README.md#L84-L87).

Its “How GPT Pilot works” section is a clear multi-agent software-development pipeline: product owner, spec writer, architect, tech lead, developer, code monkey, reviewer, troubleshooter, debugger, and technical writer [citation:GPT Pilot README](https://github.com/Pythagora-io/gpt-pilot/blob/main/README.md#L185-L198). It also claims it codes step-by-step like a developer, can debug as issues arise, and can continue adding features after app completion [citation:GPT Pilot README](https://github.com/Pythagora-io/gpt-pilot/blob/main/README.md#L202-L207).

**Verdict:** It is conceptually close to your desired loop, especially for “project X should do A/B/C.” However, the README says the repo is not maintained anymore [citation:GPT Pilot README](https://github.com/Pythagora-io/gpt-pilot/blob/main/README.md#L36-L40), so it is not a strong foundation unless treated as research material.

### 4. SWE-agent — strongest GitHub issue repair engine, narrow scope

SWE-agent claims your chosen LM can autonomously use tools to fix issues in real GitHub repositories, find cybersecurity vulnerabilities, or perform custom tasks [citation:SWE-agent README](https://github.com/SWE-agent/SWE-agent/blob/main/README.md#L27-L35). It is research-oriented and benchmark-focused, including claims of state-of-the-art SWE-bench performance and documentation/configurability [citation:SWE-agent README](https://github.com/SWE-agent/SWE-agent/blob/main/README.md#L32-L37).

Its architecture docs are concrete: the `sweagent` CLI initializes `SWEEnv`, uses SWE-ReX to start a shell inside a Docker container, sends prompts/actions/history to an Agent, parses model output, and executes actions in the shell session [citation:SWE-agent architecture](https://github.com/SWE-agent/SWE-agent/blob/main/docs/background/architecture.md#L7-L17). Its hello-world docs show a command that points the agent at a GitHub repo and issue URL inside a Docker sandbox [citation:SWE-agent hello world](https://github.com/SWE-agent/SWE-agent/blob/main/docs/usage/hello_world.md#L24-L35).

**Verdict:** It really does the GitHub-issue-to-patch part, and probably more rigorously than many UI agents. But it is not a full interactive project-operator product: less emphasis on module scouting, UX dogfood, PR prep UX, and high-level chat iteration.

### 5. Roo Code — relevant feature set, but product status problem

Roo Code claims natural-language code generation, modes for code/architect/ask/debug, custom modes, documentation, repetitive task automation, and MCP server use [citation:Roo README](https://github.com/RooCodeInc/Roo-Code/blob/main/README.md#L35-L55). Its CLI docs describe agent-loop states including waiting for approval, terminal command requests, browser action launch, and MCP server use [citation:Roo Agent Loop](https://github.com/RooCodeInc/Roo-Code/blob/main/apps/cli/docs/AGENT_LOOP.md#L37-L71). The same docs say default CLI behavior auto-approves tool/command/browser/MCP actions, with `--require-approval` enabling manual prompts [citation:Roo Agent Loop](https://github.com/RooCodeInc/Roo-Code/blob/main/apps/cli/docs/AGENT_LOOP.md#L245-L270).

The repo includes a PR workflow rule instructing commit, PR description, user approval before PR creation, `gh pr create`, issue comments, and PR checks monitoring [citation:Roo PR workflow](https://github.com/RooCodeInc/Roo-Code/blob/main/.roo/rules-issue-fixer/5_pull_request_workflow.xml#L1-L50).

**Verdict:** It has many of the mechanisms, but the README says the Roo Code extension was shut down on May 15 and points users to ZooCode/Cline [citation:Roo README](https://github.com/RooCodeInc/Roo-Code/blob/main/README.md#L64-L69). I would mine it for patterns, not bet Gemini’s future on it.

## Answer to “Do any really do it?”

**Yes, but no single one fully matches Douglas’s exact desired reality.**

- **OpenHands really does:** sandboxed agent execution, local GUI/API, GitHub issue/PR automation, branch/commit/push/PR instructions.
- **Cline really does:** local repo editing, command execution, web/tool use, approvals, checkpoints, multi-agent/team/headless workflows, model agnosticism.
- **SWE-agent really does:** GitHub issue repair in sandboxed shell environments with benchmark orientation.
- **GPT Pilot really did/does conceptually:** app-building multi-agent pipeline, but it is stale/unmaintained.
- **Roo Code really has mechanisms:** modes, MCP/browser/terminal approvals, PR workflow rules, but official project continuity is weak.

The missing product wedge for Gemini is not “can an agent edit files.” Others can. The wedge is **a local project operator with enforced evidence gates and high-level product workflow**: module research, dependency selection, implementation, browser dogfood, test receipts, failure recovery, commit/PR approval, and no unproven 100% success claims.

## Implications for Gemini for macOS

1. **Do not build a generic Cline clone.** Cline already exists and is active.
2. **Do not build only a model router.** Cline already supports broad model routing.
3. **Do not copy GPT Pilot directly.** It validates the idea but is unmaintained.
4. **Borrow from OpenHands:** sandbox/conversation lifecycle, GitHub issue-to-PR resolver, hosted/local split.
5. **Borrow from SWE-agent:** rigorous sandboxed execution and benchmarkable issue-solving loop.
6. **Borrow from Cline/Roo:** Plan/Act approval flow, checkpointing, MCP/browser/terminal tool approvals.
7. **Differentiate Gemini with evidence-first delivery:** make completion impossible without build/test/browser/git receipts.

## Confidence Assessment

| Claim | Confidence | Reason |
|---|---:|---|
| These five repos claim relevant autonomous software-agent capabilities | High | Official READMEs and GitHub metadata. |
| OpenHands and Cline are closest active platforms | High | Active releases/updates and broad documented capabilities. |
| GPT Pilot is conceptually relevant but stale | High | README explicitly says repo is not maintained. |
| SWE-agent is narrower but rigorous | High | Official architecture and usage docs focus on GitHub issue repair. |
| None fully guarantees Douglas’s desired loop | Medium | Based on docs/source review; I did not run all platforms end-to-end. |

## Research Artifacts

Local fetched artifacts used during this review:

- `/tmp/agent_platform_research/OpenHands_summary.json`
- `/tmp/agent_platform_research/cline_summary.json`
- `/tmp/agent_platform_research/gpt_pilot_summary.json`
- `/tmp/agent_platform_research/SWE_agent_summary.json`
- `/tmp/agent_platform_research/RooCode_summary.json`
- `/tmp/agent_platform_research/*_README.md`
- `/tmp/agent_platform_research/docs/*`
