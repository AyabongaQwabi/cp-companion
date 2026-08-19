# SEO Strategy — ClinicPlus Companion

## 1. Context & Assumptions

- **Product**: cp-companion is a B2B add-on for existing ClinicPlus clients — HR managers and occupational health officers who book, manage, and pay for employee occupational health appointments in bulk.
- **Not a standalone SaaS competing for cold traffic.** It's an extension of ClinicPlus (the parent occupational health provider). Its SEO job is different from a typical SaaS: it doesn't need to win "best occupational health software" searches against competitors — it needs to (a) rank for the operational problems its exact buyer already has, and (b) reinforce ClinicPlus's authority in occupational health/HR compliance topics, feeding traffic and credibility back to sign-ups.
- **No live URL / GSC / analytics access** — this plan is built from the codebase and product understanding only. Baselines and KPI numbers are placeholders to fill in once the site is live and tracked.
- **Stack is a strength**: Next.js 16 App Router + Server Components gives full SSR/SSG out of the box — no CSR-indexing problem to fix first (this is the opposite situation from the sibling `cp-redesign` CRA site).
- **Market**: South Africa, per parent ClinicPlus positioning. Content should reflect SA-specific compliance language (OHSA, Department of Employment and Labour, COIDA) where relevant.

## 2. Goal

Turn cp-companion's currently-thin public shell (home, login, book, 3 legal pages) into a real content surface that:
1. Ranks for HR-operational queries around bulk occupational health booking and employee medical recordkeeping in South Africa.
2. Gets cited/quoted by AI answer engines (ChatGPT, Perplexity, Google AI Overviews) when HR managers ask process questions ("how to book pre-employment medicals for multiple employees").
3. Converts organic visitors into ClinicPlus client sign-ups or upgrade requests from existing clients not yet using Companion.

## 3. Site Architecture (New Public Pages)

```
/                          Home (exists — refine)
/features                  Feature overview hub (new)
  /features/roster          Employee roster management (new)
  /features/bulk-booking     Bulk appointment booking (new)
  /features/insights         Spend & appointment insights (new)
/solutions
  /solutions/hr-teams        For HR managers (new)
  /solutions/occupational-health-officers  (new)
  /solutions/multi-site-employers  Companies with multiple sites (new)
/resources
  /resources/guides
    /resources/guides/bulk-booking-occupational-health   (new)
    /resources/guides/employee-medical-recordkeeping     (new)
    /resources/guides/ohsa-compliance-checklist           (new)
  /resources/faq             (new)
/book                       (exists)
/login                      (exists)
/privacy /terms /refund-policy  (exist — tighten metadata)
```

Internal linking: every `/features/*` and `/solutions/*` page links to `/book` (or sign-in for existing clients) and cross-links to 1-2 relevant `/resources/guides/*`. Footer carries a sitewide link cluster to Features, Solutions, Resources.

## 4. Keyword & Topic Strategy

Primary clusters (South Africa intent, HR/occupational health buyer):

| Cluster | Example queries | Target page |
|---|---|---|
| Bulk booking operations | "book occupational health for multiple employees", "bulk medical booking system South Africa" | /features/bulk-booking, /resources/guides/bulk-booking-occupational-health |
| Employee roster / recordkeeping | "employee occupational health records management", "track employee medical certificates" | /features/roster, /resources/guides/employee-medical-recordkeeping |
| Compliance | "OHSA occupational health compliance checklist", "COIDA medical surveillance requirements" | /resources/guides/ohsa-compliance-checklist |
| Spend/insights | "occupational health spend tracking", "HR budget reporting medical appointments" | /features/insights |
| Role-based | "occupational health software for HR managers", "multi-site employee health management" | /solutions/* |

GEO/AI-search angle: structure guide pages as direct-answer content (clear H2 questions, short definitive answers up top, FAQ schema) so AI assistants can extract and cite them — this is higher-leverage than traditional ranking given the query types are mostly informational/operational, not competitive.

## 5. Schema Plan

| Page | Schema |
|---|---|
| Home | Organization, WebSite, SoftwareApplication |
| /features/* | SoftwareApplication (feature-scoped) |
| /solutions/* | Service |
| /resources/guides/* | Article, HowTo (where step-based) |
| /resources/faq | FAQPage |
| /book | Service / (no transactional schema — it's gated) |

## 6. Technical Foundation (already largely in place)

- [x] SSR/SSG via App Router — no rendering fix needed.
- [ ] Add `sitemap.ts` and `robots.ts` (App Router native, not yet present in `public/`).
- [ ] Per-page `generateMetadata` (title, description, canonical, OG/Twitter) — currently only root layout has metadata; every new page needs its own.
- [ ] `next/image` for hero and any new content imagery (already used for fonts; extend to images).
- [ ] Confirm authenticated routes (`/roster`, `/companies`, `/finances`, `/insights`, `/settings`) are excluded via robots.ts / not linked publicly (they aren't crawlable today since there's no sitemap, but should be explicit).

## 7. Implementation Roadmap

**Phase 1 — Foundation (this pass)**
- robots.ts, sitemap.ts
- Metadata + schema on existing public pages (home, book, privacy, terms, refund-policy)
- Build /features hub + 3 feature subpages
- Build /solutions hub + 3 solution subpages

**Phase 2 — Content Expansion**
- 3 resource guides (bulk booking, recordkeeping, OHSA compliance)
- /resources/faq with FAQPage schema
- Internal linking pass across all new pages

**Phase 3 — Scale**
- Additional guides based on real query data once GSC is connected
- Expand solutions by industry vertical (mining, manufacturing, logistics — sectors with heavy OHSA medical surveillance needs)

**Phase 4 — Authority**
- Case study from a real client (with permission)
- Cross-linking from parent ClinicPlus site to Companion content

## 8. KPI Targets (baseline TBD once live)

| Metric | Baseline | 3mo | 6mo | 12mo |
|---|---|---|---|---|
| Indexed pages | ~6 | 15+ | 20+ | 25+ |
| Organic sessions | — | track | track | track |
| AI citation appearances | — | track | track | track |
| Sign-up conversions from organic | — | track | track | track |

## 9. What's Explicitly Out of Scope

- Comparison/"vs competitor" pages — not applicable; Companion isn't shopped against alternatives, it's an add-on for existing clients.
- Programmatic SEO at scale (e.g. per-city landing pages) — the buyer base is existing ClinicPlus clients, not a large addressable market needing thousands of pages. Revisit only if ClinicPlus opens Companion to non-clients.
