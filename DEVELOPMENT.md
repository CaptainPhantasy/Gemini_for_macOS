# Development Guide

## Or: How to Run This Thing Locally

**DOCUMENT CLASSIFICATION:** Setup Guide / Reality Check
**DATE RECORDED:** 2026-06-09 — Way Too Late At Night
**LOCATION:** The Garage, Brown County, Indiana
**BEVERAGE:** Coffee that tastes like motor oil (fresh pot)
**CURRENT STATE:** Caffeinated and Opinionated

This is how you run GEMINI for MacOS locally. It respects your machine and doesn't phone home every five seconds.

## Prerequisites (The Bare Minimum)

- [Bun](https://bun.sh/) (v1.x)
- Node.js (v26.x recommended)

## Setup (Takes 30 Seconds)

1. Clone it.
2. Install the things:
   ```bash
   bun install
   ```
3. Copy the env file:
   ```bash
   cp .env.example .env
   ```
   Put your keys in there. Gemini is our friend, but you still need a key.

## Running Locally

Start the whole stack (Vite frontend + 13 MCP servers):

```bash
bun run dev
```

## Testing (Because We're Not Savages)

Run the tests. We wrote them so you don't break things at 2:47 AM.

```bash
bun run test
```

For the E2E stuff:

```bash
bun run test:e2e
```

## Architecture & Plans

If you want to know why we did something, read:
- `docs/architecture/`
- `docs/plans/`

**DOCUMENT ENDS**

*— Douglas*
*Floyd's Labs — Engineering*
*"In the garage, we answer to cats, not shareholders."*

┌──────────────────────────────────────────────────────────┐
│  DOCUMENT METADATA                                        │
├──────────────────────────────────────────────────────────┤
│  Classification:   DEVELOPMENT GUIDE                      │
│  Cat Supervision:  Bella Approved / Bowser Monitoring     │
│  "I Don't Suck":   ✅ PASS                                │
│  Corporate Feelings: HURT (intended)                      │
└──────────────────────────────────────────────────────────┘
