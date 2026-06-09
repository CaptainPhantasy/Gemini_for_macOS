# Contributing to GEMINI for MacOS

## Or: How to Not Break Things While We're Sleeping

**DOCUMENT CLASSIFICATION:** Contribution Guide / Anti-Corporate Manifesto
**DATE RECORDED:** 2026-06-09 — Way Too Late At Night
**LOCATION:** The Garage, Brown County, Indiana
**BEVERAGE:** Coffee that tastes like motor oil (fresh pot)
**CURRENT STATE:** Caffeinated and Opinionated

First off, if you're here to contribute, thank you. We built this because existing solutions pissed us off, and if you're reading this, they probably pissed you off too.

## The "Just Do The Thing" Workflow

We don't do twelve-step approval rituals or alignment meetings about future alignment meetings. Here is how you contribute:

1. **Setup**: Read `DEVELOPMENT.md`. It takes 30 seconds.
2. **Branching**: Branch off `main`. Name it whatever you want, just make it descriptive.
3. **Commits**: Use conventional commits. It makes the changelog less of a nightmare.
4. **Testing**: Run `bun run test`. If it breaks, fix it. We have 42,000+ lines of code and we'd like to keep them working.
5. **Pull Requests**: Open a PR. Keep it surgical. Touch only what you must.

## Code Style (Or: Why We Have Rules)

- We use ESLint and Prettier. Run `bun run lint` before committing.
- Don't argue with the linter. It's 3 AM, we don't have the energy.
- Follow the patterns in `docs/architecture/`. We wrote them for a reason.

## Architecture

Read `docs/architecture/` and `docs/plans/` before you start ripping out load-bearing walls. 

**DOCUMENT ENDS**

*— Douglas*
*Floyd's Labs — Engineering*
*"Because spite is a valid engineering motivation."*

┌──────────────────────────────────────────────────────────┐
│  DOCUMENT METADATA                                        │
├──────────────────────────────────────────────────────────┤
│  Classification:   CONTRIBUTING GUIDE                     │
│  Cat Supervision:  Bella Approved / Bowser Monitoring     │
│  "I Don't Suck":   ✅ PASS                                │
│  Corporate Feelings: HURT (intended)                      │
└──────────────────────────────────────────────────────────┘
