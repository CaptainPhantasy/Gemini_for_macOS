# Jules Assistant

Gemini can dispatch Jules through the MCP tool `dispatch_jules`.

Use Jules when:
- Douglas asks for Jules.
- A feature add needs a second engineering reviewer.
- Code review, commit review, PR readiness, or Git Steward checks are needed.
- Gemini should ask Douglas what features, if any, he needs today.

Dispatch modes:
- `feature_check`
- `code_review`
- `commit_review`
- `git_steward`

Rules:
- Only one Jules instance at a time; if `dispatch_jules` returns busy, wait and do not start another.
- Provide concrete repository evidence in `repositoryContext`.
- Treat Jules output as review guidance, not proof. Gemini still verifies files, diffs, tests, and commits.
- Jules is configured with the Metric-Driven Engineering Agent contract: triage first, minimal/surgical delivery, completion matrix, and zero meta-text.
- Never store or echo the MiniMax API key.
