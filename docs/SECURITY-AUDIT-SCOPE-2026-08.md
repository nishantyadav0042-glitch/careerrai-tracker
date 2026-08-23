# Security audit — scope, evidence quality, and limits

**READ-ONLY. Nothing modified.** 23 Aug 2026.

## Audited artefact

| | |
|---|---|
| Commit | `abdb2c0` on `claude/status-update-t1g5as` |
| Production deploy | `dpl_FU5qsit…` = `f97f92c` (main), READY, `careerrai.in` |
| **Branch is AHEAD of production** | the 9 B3b migrations are NOT deployed |
| Supabase (prod) | `pobhpszlsozeonejtzqy` |
| Vercel project | `prj_u0nHt9NEO8a5UmItuDe3ESA4dFh7` |
| Repository visibility | **PUBLIC** |

## Evidence I have

- Full source tree, git history, migrations, tests, workflows
- **Live production database**: `pg_class`, `pg_policies`, grants, triggers,
  function bodies — read-only SQL
- Vercel deployment metadata, runtime error groups, cron schedules

## Evidence I do NOT have — and what it costs

| Missing | Consequence |
|---|---|
| **Production env var values** | Cannot verify secret presence/scoping. `SECURITY_ALERT_WEBHOOK_URL` was cleared only by founder testimony |
| **Ability to issue authenticated HTTP requests as a test student/mentor** | **No IDOR PoC can be executed.** Every authorization finding is static-analysis only |
| Network egress to `careerrai.in` | blocked by this environment's proxy (403). No live probing |
| Staging/preview environment | Preview-vs-production isolation is UNVERIFIED |
| Client bundle output | No build artefact inspected for leaked secrets |

**This is the single most important limitation: Phase 19 (adversarial PoCs)
cannot be executed from this environment at all.** Every "no vulnerability
found" in an authorization context therefore means *"not found by reading
code"*, never *"proven unexploitable"*.

## Tools used

`grep`/`ripgrep`, file reading, read-only SQL via Supabase MCP, Vercel MCP
metadata, the repo's own test suite.

## Corrections made to my own method during this audit

Recorded because a scan that mislabels is worse than no scan:

1. **First `createAdminClient` classifier reported 48 ungated files.** Wrong —
   it searched for `requireAdmin|isAdmin(` and the codebase's actual admin gate
   is **`isRequestAdmin()`**. I nearly reported `/api/admin/dna/[studentId]` as
   a P0 cross-student data-exposure route. **It is correctly gated.**
2. **Second pass still mislabelled `install/handoff`** as ungated: it
   authenticates with `auth.getSession()`, which my pattern did not include.
3. Corrected figure: **14 ungated routes**, all legitimately pre-auth.

Both errors were false *positives*. I have no way to prove my scans have no
false *negatives*, which is why the gate vocabulary is now written down.
