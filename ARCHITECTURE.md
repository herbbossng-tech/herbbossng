# COD Commerce — Architecture & Implementation Plan

## 0. Repository audit (starting state)

The repository contained only a `README.md` (12 bytes) on `main`. There was no
existing application, framework, database, or configuration to preserve. This
is therefore a greenfield build, not a migration — Phase 0's "reuse what's
good" instruction does not apply because nothing pre-existed.

## 1. Chosen stack

| Concern | Choice | Why |
|---|---|---|
| Framework | Next.js 15 (App Router), TypeScript | SSR/SSG for fast landing pages, API routes + server actions for the admin/commerce backend in one deployable, matches the brief's "preferred direction". |
| Database | PostgreSQL | Relational, transactional integrity for orders/inventory. |
| ORM | Prisma | Strong TypeScript types, migrations, good relational modeling. |
| Auth | NextAuth (Auth.js) credentials provider + bcrypt | Session-based admin auth, easy RBAC layering. |
| Styling | Tailwind CSS | Matches "premium wellness" design system requirement, fast to build reusable primitives. |
| Validation | Zod | Shared client/server schemas; server is always the source of truth for pricing. |
| Email | Nodemailer against DB-configured SMTP | Provider-agnostic (Mailgun/Gmail/Hostinger/Brevo/SendGrid/custom all just SMTP creds). |
| Charts | Recharts | Lightweight, composable, good enough for admin analytics. |
| Media storage | Local `/public/uploads` behind a storage abstraction (`lib/storage.ts`) | Ships working uploads today; the abstraction has a single swap point to an S3-compatible driver for production — see "Known gaps" below. |
| Secrets at rest (SMTP password, Pixel access token) | AES-256-GCM via `lib/crypto.ts`, keyed by `APP_SECRET` env var | Never store third-party credentials in plaintext; never returned to the client. |

## 2. Core architectural principles (how the 71-section brief maps to code)

- **Country/office configuration is data, not code.** `Office` rows carry
  currency, phone format, location-hierarchy label, order-number prefix,
  delivery rules, WhatsApp number, inventory strategy, and default language.
  Nothing in the UI or pricing engine special-cases "Nigeria" — a new office
  row is the entire cost of adding a country (brief §2, §9, §66).
- **Pricing is centralized and server-authoritative.** `lib/pricing.ts`
  exports one pure function `calculateOrderPricing(product, office, offer,
  quantity)` used by both the live package-selector preview API and the real
  order-creation API. The client never sends a total that is trusted (§62).
- **Landing pages are rows, not React files.** `LandingPage` +
  `LandingPageSection` (ordered, typed, JSON `content` payload) are rendered
  by a section-component registry (`components/sections/registry.tsx`).
  Adding a page, reordering sections, or editing copy is an admin CRUD
  operation, never a deploy (§18, §44, §60).
- **Orders are the single write path for commerce state.** Order creation is
  one server action: validate → price (server-side) → upsert customer →
  create order + items → apply inventory strategy → write status history →
  write audit log → send emails → return order number. No frontend-only order
  creation exists anywhere (§59, §61).
- **Attribution is captured, not inferred later.** UTM params, `fbclid`,
  `gclid`, `fbp`/`fbc` cookies, referrer, and landing-page slug are read
  from the request and persisted on the `Order` row and an `AnalyticsEvent`
  row at submission time (§24, §47).

## 3. Data model (Prisma, see `prisma/schema.prisma` for the authoritative version)

Entities: `User`, `Role` (enum: `SUPER_ADMIN`, `ADMIN`, `ORDER_MANAGER`,
`INVENTORY_MANAGER`, `MARKETING_MANAGER`, `SUPPORT_STAFF`), `Office`,
`Currency` (embedded on `Office` as a value-object-style set of columns —
one currency per office keeps the common case simple; see Known gaps),
`LocationDivision` (state/county/region per office), `City`,
`DeliveryZone`, `Product`, `ProductOffice` (per-office price/inventory),
`Offer`, `OfferOffice` (per-office offer pricing), `Media`, `LandingPage`,
`LandingPageSection`, `Customer`, `Order`, `OrderItem`,
`OrderStatusHistory`, `InventoryMovement`, `EmailTemplate`, `SmtpSetting`,
`TrackingSetting`, `AnalyticsEvent`, `AuditLog`, `Setting`.

Order numbering: `{office.orderPrefix}-{sequence}` where `sequence` is a
per-office counter column on `Office` (`nextOrderSequence`), incremented
transactionally on order creation (§40).

## 4. Implementation phases and status in this pass

This is a single implementation pass, not the full multi-week program the
brief implies. Phases 0–7 plus the cross-cutting pieces needed to make them
real (auth, RBAC, audit log) are built and are genuinely functional against
a real Postgres database — not mocked. Phases 8–10 are implemented to the
extent they can be without live third-party credentials.

| Phase | Status | Notes |
|---|---|---|
| 0. Audit | Done | This document. |
| 1. Core foundation (auth, admin shell, offices, currency engine, product/offer/customer/order models) | Done | |
| 2. Product + offer system | Done | Package types: fixed-qty, buy-X-get-Y-free; per-office pricing. |
| 3. Landing page (Ginseng Five Treasures Tea) | Done | Built from the brief's own content description (§19, §64) — the live reference URL is on a domain blocked by this environment's egress proxy, so it was not fetched directly; content is original copy following the same structure. |
| 4. COD form | Done | Office-driven division label (State/County/Region), phone pattern per office. |
| 5. Orders (creation, dashboard, detail, status workflow, customer mgmt, inventory hook) | Done | |
| 6. Email (SMTP settings, templates, new-order + confirmation emails) | Done | Sending is real (Nodemailer); untestable end-to-end here without real SMTP credentials — test-connection/test-send actions are implemented and will work once credentials are entered. |
| 7. Thank-you page | Done | |
| 8. Tracking (Pixel, CAPI, GA4, UTM) | Partial | Settings storage + UTM/fbclid/gclid capture + client Pixel loader + GA4 gtag + server-side CAPI POST implemented. Not verified against a live Meta account (no credentials available in this environment). |
| 9. Multi-country (NG/KE/GH seeded + adding a 4th via admin only) | Done | Seed creates 3 offices; a 4th can be added purely through the Offices admin UI with no code change. |
| 10. Analytics + polish | Partial | Core dashboard charts (orders/revenue over time, by office/product) implemented. Full funnel analytics, accessibility/perf passes are not exhaustively done. |

## 5. Known gaps / explicitly deferred (do not claim these work)

- **Media storage** writes to local disk (`/public/uploads`), fine for this
  environment, not durable across redeploys — swap `lib/storage.ts` for an
  S3-compatible driver before production.
- **Multi-currency per office** is modeled as one currency per office (matches
  every example in the brief). A future multi-currency-per-office need would
  add a `Currency` join rather than change the shape.
- **Meta CAPI / GA4** are implemented but unverified against live accounts —
  no test credentials exist in this environment.
- **Bot/spam protection** is IP-based rate limiting + honeypot field +
  duplicate-order fingerprinting (phone+product+time window). No CAPTCHA
  integration (would need a third-party key).
- **RBAC** enforces role checks on server actions/API routes; a full
  granular permission matrix per §31 is implemented as role→allowed-section
  map rather than a separate `Permission` table, to avoid over-engineering
  for a single-tenant initial deployment.
