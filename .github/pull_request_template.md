<!--
CareerRai PR template — operationalizes ENGINEERING_PLAYBOOK.md §4.
Fill every section honestly. A PR that can't fill these isn't ready.
-->

## Business objective
<!-- What student/founder outcome does this serve? -->

## Operating System(s) touched
<!-- Notification / Growth / Learning / Trust / Analytics — and which of its
     non-negotiables this change is checked against. Confirm no violation. -->

## Architecture impact & systems affected
<!-- What systems does this touch? Did it expand a system (good) or bolt a
     feature onto the side (reconsider)? Any new source of truth? -->

## Files changed
<!-- The notable ones and why. -->

## Risks & failure modes
<!-- What breaks if this is wrong? Who becomes unreachable / blocked? -->

## Rollback
<!-- How to undo. Is risky behaviour behind a flag? -->

## Metrics & observability
<!-- What metric proves this works? What surfaces the failure? Event/dashboard? -->

## Testing evidence
<!-- Typecheck / lint / build clean. What was tested (matrix in Playbook §5).
     For push changes: which device/permission/network states. Production
     verification with real numbers. -->

## Known limitations & future work
<!-- What this deliberately does NOT do yet. -->

---
- [ ] Obeys the relevant OS Constitution (no violation shipped)
- [ ] Typecheck · lint · build clean
- [ ] One source of truth; no duplicated logic introduced
- [ ] Observability wired; no silent failure path
- [ ] Rollback understood; risky behaviour flagged
- [ ] No secret, no invented stat, no model identifier in any artifact
