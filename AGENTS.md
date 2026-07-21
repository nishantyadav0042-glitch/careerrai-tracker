<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Notification OS — read before touching notifications

Notifications are infrastructure at CareerRai, governed by a binding constitution.
**Before writing or changing any notification code** (push, in-app, WhatsApp,
email, reminders, delivery, permission, health), read `docs/NOTIFICATION-OS.md`
and obey it. The Execution Manual (`docs/NOTIFICATION-OS-EXECUTION.md`) covers how
to build and validate against it. If a change would violate the constitution, the
change is wrong — escalate to the founder, don't ship the violation.
