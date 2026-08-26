-- ── The channel the code was already using, and the table refused ───────────
--
-- Found by the final completion audit, and it is my own defect from the same
-- day: the dna approve route claims with channel='approved_push', the TS type
-- was widened to match — and this check constraint never was. Every approved
-- convert_now claim therefore died with a check_violation, claimBuddyPitch
-- reported claim_failed, and fail-closed did exactly its job: no pitch, no
-- rule break — but also no approved push, EVER, with the decision bouncing
-- back to pending_approval each time.
--
-- The lesson the audit wrote down: a channel exists only when the TS type,
-- the DB constraint, the runtime path and the tests all agree. Three of four
-- was a feature that could never fire.
--
-- 'approved_push' covers the two founder-triggered pitch sends: the Brain's
-- approved convert_now, and the campaign-push waves (gated in the same fix).

alter table public.promo_impressions drop constraint promo_impressions_channel_check;
alter table public.promo_impressions
  add constraint promo_impressions_channel_check
  check (channel in ('modal', 'notification', 'onboarding', 'approved_push'));
