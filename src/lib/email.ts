import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM = 'CareerRai <noreply@careerrai.com>';

function log(subject: string, to: string) {
  console.log(`[Email stub] To: ${to} | Subject: ${subject}`);
}

export async function sendDailyReminder(to: string, name: string) {
  const subject = `Hey ${name} — your 90-second log is ready 🔥`;
  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
      <h2 style="font-size:20px;color:#1c1917">CareerRai Daily Check-in</h2>
      <p style="color:#57534e">Hey ${name},</p>
      <p style="color:#57534e">Your daily report is pending. It takes 90 seconds — track your study hours, mock scores, and mood so your buddy can support you.</p>
      <a href="https://careerrai-daily.vercel.app/student/today" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#1c1917;color:white;border-radius:10px;text-decoration:none;font-weight:600">
        Fill today's report →
      </a>
      <p style="margin-top:24px;font-size:12px;color:#a8a29e">CareerRai · Bharat-first peer mentorship · 0% commission</p>
    </div>
  `;
  if (!resend) { log(subject, to); return; }
  await resend.emails.send({ from: FROM, to, subject, html });
}

// Builder-recovery ladder email (touch 1: 30min, touch 2: 24h, touch 3: 72h).
// Mid-Builder students usually haven't granted push yet, so email is the
// primary channel for this segment. Copy rule: proof of saved progress +
// the short remaining path — never "come back".
export async function sendBuilderRecovery(
  to: string,
  name: string,
  stepLabelText: string,
  screensLeft: number,
  touch: number
) {
  const hasName = name && name !== 'there';
  const subject =
    touch === 1 ? `${hasName ? `${name}, your` : 'Your'} CAT plan is ${screensLeft} screen${screensLeft === 1 ? '' : 's'} from done`
    : touch === 2 ? `Your CAT plan is still saved at "${stepLabelText}"`
    : 'Two minutes finishes your CAT plan';
  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
      <h2 style="font-size:20px;color:#1c1917">Your plan is saved — not lost</h2>
      <p style="color:#57534e">${hasName ? `Hey ${name}, e` : 'E'}verything you entered is safe. You stopped at <strong>${stepLabelText}</strong> — ${screensLeft} screen${screensLeft === 1 ? '' : 's'} left, about 2 minutes.</p>
      <p style="color:#57534e">The moment it's done, CareerRai builds today's routine around the time you actually have.</p>
      <a href="https://careerrai-daily.vercel.app/student/tracker" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#1c1917;color:white;border-radius:10px;text-decoration:none;font-weight:600">
        Finish my plan →
      </a>
      <p style="margin-top:24px;font-size:12px;color:#a8a29e">CareerRai · Bharat-first peer mentorship · 0% commission</p>
    </div>
  `;
  if (!resend) { log(subject, to); return; }
  await resend.emails.send({ from: FROM, to, subject, html });
}

export async function sendBuddyWeeklyDigest(
  to: string,
  buddyName: string,
  students: Array<{ name: string; score: number; band: string; redFlags: string[] }>
) {
  const subject = `Weekly digest: ${students.length} student${students.length !== 1 ? 's' : ''} — ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`;
  const rows = students.map(s => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #e7e5e4">
        <strong style="color:#1c1917">${s.name}</strong>
        ${s.redFlags.length > 0 ? `<br/><span style="color:#e11d48;font-size:12px">⚠ ${s.redFlags[0]}</span>` : ''}
      </td>
      <td style="padding:10px 0;border-bottom:1px solid #e7e5e4;text-align:right;color:${s.score >= 70 ? '#0f766e' : s.score >= 50 ? '#b45309' : '#dc2626'};font-weight:700">
        ${s.score}/100
      </td>
    </tr>
  `).join('');
  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
      <h2 style="font-size:20px;color:#1c1917">Weekly digest — ${buddyName}</h2>
      <p style="color:#57534e">Here's how your students did this week:</p>
      <table style="width:100%;border-collapse:collapse">${rows}</table>
      <a href="https://careerrai-daily.vercel.app/buddy/students" style="display:inline-block;margin-top:20px;padding:12px 24px;background:#1c1917;color:white;border-radius:10px;text-decoration:none;font-weight:600">
        View full dashboard →
      </a>
      <p style="margin-top:24px;font-size:12px;color:#a8a29e">CareerRai · Bharat-first peer mentorship</p>
    </div>
  `;
  if (!resend) { log(subject, to); return; }
  await resend.emails.send({ from: FROM, to, subject, html });
}

export async function sendRedFlagAlert(
  buddyEmail: string,
  buddyName: string,
  studentName: string,
  flags: string[]
) {
  const subject = `⚠️ Red flag alert: ${studentName} needs attention`;
  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
      <h2 style="font-size:20px;color:#dc2626">⚠️ Red flag — ${studentName}</h2>
      <p style="color:#57534e">Hey ${buddyName}, ${studentName} has triggered red flags that need your attention:</p>
      <ul style="color:#9f1239;padding-left:20px">
        ${flags.map(f => `<li style="margin:6px 0">${f}</li>`).join('')}
      </ul>
      <a href="https://careerrai-daily.vercel.app/buddy/students" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#dc2626;color:white;border-radius:10px;text-decoration:none;font-weight:600">
        Check in with ${studentName.split(' ')[0]} →
      </a>
      <p style="margin-top:24px;font-size:12px;color:#a8a29e">CareerRai · Bharat-first peer mentorship</p>
    </div>
  `;
  if (!resend) { log(subject, buddyEmail); return; }
  await resend.emails.send({ from: FROM, to: buddyEmail, subject, html });
}
