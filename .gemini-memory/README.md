# Gemini Agent Memory

This directory is the **persistent memory store** for the GEMINI for macOS agent.
The agent may read and write any file here across sessions using the Desktop
Commander MCP tools (`read_file`, `write_file`, `list_directory`).

## Layout

- `session.md` — current session scratchpad. Overwrite freely.
- `summary.md` — short rolling summary of long-lived facts (< 200 lines).
- `facts/` — one small file per durable fact (user preferences, project state).
- `tasks.md` — open/blocked tasks the agent should remember across sessions.

## Rules

1. Before answering a new user turn, the agent SHOULD `read_file` on
   `summary.md` if it exists, so prior context is restored.
2. After a meaningful exchange the agent SHOULD `write_file` an updated
   `summary.md` — durable facts only, no chat transcripts.
3. Never store secrets (API keys, tokens) here.
4. Keep individual files small. Split before any file passes ~400 lines.
