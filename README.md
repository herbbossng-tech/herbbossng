# COD Commerce

A multi-country cash-on-delivery commerce platform: landing-page engine, order capture, order/inventory/customer management, and a full admin dashboard. See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the architecture, data model, and phase-by-phase implementation status.

## Stack

Next.js (App Router, TypeScript) · PostgreSQL + Prisma · Tailwind CSS · Zod · Nodemailer · Recharts.

## Local setup

```bash
npm install

# 1. Point DATABASE_URL at a Postgres database, and set APP_SECRET / SESSION_SECRET.
cp .env.example .env
# generate secrets:
openssl rand -hex 32   # -> APP_SECRET
openssl rand -hex 32   # -> SESSION_SECRET

# 2. Apply the schema
npx prisma migrate dev

# 3. Seed sample data: Nigeria/Kenya/Ghana offices, a demo product with offers,
#    a published landing page, email templates, and a super admin user.
npx prisma db seed

# 4. Run the app
npm run dev
```

Then visit:

- `http://localhost:3000/admin` — admin dashboard (seeded login printed by the seed script; see below)
- `http://localhost:3000/ginseng-five-treasures-tea?office=NG` — the seeded landing page (swap `NG` for `KE` or `GH` to see multi-country pricing/currency/locations switch)

The seed script prints the super admin email/password it creates — **change that password after first login.**

## Notes

- SMTP and Meta Pixel/Conversions API are fully wired but need real credentials entered under **Settings** / **Marketing** in the admin to actually send mail or fire conversion events.
- Uploaded media is written to `public/uploads` (local disk) — see `lib/storage.ts` for the swap point to S3-compatible storage before deploying.
