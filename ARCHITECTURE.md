# ARCHITECTURE — COD Commerce Platform

## 0. Repository audit

The repository was empty at the start of this work (only a 1-line `README.md`, single "Initial commit").
There is no existing framework, database, or design system to preserve — this is a greenfield build.
Everything below is a fresh decision, not a migration.

## 1. Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 14 (App Router, TypeScript) | SSR for landing pages (SEO/perf), server actions for admin CRUD, one deployable app |
| Database | PostgreSQL | Relational integrity for orders/inventory/money; matches spec |
| ORM | Prisma | Type-safe schema, migrations, good DX |
| Auth | Auth.js (NextAuth v5) Credentials + Prisma adapter, bcrypt | Self-hosted, no external IdP dependency, role stored on `User` |
| Styling | Tailwind CSS | Utility-first, matches "design system" requirement without a heavy component lib |
| Validation | Zod | Shared client/server schemas, used at every trust boundary |
| Email | Nodemailer against admin-configured SMTP | Provider-agnostic per spec (Mailgun/Gmail/Brevo/SendGrid/custom all just SMTP) |
| Charts | Recharts | Lightweight, works with RSC/client boundary |

## 2. Core architectural decisions

- **Office = country market.** One `Office` row = one country's full configuration (currency, phone rules,
  location hierarchy label, delivery defaults, order-number prefix, timezone). Nothing about a country is
  hard-coded in components; pages read the active office's config from the DB and render accordingly. Adding
  a country is a data operation (`/admin/offices/new`), never a code change.
- **Location hierarchy** is 3 levels under an Office: `Division` (State/County/Region — label itself is
  configurable per office) → `City` → `DeliveryArea` (optional, carries a fee override). This satisfies NG/KE/GH
  today and any future country without schema changes.
- **Pricing is server-only.** `src/lib/pricing.ts` is the single place that turns
  `(product, office, offer, quantity)` into `{unitPrice, paidQty, freeQty, subtotal, discount, shipping, tax,
  total}`. The order-creation API recomputes this from DB state and never trusts a client-submitted total —
  per spec §62/§38.
- **Landing pages are data, not components.** A `LandingPage` has ordered `LandingPageSection` rows; each
  section has a `type` (hero, problem, benefits, ingredients, how-it-works, comparison, testimonials, faq,
  guarantee, order, footer, custom) and a `data: Json` payload. One React renderer maps `type` → presentational
  component and feeds it `data`. Admin edits `data` through a structured form (per section 44 — no drag/drop
  builder). This is how the same engine serves the Ginseng Five Treasures Tea page and future products/pages
  without new code.
- **Currency formatting is centralized** in `src/lib/currency.ts`, driven entirely by fields on `Office`
  (symbol, position, decimal places, separators) — no `if (country === 'NG')` anywhere in the UI.
- **Inventory strategy is configurable per office** (`Office.inventoryStrategy`: `RESERVE_ON_ORDER` /
  `DEDUCT_ON_CONFIRM` / `DEDUCT_ON_DISPATCH`). All stock changes go through `src/lib/inventory.ts`, which writes
  an `InventoryMovement` audit row for every change — never a bare `UPDATE`.
- **RBAC** uses a `Role` enum on `User` (`SUPER_ADMIN, ADMIN, ORDER_MANAGER, INVENTORY_MANAGER,
  MARKETING_MANAGER, SUPPORT_STAFF`) checked in a `requireRole()` helper used by server actions/route handlers.
  A fully granular permission table is future work (noted below) — the enum covers the roles the spec lists
  without building a permissions engine nobody can configure yet.
- **Tracking** (`TrackingSetting` per office) stores Pixel ID, encrypted CAPI access token, GA4 ID. Purchase
  events fire client-side (Pixel/GA4) and server-side (CAPI) from the *same* `eventId` generated at order
  creation, so Meta can dedupe. The CAPI access token never reaches the browser — it's read server-side only.
- **SMTP credentials and Meta access tokens are encrypted at rest** (`src/lib/crypto.ts`, AES-256-GCM with a
  server-only `ENCRYPTION_KEY`) and never serialized to any client component or admin API response in plaintext
  (password fields are write-only from the admin UI).
- **Money is stored as integers (minor units)** is tempting but most of these currencies (NGN, KES, GHS) are
  commonly quoted whole; spec explicitly says "must not assume every currency uses two decimal places," so
  amounts are stored as `Decimal` in Postgres and formatting/rounding is entirely office-config-driven rather
  than baked into the storage type.

## 3. What is built in this pass

Phase 0–7 of the spec's phased plan, end to end and actually wired to Postgres (no mocked data, no fake admin
screens):

- Auth + admin shell + RBAC
- Offices/Countries/Currency engine + Locations (Division/City/DeliveryArea) admin CRUD
- Products + per-office pricing (`ProductOffice`) + images + admin CRUD
- Offers (package engine: fixed qty / buy-X-get-Y / percent / fixed discount) + per-office offer pricing
- Landing Page engine (sections-as-data) + a real seeded page for **Ginseng Five Treasures Tea** built from the
  content structure described in the brief (hero, problem, formula/ingredients, how-to-use, benefits,
  comparison, FAQ, testimonials, order section)
- Storefront: package selector (matches the reference card/badge/radio design), COD order form with
  country-driven fields, sticky mobile CTA, dynamic total
- Order creation API: idempotency key, rate limiting, server-side pricing recomputation, inventory movement,
  UTM/Meta/GA attribution capture
- Order admin: list (search/filter/sort/paginate), detail view, status workflow, status history, notes
- Customer admin: profile + order history + derived COD metrics (order count, delivery/cancellation rate)
- Inventory admin: stock view, manual adjustment, movement history
- SMTP settings (test connection + send test email) + Email template editor with variable substitution +
  automatic New Order (admin) and Order Confirmation (customer) emails on order creation
- Thank-you page (office-aware, dynamic order data)
- Tracking settings admin (Pixel/CAPI/GA4 config) + Pixel/GA4 client events + a CAPI send function wired to
  order creation (fires if a Pixel ID + access token are configured for the office)
- Audit log for admin mutations (status changes, price changes, product edits, inventory adjustments,
  settings changes)
- Seed data for Nigeria, Kenya and Ghana (offices, locations, one product, four offers, one published landing
  page each) to prove the multi-country architecture end to end

## 4. Explicitly deferred (marked, not faked)

Per spec §59 ("if a feature is not yet implemented, clearly mark it internally rather than pretending it
works"), these are scaffolded (schema + settings screens exist) but not fully built out in this pass:

- Second landing page (Revival Blend) as a *second product* proving multi-product reuse — schema/renderer
  supports it (it's the same engine that renders Ginseng Five Treasures Tea); only Ginseng Five Treasures Tea
  is seeded with full content in this pass. Creating it is an admin-only exercise (`/admin/landing-pages/new`),
  not a code change.
- Fraud/duplicate-pattern flags (same phone/multiple addresses) — schema captures phone/address on every order
  so this is a query away, but no dashboard surfacing yet.
- Granular per-permission RBAC (beyond the 6 roles) — noted above.
- Section editor UX: each `LandingPageSection.data` is edited as JSON in the admin (with a typed placeholder
  shown per section type) rather than a bespoke multi-field form per section. This keeps the CMS section-type-agnostic
  and still fully admin-editable; dedicated field-by-field forms per section type (as sketched in spec §44) is the
  natural next iteration once specific sections stabilize.
- S3/object storage for media — image upload currently stores to local `/public/uploads` with a
  `MediaAsset` table; swapping the storage adapter for S3 is a one-file change (`src/lib/storage.ts`) once
  credentials exist.
- Sitemap/robots.txt generation for many landing pages — a single seeded page exists; the route is present
  (`src/app/sitemap.ts`) but not yet iterating all published pages.

## 5. Database schema

See `prisma/schema.prisma` — entities: User, Office, Division, City, DeliveryArea, Brand, Category, Product,
ProductImage, ProductOffice, Offer, OfferOffice, LandingPage, LandingPageSection, MediaAsset, Customer, Order,
OrderStatusHistory, InventoryMovement, SmtpSetting, EmailTemplate, TrackingSetting, AnalyticsEvent, AuditLog,
Setting.

## 6. Dependency security posture

`npm audit` currently reports advisories in `next-auth`/`@auth/core` (beta line, no patched release yet),
`nodemailer` (advisories with "no fix available" as of this writing), and a broad range of `next@14.x–16.2.x`
advisories whose fix requires jumping to `next@16.3.3` — a breaking major upgrade (Next 15+ makes route
`params`/`searchParams` async, touching every dynamic route in this app) that was out of scope to safely land
and fully re-verify in this pass. `next` was bumped from the originally-scaffolded `14.2.18` to the latest
patched `14.2.35` within the same major as a safe interim step. Before production launch: track these three
advisories and upgrade once patched releases exist (`next-auth`/`nodemailer`), and budget a dedicated pass for
the Next 15/16 async-params migration.

## 7. Local development / testing

```
docker compose up -d db mailhog   # Postgres + a local SMTP catcher for testing email
cp .env.example .env
npm install
npx prisma migrate dev
npm run seed
npm run dev
```

Admin: `/admin` (seeded super admin credentials in `prisma/seed.ts` output).
Storefront: `/ginseng-five-treasures-tea` (office resolved via `?office=ng|ke|gh` in this pass — see
`src/lib/office-context.ts` for the resolution order: query param → cookie → default office).
