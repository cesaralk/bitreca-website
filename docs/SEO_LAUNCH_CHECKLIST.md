# BITRECA software-services launch: SEO handover

Current commercial focus: websites; web, desktop and mobile applications; custom
software/business systems; PortfolioForest and portfolio websites. Physical-product
selling, supplier operations and fulfilment are deferred. Existing Store intake,
admin workflows, data and runtime settings stay operational and unchanged.

## Implemented foundations

- One source of page metadata in `shared/seo.js`: unique titles/descriptions,
  canonical HTTPS apex URLs, Open Graph, large-image Twitter cards and factual
  Organization/WebSite/WebPage JSON-LD. No address, rating, review, team, award,
  founding date, customer count, offer or price is invented.
- Existing Worker transforms only the relevant HTML shell head, using its existing
  uploaded assets via `ASSETS`. Explicit `run_worker_first` paths route marketing
  HTML, private HTML and indexing endpoints through this handler; `/api/*` is kept.
  Static scripts/images/CSS continue through the asset layer. Auth, request/contact
  submission and portfolio hosting/deletion implementations are unchanged.
- Initial HTML and client navigation agree on titles, descriptions and canonicals.
  Published project detail metadata reads only slug/title/description with the
  existing published-status predicate. Missing/draft projects return 404/noindex;
  database failures return 503/noindex rather than fabricated details. No parallel
  data model or migration.
- `/robots.txt` is plain text; `/sitemap.xml` is XML containing eight canonical
  public landing pages and valid **published project** URLs. No admin/customer/API/
  demo/request-review URL or fabricated last-modified time is included. Sitemap
  fails temporarily with 503 if its published-data read cannot be verified.
- Private admin HTML, the Store request-review UI and portfolio demo return
  `noindex` in HTML and HTTP headers. Public rendering APIs stay crawlable; private
  API/submission paths are disallowed in robots. Private HTML remains crawlable so
  search engines can actually read its noindex directive. Authentication, not
  robots directives, protects customer data.
- Original navy/blue social image (1200×630 PNG) and a BITRECA favicon replace the
  unrelated framework favicon. The SVG card source is included for future edits.
- Home states the software launch focus, links to specific service sections and
  PortfolioForest, and accurately labels physical Store activity deferred. Services
  and PortfolioForest provide relevant cross-links and a manual project Contact CTA.
  Existing design, hero CSS, animations and portfolio carousel structure remain.

The existing application body remains JavaScript-rendered. Metadata is present
before JavaScript for sharing/crawlers; this release does not introduce full SSR.
Use Search Console’s rendered-page inspection to confirm Google sees the actual
content. Existing project images already have title-based alt text, decoding and
lazy/eager loading with aspect-ratio containers. No unverified speed score or
Core Web Vitals result is claimed. Route splitting/full prerendering should follow
measured rendering/performance problems, not expand this release speculatively.

## Existing analytics and verification evidence

Read-only public inspection on 2026-11-09 found Cloudflare’s existing analytics
beacon on production pages. Repository source has no Google Analytics, Tag Manager,
Search Console verification token or alternate tracking script configuration.
The public apex TXT lookup did not find a `google-site-verification` entry; public
HTML did not contain that verification meta tag. These observations do not prove
that no Search Console property/account already exists (other verification methods
or retained ownership may apply). No account, DNS record, tracking script or token
was created or changed here. No private verification/token values are recorded.

## Exact remaining owner actions

1. Sign in to the owner’s normal Google Search Console account and check for an
   existing `bitreca.com` Domain property or `https://bitreca.com/` URL-prefix
   property. Reuse a verified property if present; do not create duplicates.
2. If ownership is missing, add the **Domain property `bitreca.com`**. Obtain the
   actual Google-provided DNS TXT verification value. In the existing Cloudflare
   DNS zone, add the supplied TXT record at the root (`@`) exactly as instructed by
   Google. Preserve existing TXT/MX/SPF and all other DNS/security records. Return
   to Search Console, Verify, and retain the verification record. The owner must
   authorize and perform this account/DNS step; this release makes no DNS change.
   [Google ownership verification](https://support.google.com/webmasters/answer/9008080)
3. In the verified property’s **Sitemaps** view, submit
   **`https://bitreca.com/sitemap.xml`** and confirm Google reports successful
   retrieval. Confirm only intended public URLs appear. No submission has been
   performed by this task.
   [Google sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
4. Use **URL Inspection → Test Live URL** for Home, Services, PortfolioForest and an
   existing published project if available. Review rendered HTML, declared/selected
   canonical, crawl permissions and page resources, then request indexing for
   launch-ready pages. Review indexing reports after Google processes them; do not
   treat deployment or a sitemap response as proof of Google indexing/rankings.
   [JavaScript SEO](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics),
   [noindex behavior](https://developers.google.com/search/docs/crawling-indexing/block-indexing)
5. Open the existing Cloudflare Web Analytics dashboard for the correct production
   site and verify owner access and useful page traffic. Source/public beacon
   presence does not verify account access or recorded events. Keep the existing
   integration; Google Analytics, Tag Manager or any additional tracking requires
   separate approval, a real owner property ID and appropriate consent decisions.

## Next content work (recommendations, not a redesign)

- Add owner-approved project scope, deliverables, technologies and representative
  images only to real published project records; obtain consent where needed. Do
  not turn placeholder/empty states into invented case studies or success metrics.
- Supply a portfolio-project brief (audience, work samples, content and desired
  outcome) when answering PortfolioForest enquiries. Existing Contact/WhatsApp/
  email channels suffice; no auto-send or new onboarding flow is needed.
- Review software enquiries and existing analytics before planning additional
  service landing pages, further Store demotion or navigation changes. Keep the
  approved design and avoid duplicate thin pages for search keywords.
- Physical-product policies, supplier purchasing, delivery and payment collection
  are later business work. This release does not disable or certify Store operations.

Release SHA, actual checks/deployment and verified Live endpoints are recorded in
`BITRECA_V1_ROADMAP.md`; no task-duration estimate is presented as measured effort.
