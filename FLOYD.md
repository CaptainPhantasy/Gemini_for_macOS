# GEMINI for MacOS — FLOYD.md
**Version:** 1.2.0
**Initialized:** 2026-04-15
**Governance:** .supercache/ v1.2.0
**Port:** 13000 + 13001 (claimed in port-registry.json)
**Drive:** /Volumes/SanDisk1Tb/
**Path:** /Volumes/SanDisk1Tb/GEMINI for MacOS

> **Compliance Notice:** This file must match the template at
> `.supercache/templates/floyd-md-template.md`. If you are an agent reading
> this file and it is missing sections from the template, edit this file to
> add them. Preserve all project-specific content below. The template is the
> spec. This file is the implementation. Make them match.

---

## Agent Contract

You are working on **GEMINI for MacOS**, a Legacy AI project.

**This file (`FLOYD.md`) is the canonical project spec.** It is authoritative for project identity, stack, ports, build commands, environment variables, and project-specific rules. All agents — Floyd, Claude, or any model routed through the OhMyFloyd harness — read this file first.

**Some projects also have a `CLAUDE.md` adapter** alongside this file. That adapter is optional and applies only when Claude is the active agent. It does not duplicate anything here; it layers Claude-specific behavior and role guidance on top. If `CLAUDE.md` conflicts with `FLOYD.md` on project facts, `FLOYD.md` wins. See `.supercache/templates/claude-md-template.md` for the adapter spec.

### Before You Start
1. Read this file completely. Do not skim. Every section constrains your behavior.
2. **If you are Claude Code**: also read `CLAUDE.md` if it exists at the project root. It contains your role, division of labor with Floyd, and Claude-specific rules.
3. Read `.supercache/READONLY` — you MUST NOT write to `.supercache/`.
4. Read `SSOT/README.md` for current project state.
5. Read `Issues/README.md` for open issues.
6. Read `.supercache/manifests/port-allocation-policy.yaml` — NEVER use port 3000, 5000, 8000, 8080, or any other forbidden port. This project uses ports **13000** (Vite frontend) and **13001** (MCP backend). Do not change them without Douglas Talley's explicit approval.
7. Read `.supercache/contracts/execution-contract.md` — this governs how you prove your work.
8. Read `.supercache/manifests/model-routing.yaml` — this tells you which LLM to use for what.

### Governance Location
```
.supercache/ → /Volumes/SanDisk1Tb/.supercache/
```
This directory contains global templates, contracts, manifests, and routing config.
It is **READ-ONLY**. Do not create, modify, or delete any file there.

### Where You Write

| Location             | Purpose                                          | Example                                         |
|----------------------|--------------------------------------------------|-------------------------------------------------|
| `SSOT/`              | Project status, decisions, findings              | `SSOT/README.md`, `SSOT/decision-log.md`        |
| `Issues/`            | Bugs, blockers, tasks                            | `Issues/README.md`, `Issues/001-description.md` |
| `.floyd/`            | Agent working state, session logs, runtime cache | `.floyd/agent_log.jsonl`                        |
| Project source files | Your actual work                                 | Any file in the project tree not listed below   |

### Where You Do NOT Write

| Location          | Reason                                       |
|-------------------|----------------------------------------------|
| `.supercache/`    | Global governance — READ-ONLY for all agents |
| `launch-gemini.sh` PID tracking | Managed by launcher, agent reads only |

---

## Project Identity

| Field                | Value                                                                   |
|----------------------|-------------------------------------------------------------------------|
| **Name**             | GEMINI for MacOS                                                        |
| **Purpose**          | Desktop Commander MCP integration for Gemini agent with local filesystem access |
| **Primary Language** | TypeScript (ES2022, strict)                                             |
| **Runtime**          | Node.js ≥ 22.0.0                                                        |
| **Module System**    | ESM                                                                     |
| **Framework**        | React 19, Vite, Express.js                                              |
| **Database**         | None — stateless, local filesystem operations only                      |
| **Port**             | **13000** (Vite) + **13001** (MCP) — claimed in `/Volumes/SanDisk1Tb/SSOT/port-registry.json` |
| **Repository**       | github.com/CaptainPhantasy/GEMINI-for-macOS                             |
| **Current Phase**    | Active development                                                      |

---

## Project Structure

```
GEMINI for MacOS/
├── src/
│   ├── server/
│   │   └── mcp-server.ts               # MCP backend (port 13001, WebSocket)
│   ├── lib/
│   │   ├── mcp.ts                      # MCP client wrapper
│   │   └── agent-tools.ts              # Agent tool integration
│   ├── components/                     # React components
│   ├── App.tsx                         # Main React app
│   └── main.tsx                        # React entry point
├── GEMINI.app/                         # macOS app bundle with launcher
│   └── Contents/
│       ├── MacOS/gemini                # AppleScript wrapper → launch-gemini.sh
│       ├── Info.plist                  # Bundle metadata
│       └── Resources/AppIcon.icns      # 681K icon (6 sizes)
├── launch-gemini.sh                    # Launcher: terminal mgmt + service startup
├── .claude/claude.json                 # MCP server config
├── .env                                # Environment (GEMINI_API_KEY)
├── .env.example                        # Template
├── FLOYD.md                            # This file
├── package.json                        # Dependencies + scripts
└── SSOT/                               # Project status
```

---

## Build & Verify Commands

| Action         | Command                                                        | Expected Result             |
|----------------|----------------------------------------------------------------|-----------------------------|
| **Type check** | `npm run type-check`                                           | Exit 0, no errors           |
| **Build**      | `npm run build`                                                | Exit 0, dist/ created       |
| **Test**       | `npm test`                                                     | Exit 0, all tests pass (or N/A if no tests) |
| **Lint**       | `npm run lint`                                                 | Exit 0                      |
| **Start**      | `npm run dev` or `bash launch-gemini.sh`                       | Both ports 13000, 13001 listening |
| **Dev**        | `npm run dev`                                                  | Vite HMR active, MCP reachable |

### Verification sequence after any change:
```bash
npm run type-check && npm run lint && npm run build
# Then verify ports: lsof -i :13000,:13001 | grep LISTEN
```

---

## Port Allocation

| Port         | Service                                   | Status                              |
|--------------|-------------------------------------------|-------------------------------------|
| **13000**    | Vite HTTP frontend                        | **CLAIMED** in `port-registry.json` |
| **13001**    | MCP backend WebSocket                     | **CLAIMED** in `port-registry.json` |

**Rules:**
- This project runs on ports **13000** and **13001**. Both are claimed in `/Volumes/SanDisk1Tb/SSOT/port-registry.json`.
- Do not change these ports without Douglas Talley's explicit approval.
- Do not bind to any port in the forbidden list (see `.supercache/manifests/port-allocation-policy.yaml`).
- Verify before starting: `lsof -i :13000,:13001` — if something else is bound, investigate before killing.
- **Port cleanup policy**: The launcher (`launch-gemini.sh`) may only kill processes on 13000 and 13001 that it specifically started. No mass port kill without Douglas's explicit order.

---

## Project-Specific Rules

| #   | Rule                                                                | Rationale                                                     |
|-----|---------------------------------------------------------------------|---------------------------------------------------------------|
| R1  | Icon must display in Finder when GEMINI.app is in /Applications      | User experience — one-click launch is core value prop         |
| R2  | Launcher must reuse existing Terminal windows from previous instance | Prevent Terminal window proliferation on repeated launches    |
| R3  | Launcher must track and clean up only processes it started          | Port cleanup policy compliance — no orphaned processes        |
| R4  | MCP server on 13001 must NOT be mass-killed by other projects       | Port isolation — each project owns its claimed ports          |
| R5  | App bundle must include self-cleanup logic on second instance       | Graceful lifecycle — Terminal windows close, old services exit |

---

## Known Patterns & Lessons

| Pattern                     | Trigger                                  | Fix                                                   | Confidence       |
|-----------------------------|------------------------------------------|-------------------------------------------------------|------------------|
| ES module require error     | `require.main === module` in MCP server  | Remove conditional, unconditionally execute `new MCPServer().start()` | 1.0 |
| Icon not displaying         | Icon file exists but Finder shows white icon | Use `SetFile -a C`, invalidate cache with `touch` | 0.95 |
| Terminal window leak        | Running launcher twice creates 2 windows | Track Terminal PID, reuse if alive, clean on exit | 0.9 |
| Port conflict on startup    | EADDRINUSE error                         | Check if own process or other; kill only own via PID  | 0.95 |

---

## Environment Variables

| Variable          | Required        | Purpose               | Example               |
|-------------------|-----------------|-----------------------|-----------------------|
| `GEMINI_API_KEY`  | Yes             | Google Gemini API key | `AIzaSy...` (from Google Cloud) |

---

## Execution Contract

Before claiming any task complete, provide:

1. **Exact action taken** — what you did, specifically
2. **Direct evidence** — file path + line, command + output, diff, or screenshot
3. **Verification result** — run the verification sequence above, all must exit 0
4. **Status** — mark COMPLETE only after steps 1-3 are proven

See `.supercache/contracts/execution-contract.md` for the full contract.

---

## Mandatory execution contract
For EACH requested item:
1) Show exact action taken
2) Show direct evidence (file/line/command/output)
3) Show verification result
4) Mark status only after proof

## Forbidden behaviors
- Declaring "done" without evidence
- Collapsing multiple requested items into one vague summary
- Skipping failed steps without explicit blocker report

## Required output structure
A) Requested items checklist
B) Per-item evidence ledger
C) Verification receipts
D) Completeness matrix (item -> done/blocked -> evidence)

## Hard gate
If any requested item has no evidence row, final status MUST be INCOMPLETE.
