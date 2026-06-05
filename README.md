# CareerRai Daily Tracker

A daily accountability and progress tracking app for CAT/CUET exam aspirants paired with IIM mentors (Buddies).

## What it does

Three roles use this app:

- **Student** — Fills a 90-second daily report (study hours, topics, mood, mock scores). Sees their own trends, streak, and buddy feedback.
- **Buddy** — Sees all assigned students' consolidated reports, red flags, and writes feedback + next steps.
- **Admin** — (Phase 2) Platform overview, student/buddy assignments, broadcasts.

## Running locally

**Requirements:** Node.js v18+, a Supabase project with schema applied.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Demo logins (password: `CareerRai2026!`)

| Role | Email |
|------|-------|
| Student (Aarav) | aarav@careerrai.com |
| Student (Priya) | priya@careerrai.com |
| Buddy (Nishant) | nishant@careerrai.com |
| Admin | admin@careerrai.com |

See `SETUP_NOTES.md` for full credentials and deployment guide.

## Project structure

```
src/app/student/   Student dashboard (Home, Today, Reports, Exams, Profile)
src/app/buddy/     Buddy dashboard (Students, Trends, Profile)
src/app/login/     Login page
src/lib/           Supabase clients, analytics engine, notifications
supabase/          SQL schema migrations
scripts/           Seed script for demo data
```

## Tech stack: Next.js 16 + TypeScript · Tailwind CSS · Supabase · Vercel

## Getting Started (original)

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
