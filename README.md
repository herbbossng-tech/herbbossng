# Golden COD — Commerce OS

Operations dashboard for a cash-on-delivery (COD) commerce business: orders, delivery
confirmation calls, revenue collection, media buyer payouts, and product/brand management.

## Stack

React · TypeScript · Vite · Tailwind CSS v4 · shadcn/ui-style components · React Router ·
React Hook Form + Zod · TanStack Query · Recharts · Framer Motion · Lucide Icons

## Getting started

```bash
npm install
npm run dev
```

## Structure

- `src/components/layout` — sidebar, top bar, app shell
- `src/components/dashboard` — stat cards, charts, status badges
- `src/components/ui` — shared shadcn-style primitives (button, card, badge, progress, separator)
- `src/pages` — routed pages (Dashboard Overview is fully built; other sections are
  placeholders wired up for the next milestone)
- `src/data` — navigation config and mock data powering the current preview

The Dashboard Overview page is currently running on mock data so the UI/UX can be reviewed
before wiring up real orders, payments, and staff features.
