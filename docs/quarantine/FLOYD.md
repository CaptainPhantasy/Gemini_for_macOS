# GEMINI for MacOS — FLOYD.md
**Version:** 1.7.0
**Initialized:** 2026-04-15
**Governance Bumped:** 2026-05-27T (this session)
**Governance:** .supercache/ v1.7.0
**Port:** 13000 (Vite frontend) + 13001 (MCP WebSocket backend) — claimed in port-registry.json
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
4. Read `SSOT/GEMINI_for_MacOS_SSOT.md` for current project state. Perform the Verification Sweep Protocol defined in `.supercache/contracts/document-management.md` for sections relevant to your task.
5. Read `Issues/GEMINI_for_MacOS_ISSUES.md` for open issues and blockers.
6. Read `.supercache/manifests/port-allocation-policy.yaml` — NEVER use port 3000, 5000, 8000, 8080, or any other forbidden port. This project uses ports **13000** (Vite frontend) and **13001** (MCP backend). Do not change them without Douglas Talley's explicit approval.
7. Read `.supercache/contracts/execution-contract.md` — this governs how you prove your work.
8. Read `.supercache/contracts/repo-structure.md` — canonical layout for this project's language, plus the migration workflow if structural changes are needed.
9. Read `.supercache/contracts/git-discipline.md` — pre-commit checklist, commit message standards, secret hygiene, and reputation guardrails.
10. Read `.supercache/contracts/document-management.md` — Anti-Cruft Rule, canonical document homes, SSOT verification sweep, reference materials tier.
11. Read `.supercache/contracts/repo-hygiene.md` — `.gitignore` baseline for this language, cleanup triggers, project root tidiness standards.
12. Read `.supercache/contracts/repo-sanitation.md` — **agents do not delete; quarantine to `.floyd/quarantine/<YYYY-MM-DD>/`** with WHY.md + LEDGER.jsonl. Only Douglas empties quarantine.
13. Read `.supercache/manifests/model-routing.yaml` — this tells you which LLM to use for what.
14. Read `.floyd/rules.md` — MECHANICALLY ENFORCED execution contract. Every rule is enforced.
15. Read `SSOT/repository_report.json` — must be `_verified: true` with `_critic_rounds >= 3` before any implementation work.

### Governance Location
```
.supercache/ → /Volumes/SanDisk1Tb/.supercache/
```
This directory contains global templates, contracts, manifests, and routing config.
It is **READ-ONLY**. Do not create, modify, or delete any file there.

### Where You Write

| Location             | Purpose                                          | Example                                                              |
|----------------------|--------------------------------------------------|----------------------------------------------------------------------|
| `SSOT/`              | Project status, decisions, findings, verification | `SSOT/GEMINI_for_MacOS_SSOT.md`, `SSOT/repository_report.json`       |
| `Issues/`            | Bugs, blockers, tasks, help-desk ledger          | `Issues/GEMINI_for_MacOS_ISSUES.md`, `Issues/0001-description.md`    |
| `.floyd/`            | Agent working state, session logs, runtime cache | `.floyd/agent_log.jsonl`, `.floyd/quarantine/<YYYY-MM-DD>/`          |
| Project source files | Your actual work                                 | Any file in the project tree not listed below                        |

### Where You Do NOT Write

| Location                          | Reason                                                                |
|-----------------------------------|-----------------------------------------------------------------------|
| `.supercache/`                    | Global governance — READ-ONLY for all agents                          |
| `launch-gemini.sh` PID tracking   | Managed by launcher, agent reads only                                 |
| `/Volumes/T7/`                    | Time Machine target — OFF LIMITS (no reads, no writes, no scans)      |
| `/Volumes/Storage/skillsdump/`    | Skills library — READ-ONLY reference                                  |

---

## Project Identity

| Field                | Value                                                                                                |
|----------------------|------------------------------------------------------------------------------------------------------|
| **Name**             | GEMINI for MacOS                                                                                     |
| **Purpose**          | Local-first desktop AI workspace (Gemini) with Desktop Commander MCP integration                     |
| **Primary Language** | TypeScript (ES2022, strict)                                                                          |
| **Runtime**          | Node.js ≥ 22.0.0                                                                                     |
| **Module System**    | ESM                                                                                                  |
| **Framework**        | React 19, Vite 6, Express 4, ws (WebSocket)                                                          |
| **Database**         | IndexedDB (via `idb`) for client-side persistence; no server-side DB                                 |
| **Port**             | **13000** (Vite) + **13001** (MCP WebSocket) — claimed in `/Volumes/SanDisk1Tb/SSOT/port-registry.json` |
| **Repository**       | github.com/CaptainPhantasy/Gemini_for_macOS                                                          |
| **Current Phase**    | Active development — substantive product, organizational debt in repo layout                         |

---

## Project Structure

```
GEMINI for MacOS/
├── src/
│   ├── server/
│   │   ├── mcp-server.ts               # MCP backend (port 13001, WebSocket)
│   │   └── jules-agent.ts              # Jules agent dispatch
│   ├── lib/                            # 40 modules: mcp, storage, autosave, oauth-handler, security, generation-wrapper, etc.
│   ├── components/                     # 26 React components: Chat, Canvas, LiveMode, Settings, CommandPalette, etc.
│   ├── hooks/                          # useMediaStream and other custom hooks
│   ├── config/security-headers.ts      # Security configuration
│   ├── __tests__/                      # 17 Vitest test files
│   ├── App.tsx                         # Main React app
│   ├── main.tsx                        # React entry point
│   └── types.ts                        # Shared types
├── GEMINI.app/                         # macOS app bundle with launcher (TRACKED BINARY — see Issues for relocation plan)
│   └── Contents/
│       ├── MacOS/gemini                # AppleScript wrapper → launch-gemini.sh
│       ├── Info.plist                  # Bundle metadata
│       └── Resources/AppIcon.icns      # Multi-resolution icon
├── public/                             # Static assets (~75MB media — splash.mp4 45M, splash.mov 18M, rereadme-cover.mp4 8.7M)
├── playwright/                         # E2E test scaffold
├── scripts/run-scheduled-action.js     # Scheduled action runner (called by cron/launchd)
├── launch-gemini.sh                    # Launcher: terminal mgmt + service startup
├── start.sh                            # Alt launcher (overlap with launch-gemini.sh — see Issues)
├── SSOT/                               # Project state + repository_report.json (governance)
├── Issues/                             # Issues ledger
├── .floyd/                             # Agent working state + agent_log.jsonl
├── .env / .env.example                 # GEMINI_API_KEY (DO NOT COMMIT real .env)
├── package.json / package-lock.json    # 22 runtime deps + 16 dev deps
├── vite.config.ts / vitest.config.ts   # Build + test configs
├── tsconfig.json                       # TS strict mode, ES2022, bundler resolution
├── playwright.config.ts                # Playwright config
├── README.md                           # Public-facing intro (narrative)
├── ReReadMe.MD                         # Intentional sequel to README.md (do NOT consolidate — narrative is part of project identity)
├── CLAUDE.md                           # Claude-specific adapter (optional)
└── FLOYD.md                            # This file
```

**Known structural debt** (tracked as Issues per `repo-hygiene.md`):
- 13 untracked ad-hoc `.cjs`/`.js`/`.mjs` debug scripts at repo root (`test-desktop-commander*.cjs`, `check-ports.{cjs,js}`, `test-mcp-api.{cjs,js}`, etc.) — see ISSUE-0002.
- `Documents/` at root holds working/plan documents that should live under `docs/adr/` per `document-management.md` — see ISSUE-0003.
- `GEMINI.app/Contents/MacOS/gemini` tracked binary is a build artifact in source control — see ISSUE-0004.
- 17 `.DS_Store` files in tracked directories (gitignored but resident) — see ISSUE-0005.
- `src/lib/api-routes.ts.backup` and `.mcp.json.bak-dedupe-20260524-131533` are backup files — see ISSUE-0006.
- Tracked `FLOYD.md` deletion (`D FLOYD.md`) restored this session — see ISSUE-0007.

---

## Build & Verify Commands

| Action         | Command                                                        | Expected Result                                          |
|----------------|----------------------------------------------------------------|----------------------------------------------------------|
| **Type check** | `npm run type-check`                                           | Exit 0, no errors                                        |
| **Build**      | `npm run build`                                                | Exit 0, `dist/` created                                  |
| **Test**       | `npm test`                                                     | Exit 0 (Vitest); 17 spec files in `src/__tests__/`       |
| **Lint**       | `npm run lint`                                                 | Exit 0 — NOTE: aliased to `tsc --noEmit` (no real ESLint/Biome — see ISSUE-0008) |
| **Start**      | `npm run dev` or `bash launch-gemini.sh`                       | Both ports 13000, 13001 listening                        |
| **Dev**        | `npm run dev`                                                  | Vite HMR active on 13000, MCP reachable on 13001         |

### Verification sequence after any change:
```bash
npm run type-check && npm run build && npm test --run
# Then verify ports: lsof -i :13000 -i :13001 | grep LISTEN
```

---

## Port Allocation

| Port         | Service                              | Status                              |
|--------------|--------------------------------------|-------------------------------------|
| **13000**    | Vite HTTP frontend (127.0.0.1 only)  | **CLAIMED** in `port-registry.json` |
| **13001**    | MCP backend WebSocket (Express + ws) | **CLAIMED** in `port-registry.json` |

**Rules:**
- This project runs on ports **13000** and **13001**. Both are claimed in `/Volumes/SanDisk1Tb/SSOT/port-registry.json`.
- Neither port is in the forbidden list (3000, 3001, 3002, 4000, 4200, 5000, 5173, 5174, 5500, 8000, 8080, 8081, 8443, 8888, 9000, 9090) per `.supercache/manifests/port-allocation-policy.yaml`.
- Do not change these ports without Douglas Talley's explicit approval.
- Verify before starting: `lsof -i :13000 -i :13001` — if something else is bound, investigate before killing.
- **Port cleanup policy**: The launcher (`launch-gemini.sh`) may only kill processes on 13000 and 13001 that it specifically started. No mass port kill without Douglas's explicit order.

---

## Project-Specific Rules

| #   | Rule                                                                                  | Rationale                                                          |
|-----|---------------------------------------------------------------------------------------|--------------------------------------------------------------------|
| R1  | Icon must display in Finder when GEMINI.app is in /Applications                       | One-click launch is core value prop                                |
| R2  | Launcher must reuse existing Terminal windows from previous instance                  | Prevent Terminal window proliferation                              |
| R3  | Launcher must track and clean up only processes it started                            | Port-cleanup policy compliance                                     |
| R4  | MCP server on 13001 must NOT be mass-killed by other projects                         | Port isolation — each project owns its claimed ports               |
| R5  | App bundle must include self-cleanup logic on second instance                         | Graceful lifecycle                                                 |
| R6  | Vite must bind to `127.0.0.1` only — never `0.0.0.0`                                  | Caddy/Tailserve gateway is the only public entry path              |
| R7  | `.env` and `.env.local` MUST NEVER be committed; only `.env.example` is tracked       | Secret hygiene per `.supercache/contracts/git-discipline.md` §3    |
| R8  | No deletions. Removal of any file goes through `.floyd/quarantine/<YYYY-MM-DD>/`      | Per `.supercache/contracts/repo-sanitation.md` §2 (Rule 1)         |

---

## Known Patterns & Lessons

| Pattern                     | Trigger                                  | Fix                                                                  | Confidence |
|-----------------------------|------------------------------------------|----------------------------------------------------------------------|------------|
| ES module require error     | `require.main === module` in MCP server  | Remove conditional, unconditionally execute `new MCPServer().start()` | 1.0        |
| Icon not displaying         | Finder shows white icon                  | `SetFile -a C`, invalidate cache with `touch`                        | 0.95       |
| Terminal window leak        | Running launcher twice creates 2 windows | Track Terminal PID, reuse if alive, clean on exit                    | 0.9        |
| Port conflict on startup    | `EADDRINUSE` error                       | Check if own process or other; kill only own via PID                 | 0.95       |
| `.env` pollution            | `process.env.GEMINI_API_KEY` ambiguous   | Explicit `dotenv.parse` of `.env.local` in `vite.config.ts`          | 0.95       |

---

## Environment Variables

| Variable           | Required | Purpose                          | Example                            |
|--------------------|----------|----------------------------------|------------------------------------|
| `GEMINI_API_KEY`   | Yes      | Google Gemini API key            | `AIzaSy...` (from Google Cloud)    |
| `DISABLE_HMR`      | No       | Disable Vite HMR (for AI Studio) | `true`                             |

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
- Running any deletion command (rm, rm -rf, git clean, unlink, etc.) — quarantine instead per `repo-sanitation.md` §2

## Required output structure
A) Requested items checklist
B) Per-item evidence ledger
C) Verification receipts
D) Completeness matrix (item -> done/blocked -> evidence)
E) Quarantine ledger summary (if any quarantine activity occurred)

## Hard gate
If any requested item has no evidence row, final status MUST be INCOMPLETE.
If any agent ran a deletion command, final status MUST be VIOLATION and the session MUST escalate to Douglas before continuing.
