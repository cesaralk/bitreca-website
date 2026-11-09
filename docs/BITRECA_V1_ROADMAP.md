# Bitreca V1 roadmap

Updated: 2026-11-09. About is **Verified Live**; release evidence is below.
Current commercial launch priority: **software and digital services** — websites,
web/desktop/mobile applications, custom software/business systems and PortfolioForest
portfolio websites. Physical Store selling, supplier operations and fulfilment are
**deferred business work**; deployed Store workflows/intake/settings remain enabled.
Marketing/SEO foundations are **Verified Live** at d917e1c; public metadata/indexing
files and software/PortfolioForest discovery passed scoped checks. Search Console
verification/submission and analytics account review remain owner actions.
Historical Store completion evidence is retained.
Store S1 introduction/category directory is **Verified Live**. S2 private admin
catalogue is deployed with authenticated Live interface and anonymous protections
verified. Owner-authorized demo category/product create, edit, upload and publication
workflows now pass on Live; earlier empty-catalogue limitations are historical.
S3 enquiry-only public catalogue is deployed, with three clearly labelled demo
products, category browsing, details, images and Contact prefill verified on Live.
This validates demo content only; it is not a real merchandise or fulfilment claim.
S4 manual-review request workflow is **Verified Live**, with intake enabled by
owner authorization on 2026-11-08. Activation release 3e1fe50, one real Turnstile
submission, three item snapshots, authenticated receipt/status updates and
anonymous access protection passed. Migration 0020 and all previous evidence are
retained. This verifies request intake/review, not payment or fulfilment. S5 is
**Minimum manual fulfilment deployed — Live interface/access checks passed**.
Owner confirmed supplier-on-demand sourcing, fixed captured selling prices,
personal/third-party delivery and manual COD/Wish Money tracking. Earlier demo
evidence remains historical; the 2026-11-09 preflight found zero product records.
Permanent Store product deletion is **Verified Live** for the authorized disposable
draft/image check; migration 0021, release and preservation evidence are below.
Shared public navigation and Footer are **Verified Live** at b5fcb58; focused
desktop/mobile navigation and unchanged carousel placement passed on production.
Task #6 Contact Inbox/Admin is **Complete — Verified Live**. The original success
and the owner-confirmed 2026-11-08 submission/inbox/status recheck are recorded below.
Projects Batch #2 remains Live. Batch #1 remains
pushed and verified Live; evidence is recorded
in the Batch #1 section below. Earlier task sections are historical local QA records.
Estimates are implementation/review effort, not delivery promises. Later
milestones need inspection and user agreement before work starts.

| Milestone | Status | Local / deployed | Estimated remaining effort |
| --- | --- | --- | --- |
| Homepage Hero typography/mobile CTA changes and testimonial removal | Batch #1 complete | Verified Live at 8775054 | No new page work in this batch |
| Services: four categories, process, FAQs, contact CTAs and responsive styles | APPROVED; Batch #1 complete | Verified Live at 8775054 | No new page work in this batch |
| Contact: WhatsApp/mailto/copy fallback and private enquiry inbox | Complete — Verified Live | 0018 already applied; implementation 3e05fdb/fix 1259994 retained; 2026-11-08 recheck: one 201 stored response plus owner-confirmed matching inbox message, In Progress/Archived and persistence after refresh | No Contact activation blocker; no automatic outbound messaging; completed implementation/QA reused |
| About: factual company introduction | Verified Live | Release e59a5c1 deployed; local and Live Chrome checks passed | No blocker in verified About scope |
| Software Products: Stockly POS and repeatable product layout | Batch #1 complete | Verified Live at 8775054 | No new page work in this batch |
| Hardware / Dropshipping Store | Request workflow Verified Live; minimum manual fulfilment deployed, authenticated Live interface/access checks passed | Release c3f5fa4; 0022 applied, original data hashes/runtime settings preserved; ten focused tests, isolated 1440/768/390px workflow checks and read-only Live checks passed | Production fulfilment writes intentionally unverified; owner enters real merchandise (current catalogue empty), purchases from suppliers and handles delivery/payment collection and policies manually; no gateway |
| Admin Store permanent product deletion | Verified Live — scoped disposable draft/image check | Migration 0021 applied; release f596576 deployed; one confirmed product/image deletion passed; all original Store counts/hashes unchanged | Referenced/published/shared/failure branches verified in isolated tests; no existing product or historical request used as a Live deletion target; intake stays enabled |
| Projects: public listing and slug details | Batch #2 complete; scoped QA reused | Verified Live at 3ed49f4 | No implementation/deployment blocker; no new scope |
| Shared navigation/footer and cross-page entry behavior | Complete — Verified Live | Release b5fcb58 deployed; eight public routes, four service anchors, focus/active state, official Footer contacts and unchanged carousel placement checked Live at 1440/390px | No blocker in shared navigation/Footer scope; completed page/business workflows reused, not retested |
| Software-services marketing and SEO foundations | Complete — Verified Live foundations | d917e1c deployed; distinct initial/client metadata, robots, 10-public-URL XML sitemap, noindex/private guards, share assets and desktop/mobile discovery verified; existing bindings/analytics/intake preserved | Owner Search Console verification, sitemap submission and rendered-indexing/account review pending; Google indexing/rankings not claimed; Store commerce deferred |
| V1 release Batch #1 | Complete: one commit pushed; Cloudflare build successful | Verified Live at 8775054 | Historical Batch #1 scope retained below; later Contact Inbox, Projects and Store releases are separately verified; automatic outbound email is outside the current Inbox scope |

Current owner decisions (2026-11-09): supplier purchasing happens manually after
requests; captured selling prices are honoured on confirmation; delivery is personal
or through a third-party company; payment is **Cash on Delivery or Wish Money**.
No gateway or supplier/delivery integration is required. Actual catalogue facts,
delivery-charge agreement, customer confirmation, collection/reconciliation and
operating policies remain owner responsibilities; software stages do not perform them.

## Services scope and validation

- Only Services JSX/CSS and this roadmap are changed by this task.
- Reuses React Router, Navbar/Footer and global brand tokens; no dependencies.
  The Homepage ServiceCard links back to Services, so detailed articles stay local.
- Four service categories, anchored navigation, native keyboard-operated FAQ
  details, focus styles and reduced-motion handling implemented.
- CTAs link to `/contact`. It was a placeholder at Services approval; Task 2
  replaces it with the frontend below. End-to-end enquiry delivery is still blocked.
- No testimonials, project examples, prices, delivery guarantees or unverified
  business achievements added.
- `npm.cmd run build`: passed (Vite server and client production builds).
  PowerShell blocked `npm.ps1`; the equivalent npm command ran outside the
  sandbox after approval because Node filesystem access was restricted.
- `node node_modules/eslint/bin/eslint.js src/pages/Services.jsx`: passed
  outside the sandbox after approval. No unrelated historical suites run.
- `git diff --check`: passed. Source checks confirmed all four service category
  IDs, the explore anchor target and the existing Contact route.
- SHA-256 checks confirmed both pre-existing Homepage files were unchanged:
  `Home.jsx`: `D8ECA848E572FD001A4113B399D5B9C1854577D310B49EBB30250AB046B33D61`;
  `Home.css`: `624C5C361ED5D92CD021704433BE782E5A3A5DFFA58897C71A451276C6478A60`.
- Initial implementation had source-only review. The focused final QA below
  supersedes the earlier browser verification limitation.
- No files were committed, pushed or deployed. Production state was not checked.

## Focused Services final QA — 2026-11-04

**APPROVED for the tested Services scope. Contact integration remains incomplete.**

- Read the complete Services JSX/CSS, covering all four service descriptions,
  process, FAQs and final CTA, plus the shared navigation and global styles.
- Tested the running `http://localhost:5173/services` in installed headless
  Chrome using its DevTools Protocol and a temporary Node script. No browser
  package, project dependency or configuration changes were needed.
- At 1440, 768 and 390 CSS pixels (1000px viewport height), captured and visually
  reviewed full-page screenshots. No horizontal overflow or visible clipping
  found. All four service cards, four process steps and four FAQs rendered at
  each width; section/card accessible label references resolved.
- At each width, activated Explore and all four category anchors; each URL hash
  matched its target and the target scrolled to approximately 28px from the top.
- At each width, all four FAQs opened with Enter and closed with Space. Tab from
  the first hero CTA moved to Explore with a visible solid focus outline.
- At 768 and 390px, Enter opened the shared menu, `aria-expanded` became true
  and the menu was visible. Selecting Services closed it again.
- Keyboard-activated all six Services contact CTAs; each navigated to `/contact`
  and displayed its Contact heading. This verifies routing only: no enquiry form
  or delivery integration exists there yet.
- Emulated reduced motion; computed HTML scroll behavior was `auto`.
  No uncaught page exceptions were observed during the scripted run.
- Fixed one confirmed defect: the general Services H2 rule overrode the note
  heading's intended desktop size (40px computed instead of 28px). Increased
  only the note selector's specificity, including its mobile override. Retest
  measured 28px at 1440/768 and 26px at 390.
- After the fix, production build and scoped Services JSX ESLint passed again.
  Diff whitespace checks passed. No historical test suites were run.
- QA changes are limited to `src/pages/Services.css` and this roadmap;
  `Services.jsx` was reviewed without editing. Existing Homepage file hashes
  still match the preservation record above.
- Temporary QA script/screenshots are outside the repository under the user's
  temporary directory (`bitreca-services-qa.mjs` and
  `bitreca-services-qa-20261104/`); they are not deployment artifacts.
- Limitations: Chrome desktop viewport emulation only; no physical-device,
  Safari/Firefox, screen-reader or comprehensive accessibility audit. Other
  viewport widths are not claimed as browser-tested in this QA. No production
  verification, commit, push or deployment was performed.

## Task 2: Contact — local frontend complete, delivery blocked

Historical Task 2 record. Task 3 below supersedes copy-only behavior and the
previously unknown destination/provider decisions; its activation is still blocked.

The page is no longer a placeholder. It includes introductory copy, project
guidance, name/email/service/message fields, responsive navy/blue styling and
links back to Services. No company contact details or achievements were invented.
Services remains APPROVED locally; only its six Contact links were exercised in
this milestone, with no Services redesign or repeat of its layout/FAQ tests.

### Functional behavior

- The repository has no verified enquiry handler, delivery-provider binding or
  documented recipient inbox. Remote secrets/infrastructure were not inspected.
- The form explicitly states that online sending is unavailable. Its action is
  **Copy project brief**, never Send. Clipboard completion says the brief was
  copied and **has not been sent to Bitreca**. No enquiry POST is issued.
- All four fields are required. Name is limited to 100 characters, email to 254,
  service to a fixed list including Not sure yet, and message to 20–5,000
  characters. Empty/whitespace-only values and malformed email are rejected.
- Field labels, autocomplete, inline errors, associated descriptions,
  `aria-invalid`, first-invalid-field focus, visible focus, a live status region
  and a character count are provided.
- During copying, controls are disabled and the button announces its busy state.
  Duplicate requests are guarded. Denial, missing Clipboard API or a 10-second
  timeout exposes selectable text for manual copying. Entries remain available;
  editing clears stale feedback. No local storage or draft persistence is used.

### Verified checks

- Headless Chrome at `http://localhost:5173/contact`, 1440/768/390px wide and
  1000px viewport height: reviewed full-page screenshots; no horizontal overflow
  or visible clipping found. All four required fields have associated labels.
- At all three widths: empty submission produced four field errors and focused
  Name; whitespace name, malformed email, missing service and short message were
  rejected. Valid input produced a trimmed, formatted brief.
- Deterministic Clipboard API test doubles verified loading/disabled controls,
  duplicate-action suppression, truthful copy confirmation, input preservation,
  clearing feedback on edit, rejected/unavailable clipboard fallback and manual
  text selection. A non-resolving operation verified timeout recovery.
- Separately verified **native** Chrome clipboard write and readback with
  synthetic QA text and clipboard permissions in a temporary browser profile.
  This was not an enquiry delivery test.
- Verified full forward keyboard order Name → Email → Service → Message → Copy,
  visible focus, keyboard service selection and Enter activation. Shared mobile
  navigation opened/closed correctly at 768/390px.
- Verified HTML input limits and the 5,000-character counter; reduced-motion
  emulation produced `scroll-behavior: auto`.
- All six existing Services CTAs reached the new Contact form. Both Contact
  Services links reached `/services` without modifying that page.
- No POST requests or uncaught page exceptions were observed in the scripted
  QA. Synthetic test data was used; no real enquiry was transmitted.
- `npm.cmd run build` and scoped ESLint
  (`node node_modules/eslint/bin/eslint.js src/pages/Contact.jsx`) passed.
  `git diff --check` passed. No historical project test suites were run.
- SHA-256 comparisons confirmed Home.jsx/Home.css and Services.jsx/Services.css
  unchanged from Task 2 start. Existing local work is preserved.
- Browser QA scripts and screenshots are temporary files outside the repository:
  `bitreca-contact-qa.mjs`, `bitreca-contact-native-qa.mjs` and
  `bitreca-contact-qa-20261104/` under the user's temporary directory.
- No total task-time figure is claimed. Tests used Chrome desktop viewport
  emulation, not physical devices, Safari/Firefox or screen readers; this is not
  a comprehensive accessibility audit.

### Concrete blockers before production enquiry delivery

1. Owner-approved monitored recipient inbox and a responsible reviewer.
2. Chosen delivery provider, verified sender identity/domain and server-only
   credentials/configuration. No secret belongs in frontend code.
3. Approved isolated abuse controls, rate/global limits and any challenge setup.
4. Approved privacy/retention policy for real submissions.
5. Implement and test the isolated endpoint and response contract, then confirm
   actual staging inbox receipt with the owner before authorizing activation.

The precise plan is in [CONTACT_ENQUIRY_INTEGRATION.md](CONTACT_ENQUIRY_INTEGRATION.md).
It proposes direct provider delivery with owner inbox review, avoiding D1 and
existing auth changes. Merely storing submissions would not complete delivery
or provide a verified owner review path. These decisions block integration;
**Contact is not functionally ready for production enquiries**.

Task 2 changes: `src/pages/Contact.jsx`, `src/pages/Contact.css`, this roadmap and
the integration plan. No dependency, Worker, migration, hosting or production
configuration changes; no commit, push or deployment.

## Task 3: Contact integration — code complete, external activation blocked

Official recipient `info@bitreca.com`, WhatsApp `+96170864221` and Resend were
provided/selected by the owner. Their delivery/account verification was not
inferred from those instructions. Approved Contact layout and prior visual QA
were preserved; no repeat visual review or Services rework was performed.

### Implemented locally

- Contact now offers the official WhatsApp action (encoded service-specific
  introduction for visitor review/send), direct email and the honest copy/manual
  fallback. Private name/email/full-message content is not put in the WhatsApp URL.
- `GET /api/contact/config` exposes only enablement/public Turnstile site key.
  `POST /api/enquiries` is routed by five added lines in the existing Worker;
  the implementation is isolated in `worker/contact-enquiry.js`.
- Fixed From `Bitreca <info@bitreca.com>` and To `info@bitreca.com`, validated
  visitor Reply-To, fixed subject and plain-text body. No visitor-controlled
  recipient/sender/subject, HTML or automatic reply.
- Shared browser/server field validation, input/control-character/streamed-body
  limits, same-origin/allowlisted-origin checks, dedicated per-IP/shared traffic
  limit bindings, bounded upstream requests and verified Turnstile
  success/hostname/action. No admin limiter, database or auth changes.
- Missing keys, flags, origin configuration or limiter bindings fail closed.
  RESEND_API_KEY and CONTACT_TURNSTILE_SECRET are server-only secret names;
  no real credentials were read, added or committed. Site key is public.
- A successful Resend response with a valid provider ID is required for HTTP
  202 acceptance. UI success explicitly means provider acceptance, not confirmed
  inbox receipt. Invalid/HTML responses, rate limits, challenge failures and
  network/provider errors preserve entries without false success.
- Stable same-page request UUID plus email payload hash supplies Resend
  idempotency on unchanged retries; fresh Turnstile verification is required.
  Reloading/editing begins a new logical enquiry. Provider deduplication is
  limited to its documented 24-hour window, not permanent storage.
- Suggested limiter settings are 3 attempts/IP/minute and 30 shared attempts/
  minute per Cloudflare location. Cloudflare counters are approximate/local;
  the shared binding is not an exact global spending cap. No bindings or runtime
  flags were actually provisioned/enabled in this task.

### Verified results

- `node --test tests/contact-enquiry.test.js`: **10 tests passed**. Covers
  Worker dispatch isolation (no D1 access), configuration failure, methods/
  origins/content type, JSON shape and streaming size limits, validation/control
  characters, rate limiter denial/failure, token/hostname/action failures,
  provider/network/timeout/malformed acceptance, fixed email addresses, Reply-To,
  plain text, retry idempotency and WhatsApp URL privacy/encoding.
- Scoped ESLint passed for Contact.jsx, ContactTurnstile.jsx, the shared validator,
  Contact Worker handler, worker/index.js and the focused test file.
- `npm.cmd run build`: passed for Worker and client. `git diff --check`: passed.
  No unrelated historical suites were run.
- Focused headless Chrome **functional** integration tests passed, without
  repeating approved visual/responsive checks. The real local public config
  returned disabled/no site key. The official WhatsApp URL/prefill and fallback
  controls were verified without opening/sending a WhatsApp conversation.
- Mocked widget/provider checks verified challenge-required behavior, loading,
  duplicate suppression, explicit accepted contract, HTML/false JSON/bad-202
  rejection, 429/expired-token/422/503/network-timeout/rejection handling,
  first-invalid-field focus, preserved retry UUID, widget expiry/error and copy
  fallback. No uncaught browser exceptions observed. No real email was sent.
- Temporary functional browser runner:
  `bitreca-contact-integration-qa.mjs` in the user's temporary directory.
- Home.jsx/Home.css and Services.jsx/Services.css hashes match Task 3 start.
  Existing uncommitted work is preserved. No dependency changes.

### Remaining blockers / owner activation gate

1. Confirm that the official receiving inbox exists and is monitored.
2. In Resend, verify `bitreca.com` for the fixed sender using the exact required
   dashboard DNS records, then install a domain-restricted sending API key as a
   Cloudflare secret. DNS/account verification and real credentials are unverified.
3. Create the proper hostname-scoped Turnstile widget; configure its public key
   and install its private secret only in Cloudflare secrets.
4. Provision dedicated contact rate-limit namespaces/bindings and allowlisted
   origins on an explicitly authorized staging target. Review privacy/retention
   and usage monitoring before enabling real submissions.
5. Run an authorized staged real enquiry; verify Resend reference and open
   **info@bitreca.com** to confirm inbox receipt and visitor Reply-To. Only then
   request/approve production activation separately.

Exact steps, variable names, future secret commands, binding examples, rollback
and inbox test are documented in
[CONTACT_ENQUIRY_INTEGRATION.md](CONTACT_ENQUIRY_INTEGRATION.md), with links to
official Resend/Cloudflare documentation. No actual setup commands were executed.

**Not production-ready for email delivery until the external gate passes.**
Work stopped at this integration boundary; no DNS/secret/hosting/runtime setting
changes, migrations, commit, push or deployment. No total task-time figure is
claimed.

Task 3 files: `src/pages/Contact.jsx`, `src/pages/Contact.css`,
`src/components/ContactTurnstile.jsx`, `shared/contact-enquiry.js`,
`worker/contact-enquiry.js`, the Contact dispatch only in `worker/index.js`,
`tests/contact-enquiry.test.js`, the integration guide and this roadmap.

## Task 4: Software Products — READY FOR REVIEW locally

Implemented only the software Products page and its route-scoped stylesheet.
This milestone does not include the Dropshipping Store. The existing shared
Navbar/Footer, React Router `/products` route and global navy/blue tokens are
reused without modifying their files or any other page.

### Content and layout

- Stockly POS is featured as Bitreca business software for retail. Capability
  evidence is the existing `ProductCard` data in `src/pages/Home.jsx` (around
  line 202): sales, inventory, purchases, services, reporting and daily operations.
  Feature copy stays within those six areas. Benefits describe the product's
  retail focus and combined scope; no quantified outcomes are asserted.
- No prices, testimonials, customer/download counts, platform compatibility,
  hardware support, offline modes, integrations, demo links or purchase/download
  actions are invented. Availability, pricing and setup are questions for Contact,
  not unsupported promises. Existing Homepage availability copy is not expanded.
- No product-specific screenshot/asset or detailed Stockly specification was
  found in the reviewed source/assets/docs. The spotlight is a typographic
  product overview, not a purported application screenshot or live demo.
- A local `softwareProducts` data array drives repeatable product articles,
  feature grids and benefits. Additional verified software products can be
  appended using the same layout; no fake future cards or release promises.
- Existing Homepage `ProductCard` links back to `/products`, so it is preserved
  as-is rather than reused as a self-link on the detailed Products page.
- Includes Stockly anchor navigation, six feature areas, three benefits,
  requirements guidance and three explicit `/contact` CTAs. No new dependency,
  backend functionality or separate product detail route was needed.

### Verified checks

- `npm.cmd run build`: passed for Worker and client. No Worker source or settings
  were changed; the standard project build emits both environments.
- `node node_modules/eslint/bin/eslint.js src/pages/Products.jsx`: passed.
- `git diff --check`: passed. No unrelated historical test suites were run.
- Headless Chrome at `http://localhost:5173/products`, **1440/768/390px** wide
  and 1000px viewport height: captured and reviewed full-page screenshots for
  layout/readability. No horizontal overflow or visible clipping found.
- At every requested width: one H1, one product, all six feature areas and all
  three benefit blocks rendered; all explicit labelled-by references resolved.
  Only the Stockly anchor and genuine `/contact` actions appear in page content.
- Keyboard Enter activated the Stockly anchor and scrolled it to approximately
  28px below the viewport top. Tab from that action moved to the hero Contact
  CTA with a visible solid focus outline.
- All three product Contact CTAs were keyboard-activated at each width; each
  reached `/contact` and rendered the existing Contact form. This checks page
  routing only; it does not remove Task 3's real email activation blockers.
- Shared menu opened with Enter and closed on keyboard selection of Products
  at tablet/mobile widths. No shared navigation files were edited.
- Reduced-motion emulation produced HTML `scroll-behavior: auto`. No uncaught
  browser exceptions observed. No purchase, download or enquiry was transmitted.
- Preserved-file SHA-256 baseline covers **16 existing files**, including all
  pre-existing modified/untracked files except this intentionally updated roadmap,
  plus Store.jsx, ProductCard.jsx, routing and Cloudflare configuration. Final
  comparison passed; Homepage, Services, Contact and Worker work is unchanged.
- Temporary browser runner and screenshot directory are outside the repository:
  `bitreca-products-qa.mjs` and `bitreca-products-qa-20261104/` in the user's
  temporary directory. No test dependencies or package changes.

### Limitations and status

No Products-specific implementation blocker remains in the tested scope.
Stockly capabilities are supported by existing project copy, not independently
verified by running the Stockly application. Detailed technical specifications,
pricing/availability and any future screenshots require owner-confirmed material.
Chrome viewport emulation does not cover physical devices, Safari/Firefox or a
screen-reader/comprehensive accessibility audit. No total task duration is claimed.

Task 4 changed only `src/pages/Products.jsx`, `src/pages/Products.css` and this
roadmap. **READY FOR REVIEW**, local only; no commit, push or deployment.

## Deploy Batch #1 — pushed and verified Live

Owner authorized deployment of Homepage Hero/testimonial cleanup, Services,
Contact with WhatsApp/mailto/copy fallback, and software Products. Email delivery
is **DEFERRED**: no Resend credentials, Cloudflare Email Sending subscription or
Turnstile setup is active/required for this fallback release. No email activation
flags, secrets, subscriptions, DNS or rate-limit bindings will be configured.

- Refreshed origin; local main equals origin/main at baseline `45fd26d`.
- Reviewed all six tracked changes and nine new files. Only the approved page
  work, isolated Contact support and directly required docs/tests are included.
  No secrets, credentials, backups, migrations or unrelated files are selected.
- Existing Worker diff is exactly one import and the two-route Contact dispatch
  (five added lines). Existing portfolio directory/hosting, scheduled deletion,
  admin authentication and other Worker branches are unchanged. Contact uses no
  D1/R2 and remains unavailable unless all explicit configuration gates pass.
- Contact config defaults to disabled; a failed config request also leaves Send
  disabled, does not load Turnstile, and preserves usable WhatsApp, mailto and
  copy/manual fallback. No provider acceptance or inbox receipt is claimed.
- All 16 existing-file preservation hashes from Task 4 still match. Worker
  configuration, routes/resources, package files and migrations have no diff.
- Existing Services, Contact and Products browser/lint/focused-test evidence is
  reused. No repeat visual review or historical test suite is part of deployment.
- Single final `npm.cmd run build`: passed for Worker and client. Exact staged
  15-file manifest passed `git diff --cached --check`; no private-key or Resend/
  GitHub token markers were found in the selected files. Generated dist output,
  local secret files and temporary QA runners were not staged.
- Commit: **`877505452a784205353ff6357e94a9f0a80c88b1`**, title
  `Complete Bitreca V1 pages with safe contact fallbacks`.
- `git push origin main`: succeeded, fast-forward from `45fd26d` to `8775054`.
  One commit created; no force push or direct Wrangler deployment.
- Cloudflare GitHub check **Workers Builds: bitreca-website** completed with
  **success** for that exact commit. [Build details](https://dash.cloudflare.com/4ec868eac2a3b9127531ad39d2501f15/workers/services/view/bitreca-website/production/builds/02f9f0d4-7caf-43bb-948e-4f169e77ecfc).
- Read-only Worker deployment history showed the latest deployment at 100% on
  version **`8e8af1d9-457f-4db0-ac06-0a041bd7857b`**, created
  `2026-11-04T21:19:41.760Z` (23:19:41 Beirut). No deployment/configuration action
  was issued through Wrangler; this was the existing Git-triggered pipeline.
- First HTTP smoke caught the previous bundle before rollout completed; those
  responses were not treated as proof of the new release. The final rendered
  checks below loaded **`/assets/index-Nuf4Q4M5.js`**, matching the final build.

### Targeted production smoke — verified 2026-11-04

| Public destination | Result |
| --- | --- |
| `https://bitreca.com/` | HTTP 200, Homepage hero rendered; testimonial section absent |
| `https://bitreca.com/services` | HTTP 200, completed Services content rendered |
| `https://bitreca.com/contact` | HTTP 200, completed Contact form and fallback actions rendered |
| `https://bitreca.com/products` | HTTP 200, Stockly POS product content rendered |
| `https://bitreca.com/portfolioforest` | HTTP 200, existing directory rendered |
| `https://bitreca.com/api/portfolios` | HTTP 200, success true, six entries with public links |
| Existing directory link `https://cezar.bitreca.com/` | HTTP 200, title `Cesar Al Khatib \| Developer Portfolio`, actual portfolio body rendered |

Contact config returned HTTP 200 with `{ "enabled": false, "siteKey": null }`.
Send is disabled and the page explicitly says online sending is unavailable.
Verified official `https://wa.me/96170864221` prefilled action, `mailto:info@bitreca.com`
and copy control are present. No Turnstile script loads. Prior copy/clipboard QA
was reused; no live messages/submissions were sent. No uncaught page exceptions
were observed in the final rendered smoke. Two temporary runner comparison/
selector issues were corrected locally; no application fixes were needed.

No production D1/R2 data, DNS, secrets, subscriptions, migrations, admin sessions
or deletion operations were changed/tested. Existing admin/deletion logic is
unchanged by source audit; production smoke was limited to the requested public
pages/directory/portfolio. No full visual or historical test cycle was repeated.

**Batch #1 is verified Live, not merely pushed.** Production email remains
intentionally deferred, not a release blocker for the usable fallback channels.
Projects and Store remain pending. Temporary smoke runner is outside the repo:
`bitreca-batch1-production-smoke.mjs` in the user's temporary directory.

This final SHA/live record is a **local, uncommitted documentation update** after
the single authorized feature commit. The pushed roadmap snapshot records the
pre-push audit/build state. No second documentation commit/push was made; the
committed snapshot cannot contain its own final SHA without changing that SHA.

## Task 5: Public Projects — READY FOR REVIEW locally (2026-11-05)

Historical local QA record. Deployment completion is recorded in Batch #2 below.

Completed only `/projects` and `/projects/:slug` presentation and client-side
loading/safety behavior. Existing Worker endpoints and the D1 published-project
model remain the authority; no alternate data store, API, admin change or seed
data was introduced. Batch #1 deployment evidence and its actual commit SHA above
are preserved, including the previously uncommitted post-deployment record.

### Implementation

- Listing uses the existing `/api/projects` response and preserves server order.
  Dynamic cards link to the existing slug route; no project/example is embedded
  in production page data. Detail uses `/api/projects/:slug` and renders only
  supplied title/category/description and optional image, overview, comma-separated
  technologies, website URL and content. Optional sections are omitted if absent.
- Updated navy/blue layouts, typography, contained responsive imagery, card
  descriptions, project metadata and top/bottom back navigation. The listing
  adds an explicit public-work heading; Contact CTAs use the existing route.
- Loading, true empty, request failure/retry and detail not-found states are
  distinct. JSON shape/record checks prevent an HTML fallback or malformed
  response from becoming an empty/successful project view.
- Abort cleanup, a 15-second fetch timeout and request-keyed state prevent stale
  results on retry/slug changes. Route changes focus the heading near page top;
  keyboard links/buttons have visible focus. Reduced motion is respected.
- Project text is rendered through ordinary React text nodes, never injected
  HTML. URL checks reject executable/data schemes, protocol-relative URLs,
  embedded credentials, backslashes and URL control characters. Images may use
  safe HTTP(S) or same-origin root paths, including the existing `/api/media/`
  route. Missing/broken images have honest fallbacks. Safe external websites
  open in a new tab with `noopener noreferrer` and an accessible new-tab label.
- The shared ProjectCard adds an **opt-in public appearance**. Its default
  Homepage return markup remains unchanged. The legacy global `.project-category`
  declarations are retained exactly so replacing detail styles does not restyle
  approved Homepage cards. All new page/card styles are separate or scoped.

### Verification performed

- Read-only local `/api/projects` returned `{ "success": true, "projects": [] }`.
  The actual empty-page state was browser-verified before fixtures were installed.
- Populated QA used four explicitly labelled synthetic records and generated
  image responses **only in temporary browser memory/interception**. No fixtures
  are imported by production code; no D1/R2 data was inserted or changed.
- Headless Chrome at **1440, 768 and 390px** wide / 1000px viewport height:
  captured and reviewed listing/detail screenshots. No horizontal overflow or
  visible clipping found. Each view had one H1 and resolved labelled-by targets.
- At each width, card Enter navigation, direct slug navigation, top/bottom back
  links, project-specific accessible link text and visible keyboard focus passed.
  Returning to the listing focused its visible heading near page top. Tablet/
  mobile shared menu opened/closed using keyboard without editing Navbar.
- Landscape and portrait images, broken-image and absent-image fallbacks passed.
  Supplied website href/target/rel were verified; no external fixture site was
  represented as a real Bitreca project or visited as a demo.
- Browser state checks passed for loading/recovery, empty, HTTP failure,
  network failure, HTML fallback, malformed data/JSON, duplicate records,
  retry, 404 (including non-JSON response), invalid slug and minimal optional
  metadata. A delayed older slug response could not overwrite the current one.
- HTML/script-like fixture content remained literal text; no injected script ran.
  Unsafe website URLs were suppressed. Long unbroken titles/technology text did
  not overflow. Technology values were trimmed, empty entries removed and
  duplicates removed. Reduced-motion computed scroll behavior was `auto`.
- No non-GET/HEAD network requests or uncaught browser exceptions were observed.
  Approved Homepage, Services, Contact, Products and PortfolioForest visual QA
  was not repeated. No production reads or writes were needed for fixture QA.
- `node --test tests/public-projects.test.js`: **3 passed** (URL safety,
  malformed record rejection, optional metadata and literal text preservation).
- Scoped ESLint passed for Projects.jsx, ProjectDetails.jsx, ProjectCard.jsx,
  PublicProjectImage.jsx, usePublicProjects.js, publicProjects.js and the test.
- `npm.cmd run build`: passed for the client and unchanged Worker bundle.
  `git diff --check`: passed. No unrelated historical test suites were run.
- Preservation checks: **91 protected source/config files** match the Task 5
  start hashes. Legacy Homepage card return markup and global category property
  declarations match HEAD. The full local Batch #1 evidence block is preserved.
- QA artifacts are outside the repo in the user's temporary directory:
  `bitreca-projects-qa.mjs` and `bitreca-projects-qa-20261104/` (the directory
  name is an artifact label; these Task 5 results were completed on 2026-11-05).

### Status, files and limitations

**READY FOR REVIEW**, local only. No Projects-specific implementation blocker
remains in the tested scope. There were no published local records, so populated
layouts used isolated fixtures rather than a real published-project catalogue.
Actual project completeness and external-site availability depend on owner-managed
published content. No fabricated projects, outcomes, testimonials or demo URLs
are shipped. Chrome viewport emulation is not physical-device, cross-browser or
screen-reader certification. No total effort/time-spent figure is claimed.

Changed files: `src/pages/Projects.jsx`, `src/pages/Projects.css`,
`src/pages/ProjectDetails.jsx`, `src/pages/ProjectDetails.css`,
`src/components/ProjectCard.jsx`, `src/components/PublicProjectImage.jsx`,
`src/hooks/usePublicProjects.js`, `src/utils/publicProjects.js`,
`tests/public-projects.test.js` and this roadmap. No dependencies, Worker APIs,
admin management, auth, migrations, D1/R2 configuration, hosting, secrets or
unrelated pages changed. No commit, push or deployment; stop after Projects.

## Deploy Batch #2: Projects — pushed and verified Live (2026-11-05)

Owner authorized a single ten-file Projects/roadmap commit and ordinary push to
main. Baseline is Batch #1 commit `877505452a784205353ff6357e94a9f0a80c88b1`;
refreshed origin/main equals local HEAD. All tracked/untracked changes match the
exact approved manifest, with no unrelated files staged or source edits needed.

- Reviewed listing/detail JSX/CSS, shared card opt-in, new image/hook/URL helper,
  focused test file and roadmap. No implementation blocker found.
- All 91 protected source/config hashes match the Task 5 baseline. Homepage
  ProjectCard default markup and legacy category presentation match HEAD.
  Homepage, Services, Contact, Products, PortfolioForest, Store, Worker APIs,
  deletion, auth, resources, secrets and Cloudflare configuration have no changes.
- The complete **Batch #1 post-deployment SHA/build/version/live evidence block
  is preserved and included in the Batch #2 roadmap commit**. Its earlier
  statements about being uncommitted describe the Batch #1 handoff, not its
  inclusion in Batch #2. No Batch #1 evidence was removed or rewritten.
- Existing Task 5 browser QA, three safety tests and scoped lint are reused.
  No repeat visual, isolated-fixture or historical testing in this deploy task.
- Single final `npm.cmd run build`: passed for client and unchanged Worker.
  Exact staged whitespace check is performed before the commit. Client output:
  `/assets/index-DN3ADZNY.js`, `/assets/index-oqcfpEgI.css`.
- Exact ten-file staged manifest passed `git diff --cached --check`. No
  unrelated files, secrets or generated build output were staged.
- Commit: **`3ed49f470ae25f4a7a4900a8c5a188299f2473cf`**, title
  `Complete public Projects listing and detail experience`.
- `git push origin main`: succeeded, fast-forward from `8775054` to `3ed49f4`.
  One commit, no force push and no direct Wrangler deployment.
- Cloudflare GitHub check **Workers Builds: bitreca-website** completed with
  **success** for this exact SHA. [Build details](https://dash.cloudflare.com/4ec868eac2a3b9127531ad39d2501f15/workers/services/view/bitreca-website/production/builds/43b30b33-7d5d-4bba-b006-4db61d5d22cd).
- Read-only deployment history showed the new version
  **`db06bceb-d8b2-4942-be34-a0241f3552d2`** at **100%**, deployed
  `2026-11-05T05:13:08.677Z`. No configuration/resource mutations were issued.

Approved manifest: `src/pages/Projects.jsx`, `src/pages/Projects.css`,
`src/pages/ProjectDetails.jsx`, `src/pages/ProjectDetails.css`,
`src/components/ProjectCard.jsx`, `src/components/PublicProjectImage.jsx`,
`src/hooks/usePublicProjects.js`, `src/utils/publicProjects.js`,
`tests/public-projects.test.js`, `docs/BITRECA_V1_ROADMAP.md`.

### Targeted read-only production checks

All checked documents returned HTTP 200 and rendered the final-build bundle
**`/assets/index-DN3ADZNY.js`** (no screenshots or visual/fixture tests repeated).

| Route/API | Actual result |
| --- | --- |
| `https://bitreca.com/projects` | New listing rendered both existing published records: Portfolios and Stockly POS; both project detail hrefs present; no listing error |
| `/api/projects` | HTTP 200, success true, 2 published records |
| `https://bitreca.com/projects/stockly-pos` | Direct published detail rendered Stockly POS, existing image loaded, back link targets `/projects` |
| `/api/projects/stockly-pos` | HTTP 200, success true, slug `stockly-pos` |
| `https://bitreca.com/` | Existing Homepage rendered successfully |
| `https://bitreca.com/portfolioforest` | Existing PortfolioForest rendered successfully |
| `/api/portfolios` | HTTP 200, success true, 6 entries |

No application POST/PUT/PATCH/DELETE requests or uncaught page exceptions were
observed. Production data was read only; no seed, update or deletion occurred.
One temporary runner helper-name collision was corrected before it made any
requests; no application change was required. Temporary smoke runner is outside
the repository: `bitreca-batch2-production-smoke.mjs` in the user's temp directory.

**Batch #2 is verified Live, not merely pushed.** No deployment/implementation
blocker remains for this batch. Batch #1's complete formerly local deployment
record is now included in commit `3ed49f4`, as authorized. Its historical wording
about remaining uncommitted at the Batch #1 handoff is retained as evidence.

This final Batch #2 SHA/live evidence update remains **local and uncommitted**;
the single pushed commit contains its pre-push audit/build record. No second
commit or push was made. No About or Store work was started. Stop after Batch #2.

## Task #6: Contact Inbox + Admin — implementation complete, activation BLOCKED

Production baseline remains **`3ed49f470ae25f4a7a4900a8c5a188299f2473cf`**.
This local task supersedes the earlier optional Resend architecture. No paid
service, automatic email/WhatsApp delivery, new login system or parallel database
was added. The complete previously uncommitted Batch #2 SHA/build/version/live
record above is preserved; no release action has been authorized/performed here.

### Implemented

- Contact submits to the existing Worker `/api/enquiries` route and acknowledges
  success only after D1 confirms storage. The response is 201 (new) or 200 (exact
  receipt retry), status `stored`, with a UUID reference. No provider-acceptance
  message or Resend endpoint/key remains in the implementation.
- Approved Contact layout, company WhatsApp and direct email actions remain.
  Copy/manual fallback remains available when inbox submission is unavailable.
  Optional international phone field plus explicit WhatsApp checkbox control
  whether an owner WhatsApp reply action is allowed. No number is auto-filled.
- One additive migration **0018_add_contact_enquiries.sql** creates only
  `contact_enquiries`, `contact_enquiry_limits` and their indexes in existing
  `bitreca_db`. IDs, unique request IDs, receipt HMAC, timestamps, status and
  optimistic row version are stored. No existing schema/data is altered/deleted.
- Public validation/body limits, same-origin/allowed-origin checks, honeypot,
  required free Turnstile hostname/action verification and atomic primary-D1
  attempt counters fail closed. Limits: 5/IP per ten minutes, 20 shared/minute,
  200 shared/day (fixed UTC windows). IPs are daily-scoped HMACs, not stored raw.
  Counter expiry cleanup is bounded and touches only its own ephemeral table.
- Unique insert/conflict resolution covers concurrent duplicates and lost write
  acknowledgements. Same request ID with changed content returns 409. D1 errors
  never claim success or definite non-storage. Raw content/tokens/keys are not
  logged or exposed by the public API.
- `/admin/enquiries` reuses ProtectedAdminRoute/AdminLayout/useAdminApi. Dashboard
  quick action and sidebar link expose the inbox. Worker dispatch occurs after
  the unchanged existing admin session and mutation-origin guards.
- Owner can page through twenty-row keyset lists, filter four statuses, read
  details and save New/In Progress/Replied/Archived with version conflict checks.
  List payload omits bodies, phone, request IDs and hashes. All private responses
  are no-store; there is no public list/read or new delete/export endpoint.
- Manual mailto reply is validated/encoded; manual WhatsApp reply requires a
  valid stored phone and consent. Links open the external app for owner review;
  they neither send nor mark Replied. Status changes are separate explicit saves.
- Stored content is escaped React text. A 401 redirects to existing login and
  removes the inbox UI. Existing authentication/session logic is unchanged.

### Verified checks (2026-11-05)

- **17 focused tests passed**: 16 against real in-memory SQLite (full existing
  0004 auth migration and additive 0018), plus one isolated workerd/Miniflare D1
  runtime test. No remote database or real credentials were used.
- Tests cover additive constraints/preserved existing rows; method/origin/body/
  field/phone-consent rejection; CAPTCHA hostname/action/failure; actual stored
  acknowledgement; replay/conflict/concurrent duplicate handling; uncertain
  write recovery; persistent atomic limits; bounded counter cleanup; private
  no-store list/detail; cursor/status filtering; concurrent status edits; no
  public reads; anonymous/forged/expired/revoked/rotated session denial; reply URLs
  and absence of outbound provider code. No historical unrelated suites run.
- Scoped ESLint passed for all changed JS/JSX and the two focused tests/helper.
  `npm.cmd run build` passed for Worker/client; `git diff --check` passed.
- Chrome new-workflow browser checks at **1440/768/390px** used a loopback-only
  server serving the built UI, real Worker handlers, actual existing session
  login and an in-memory synthetic SQLite database. Only the Turnstile widget/
  Siteverify responses were test doubles; the storage/auth/admin API were real
  implementation code. No production resources or messages were accessed.
- Public submission -> exactly one saved row -> owner session -> protected
  inbox/details passed. Required fields, optional phone consent, disabled/loading
  controls, duplicate-action suppression, honest saved reference, status changes,
  all-status filtering, 20+5 pagination, version conflict/reload and manual link
  behavior passed. No phone means no WhatsApp reply link.
- Script-like message content stayed literal. HTML/legacy accepted responses did
  not produce saved success. Lost receipt retry kept one row; rate feedback and
  disabled-submission fallback passed. Revoked owner session redirected to login
  without retaining an inbox view. No external browser request or uncaught page
  exception was observed in the workflow run.
- Reviewed Contact/new Inbox screenshots at all three sizes; no document or
  form/detail overflow found. Keyboard focus and owner selection worked. Other
  approved public-page visual/fixture suites were not repeated.
- Browser artifacts are temporary and outside the repo:
  `bitreca-inbox-test-server.mjs`, `bitreca-inbox-browser-qa.mjs` and
  `bitreca-inbox-qa-20261105/` in the user's temporary directory. The temporary
  server has no real D1 bindings/credentials and no outbound-send capability.

### Release blockers and stop gate

**BLOCKED for production activation; ready for owner implementation review.**

1. Owner must review/authorize this exact implementation, additive migration,
   privacy/retention procedure and attempt thresholds. Archives retain PII;
   there is no automatic purge. No total task-time/effort figure is claimed.
2. Free Managed Turnstile hostname-scoped widget/public key/private secret and a
   separate high-entropy CONTACT_RATE_LIMIT_SECRET must be supplied/configured
   for the approved environment. They were not installed or externally verified.
   CONTACT_INBOX_ENABLED remains false/absent until authorized activation.
3. Release preflight must verify the existing D1 migration ledger, with 0018 the
   sole pending change; never replay historical portfolio/auth/deletion SQL.
4. After approval: additive migration, reviewed code commit/push, existing
   Cloudflare deployment, enablement and **one authorized live public-to-private
   inbox enquiry test**. No live test was run at this gate.

The single release sequence, exact future commands/settings, free-widget setup,
privacy/retention guidance and fail-safe disable/rollback are in
[CONTACT_ENQUIRY_INTEGRATION.md](CONTACT_ENQUIRY_INTEGRATION.md). No production
migration, subscription, config/secret/DNS/resource change, commit, push or deploy
was performed. Production email sending remains unused, not a dependency.

Exact Task #6 files:

- `migrations/0018_add_contact_enquiries.sql`
- `shared/contact-enquiry.js`
- `worker/contact-enquiry.js`, `worker/contact-http.js`, `worker/admin-enquiries.js`,
  `worker/index.js` (new protected dispatch/import only)
- `src/pages/Contact.jsx`, `src/pages/Contact.css`
- `src/pages/AdminEnquiries.jsx`, `src/pages/AdminEnquiries.css`
- `src/App.jsx`, `src/components/AdminLayout.jsx`, `src/pages/AdminDashboard.jsx`
  (route/navigation/quick action only)
- `tests/contact-enquiry.test.js`, `tests/contact-d1-runtime.test.js`,
  `tests/helpers/contact-d1.js`
- `docs/CONTACT_ENQUIRY_INTEGRATION.md`, `docs/BITRECA_V1_ROADMAP.md`

Protected source/config hash baseline and complete Batch #2 evidence are checked
before handoff. Homepage, Services, Products, Projects, PortfolioForest, old
migrations, deletion, hosting and existing auth implementations are preserved.
Stop at this owner review/release gate; do not start other V1 milestones.

## Contact activation attempt — 2026-11-06

Owner authorized migration 0018, the reviewed eighteen-file commit/push,
activation and one real Turnstile enquiry. Read-only release checks found:

- Production `bitreca-website` runtime contains all five Contact settings.
  CONTACT_TURNSTILE_SECRET, CONTACT_RATE_LIMIT_SECRET and CONTACT_ALLOWED_ORIGINS
  are secret bindings; CONTACT_TURNSTILE_SITE_KEY and CONTACT_INBOX_ENABLED are
  plain-text bindings. The enable flag is `false`. No secret values were read.
- Existing `bitreca_db` still targets database
  `8ff2d1f7-e747-4fe8-a6a3-87898e1ae79a`. Remote migration listing confirms
  **0018_add_contact_enquiries.sql is the sole pending migration**.
- **BLOCKED before migration/push:** dashboard-only plain-text Contact settings
  are absent from wrangler.jsonc, whose keep_vars option is unset. Wrangler's
  installed configuration schema says ordinary deployment overrides/deletes
  dashboard variables unless keep_vars is true. Persistence is not established.
- Proposed minimal fix: add `"keep_vars": true` to wrangler.jsonc. This would be
  a nineteenth release file and requires owner authorization beyond the explicit
  eighteen-file manifest. No configuration edit was made at this gate.
- No production migration, setting change, commit, push, activation or live
  enquiry was performed. Inbox remains disabled; existing fallback is preserved.
  Prior Batch #1/#2 deployment evidence is retained. Completed QA was not rerun.

## Authorized Contact release — 2026-11-06

Owner approved adding wrangler.jsonc as the nineteenth release file with only
`"keep_vars": true`. Focused parsed-config comparison passed: removing that one
property produces exactly HEAD's configuration. No resource, route, portfolio
flag, authentication setting or scheduled task was changed.

Remote preflight reconfirmed only 0018 pending, then the authorized
`wrangler d1 migrations apply bitreca-db --remote` succeeded for
**0018_add_contact_enquiries.sql only** on database
`8ff2d1f7-e747-4fe8-a6a3-87898e1ae79a`. Existing QA is reused; no broad tests
were repeated. Runtime Contact settings were present, inbox disabled before
rollout. Commit/push, deployment, enablement and real test evidence follow after
they occur; none is claimed by this pre-commit record. Preserve new tables on
fallback; disable the inbox flag rather than dropping data.

### Contact deployment and enablement evidence — 2026-11-06

- Exact nineteen-file commit:
  **`3e05fdb5438e4e5488e3ab76b5cf956b1a8c86b5`**, title
  `Add secure D1 contact enquiries and protected admin inbox`.
  Exact staged manifest/whitespace checks and Batch #2 evidence preservation
  passed. Ordinary push to origin/main succeeded from 3ed49f4 to 3e05fdb.
- [Cloudflare GitHub build](https://dash.cloudflare.com/4ec868eac2a3b9127531ad39d2501f15/workers/services/view/bitreca-website/production/builds/b59cf001-e688-46d2-acb6-3e48509ba6bc)
  completed with success. Git deployment version
  `11a8b04c-498a-4ca1-a690-a09b129f2ff6` served 100% at
  `2026-11-06T04:58:03.168325Z`.
- All five runtime Contact settings survived Git deployment. Allowed origins,
  Turnstile secret and independent rate secret are secret bindings; public widget
  key and enable flag are plain-text bindings. No secret values were exposed.
- Authorized settings PATCH changed only CONTACT_INBOX_ENABLED to `true` and
  inherited every other runtime binding. Before/after binding comparison passed.
  Activation deployed version `9ffb04ed-8772-462c-acbd-7fa36b44d573` at 100%,
  `2026-11-06T05:01:05.869067Z`. No code/resource/auth/portfolio setting changed
  during enablement.
- Both `https://bitreca.com/api/contact/config` and the www equivalent returned
  HTTP 200, enabled=true, mode=inbox and a present public site key.
  Anonymous `GET /api/admin/enquiries` returned **401**.
- Read-only post-migration checks confirmed the 0018 ledger record and both new
  contact tables/indexes. Protected file hashes match except the explicitly
  approved, separately verified keep_vars edit. Existing QA was reused.
- **Real Turnstile submission and authenticated inbox verification remain
  pending human interaction.** Owner was asked to submit exactly one labelled
  release enquiry using their own email, then confirm the saved UUID/message in
  `/admin/enquiries`. No CAPTCHA bypass, fabricated session, automatic message or
  additional enquiry is used. Deployment/enabling is verified; the full live
  submission workflow is not yet claimed.
- This post-commit evidence update is local/uncommitted; no second commit/push.
  Batch #1/#2 evidence is retained. If live validation fails, disable the flag;
  preserve all contact tables/submissions and existing direct-contact fallback.
  No About work started.

### Failed live submission diagnosis — 2026-11-06

Owner reported the generic unconfirmed-submission response, no saved UUID and
no message in authenticated Admin Inbox. HTTP/JSON response status and completion
of real Turnstile were not captured; root cause is not established.

The agent executed the authorized migration, not the owner manually. Existing
execution output identified production bitreca-db
(`8ff2d1f7-e747-4fe8-a6a3-87898e1ae79a`), executed six commands and marked
0018_add_contact_enquiries.sql successful. Fresh read-only SELECTs confirm:

- Ledger entry applied_at `2026-11-06 04:56:20` (UTC).
- Both contact_enquiries and contact_enquiry_limits exist.
- Enquiry count is zero. No visitor content or identifiers were read.
- Read-only query metadata reports zero writes and changed_db=false.
- Before fallback, both hostname config endpoints returned enabled=true,
  mode=inbox and public site key present. Runtime binding metadata still matches
  the configured database. Missing migration is ruled out; CAPTCHA validity,
  request parsing, response routing and post-validation storage path are not.
- Aggregate counters show a shared daily max_hits=2 and expired minute/IP
  buckets with max_hits=1; this does not demonstrate exhausted rate limits or
  identify the failing request/stage.

Fallback verified: CONTACT_INBOX_ENABLED=false on both production hostnames;
all other runtime bindings compare unchanged. Anonymous inbox API still returns
401. Tables and direct-contact options are preserved.

Status remains **Deployed — live verification blocked**. No migration reapply,
new enquiry, code change, commit or push was performed during diagnosis. Use the
agreed disabled-inbox fallback while preparing a supervised diagnostic retry;
preserve both contact tables and WhatsApp/email/copy options. Before retry,
capture only HTTP response status and JSON `status` for POST /api/enquiries.
Never share request payloads, CAPTCHA tokens, cookies or credentials.

### Siteverify exception fix — 2026-11-06

Owner captured HTTP 503, JSON status challenge_unavailable. Actual workerd probe
at the production compatibility date reproduced a TypeError constructing a
request with redirect='error': workerd accepts only follow/manual. This occurs
before provider I/O. With redirect='manual', the same eight-second timeout and
synthetic invalid credentials reached Siteverify and returned HTTP 400 JSON.
No real credentials/tokens or enquiry endpoint were used by this probe.

Changed only the Siteverify redirect policy to manual: no redirect following,
no trust of non-2xx, and unchanged secret/token/hostname/action verification.
Strengthened runtime regression to construct the handler's actual request options
inside workerd, plus redirect/non-2xx rejection with no stored rows. All 17 focused
tests, scoped lint and build passed. Additional rejection cases were isolated
after the existing attempt budget correctly limited a shared test fixture.

Inbox was disabled during diagnosis; keys, migration 0018 and existing data were
not changed. Root cause is request-mode compatibility, not evidence of a bad
secret or provider outage. Status stays **Deployed — live verification blocked**
until the fixed deployment passes a fresh real challenge and protected-inbox
confirmation. No new broad/visual/historical QA cycle was run.

### Siteverify fix rollout evidence — 2026-11-06

Fix commit **1259994fff6bb04ce2e8b86c4e4bf795ad736daf** pushed normally to main.
Four files: Worker Contact handler, two focused test files and this roadmap
(including previously local release/diagnosis evidence). Staged whitespace passed.
[Cloudflare build](https://dash.cloudflare.com/4ec868eac2a3b9127531ad39d2501f15/workers/services/view/bitreca-website/production/builds/0da8c795-97ff-4068-b4d4-7ee08fed5db2)
completed successfully; Git rollout version
`32034a54-79b0-4472-a451-8fb1f3296fdc` served 100% at
`2026-11-06T05:57:34.632901Z`. All five Contact runtime settings survived.

After rollout, inbox re-enabled for one owner-performed fresh real Turnstile test.
Both production config endpoints returned enabled=true, mode=inbox, public key
present; anonymous inbox API returned 401. Before/after comparison verified
only the enable flag changed, with other runtime bindings identical. No key
rotation, production schema change, migration reapply or data modification.
Status remains **Deployed — live verification blocked** until owner confirms
the fresh saved reference in authenticated Admin Inbox. This final rollout
evidence update remains local/uncommitted. Batch #1/#2 evidence is retained.

## Contact Inbox — Verified Live (2026-11-07)

Owner confirmed the existing successful production enquiry was saved and appears
in the authenticated Admin Inbox. Saved reference:
**`f22e5c3e-641c-4514-b102-e000d886e03a`**.
Confirmed fix commit: **`1259994fff6bb04ce2e8b86c4e4bf795ad736daf`**.

This owner-confirmed live result completes the public submission-to-protected
inbox verification and supersedes the earlier blocked/pending status records,
which remain intact as historical evidence. No additional enquiry was submitted,
and no completed QA, migration or production data operation was repeated.
Prior successful deployment/runtime-settings and anonymous-access-denial checks
are reused. No remaining activation blocker is recorded for this workflow.

Owner authorized committing/pushing this final roadmap-only update, including
the previously local Siteverify rollout evidence above. Earlier local/uncommitted
wording describes the original handoff; that evidence is included in this final
documentation commit. Complete Batch #1/#2 evidence is preserved. Stop after
Contact Inbox; About has not been started.

## About — implementation and local QA (2026-11-07)

Owner authorized the About page, scoped release and final documentation push.
Existing page was a one-heading placeholder; `/about` already had a route.
Replaced it with a responsive introduction, four software disciplines, a
three-step approach, explicitly aspirational ambition, Stockly POS context and
project/contact CTAs. Copy draws from existing Homepage, Services and Products:
no invented team, dates, credentials, clients, testimonials or achievements.
Only About.jsx, new About.css and this roadmap are release files. No new assets,
dependencies, shared component changes, API changes or production setting edits.

Verification:

- Scoped ESLint for About.jsx passed; final npm.cmd run build passed for client
  and unchanged Worker. Final bundles index-Ar5wbe2d.js / index-CaPd-E2O.css.
- Built UI served by a loopback-only temporary static server. Chrome at
  1440/768/390px: screenshots reviewed; one H1, four disciplines, three steps,
  valid labelled-by references and no document/content overflow at each width.
- Tab showed visible focus; Enter navigated Projects, Services and Contact;
  all ten page links have meaningful text and valid internal hrefs. Five
  service/product fragment links navigated to routes with existing target IDs.
  Existing tablet/mobile menu opened/closed by keyboard in the About context.
  These are link checks, not repeated destination-page feature QA.
- A reduced-motion transition-specificity issue was found, fixed in About-only
  CSS and verified in the final built UI. Temporary keyboard runner corrected
  Enter character dispatch before testing native buttons; no shared code change.
- Final run: no uncaught browser exceptions or non-GET/HEAD requests. No Contact
  Inbox workflow was retested. No production data was touched.
- Temporary local artifacts outside repository: bitreca-about-qa.mjs and
  bitreca-about-qa-20261107 in the user's temp directory. Local report and three
  full-page screenshots retained. Chrome emulation is not physical-device or
  cross-browser certification. No unmeasured task-time claim.
- Scoped whitespace/manifest checks run before release commit. Historical
  Batch #1/#2 and Contact Inbox deployment evidence remains intact.

Live deployment/verification is pending this pre-commit record; no Live result
is claimed yet. Stop after About; no Store work was started.

## About — Verified Live (2026-11-07)

- Release SHA **`e59a5c1e1eb235fb1ab79dca7798a59632011d9b`**, title
  `Complete responsive About page with factual Bitreca introduction`.
  Exact three-file staged manifest and whitespace passed; normal push to main
  succeeded from 7764e72. No unrelated files or configuration changes.
- [Cloudflare build](https://dash.cloudflare.com/4ec868eac2a3b9127531ad39d2501f15/workers/services/view/bitreca-website/production/builds/7f98d64e-3465-4b3e-830e-da4f273c26d3)
  completed with success for the release. Read-only history showed version
  **`a2b5776c-1652-4c21-8858-d5b178776ca6`** at 100%, deployed
  `2026-11-07T07:39:50.849193Z`.
- `https://bitreca.com/about` returned HTTP 200 with expected release assets
  `/assets/index-Ar5wbe2d.js` and `/assets/index-CaPd-E2O.css`.
- Live Chrome checks passed at **1440/768/390px**: correct sections and one H1,
  valid labels, no horizontal overflow, visible keyboard focus, Enter navigation
  to Services/Projects/Contact, fragment target IDs, responsive menu behavior and
  reduced-motion transition setting. Live screenshots/report retained beside
  local artifacts in bitreca-about-qa-20261107; mobile screenshot reviewed.
- No uncaught page exceptions or application mutation requests. Existing
  Cloudflare `POST /cdn-cgi/rum` analytics beacons were observed; temporary runner
  initially counted those as mutations, then correctly classified them separately.
  No application change or production setting change was needed.
- Read-only runtime metadata confirmed the existing D1 binding and all Contact
  settings remained present, with inbox enabled. No Contact Inbox submission,
  authentication or admin QA was repeated, and no production data was changed.
- **Verified Live.** This final roadmap-only commit/push includes actual release
  evidence; earlier pending wording is historical. Batch #1/#2 and Contact Inbox
  evidence remains intact. No blocker in the checked scope. Physical-device,
  screen-reader and cross-browser certification were not performed. No new Store
  work; stop after About.

## Store planning — 2026-11-07 (documentation only)

This plan supersedes the earlier unspecified Store milestone, not the completed
software Products page. Source baseline: 1ce6f51c98396c17135c46609d409dd09ebcb47d.
Planning does not authorize implementing these milestones, production migrations,
supplier/payment configuration or real orders. Each implementation milestone
requires a separately agreed scope and release. Existing deployment evidence
above remains historical and intact; no completed page QA was repeated.

### Existing capability audit

Inspected Store.jsx, StoreCategory.jsx, ProductCard.jsx, Homepage Store section,
Products.jsx, App.jsx, AdminLayout.jsx, AdminDashboard.jsx, AdminProjects.jsx,
ProtectedAdminRoute/admin request helpers, Worker routes/media handling, package
manifest and migrations 0001–0018. Reused existing roadmap and Contact integration
evidence. This is source/schema inspection, not new functional Store QA.

| Area | Already present / reusable | Partial or missing |
| --- | --- | --- |
| Public Store | /store route; Navbar/Footer/Homepage entry links | Store.jsx renders only an H1; no catalogue, details, loading/error/empty states or Store stylesheet |
| Category presentation | Homepage lists Storage, Memory, Graphics, Displays, Peripherals via StoreCategory | Every card points to /store; no category data/filtering or verified saleable items. Labels are not supplier/availability evidence |
| Software Products | Approved static Stockly POS showcase; ProductCard links to /products | Separate from hardware Store. No retail SKU/price/inventory model; do not repurpose the page or silently change Homepage's ProductCard behavior |
| Admin | Existing owner login/session authorization, layout, request helper; Projects/Portfolios/Enquiries management | /admin/store and /admin/products sidebar links have no matching React route. No Store CRUD, category management, order management or sales statistics; sidebar labels do not establish working features |
| API / storage | Existing Worker, D1 binding, image-upload/media handling, published-project pattern | No Store/product/order/cart/checkout/payment endpoints in Worker sources. Repository migrations contain no commerce tables. Project records and Contact enquiries are not products/orders |
| Checkout / orders | No implementation found | No cart persistence, address capture, authoritative pricing, shipping calculation, checkout, order IDs/idempotency, order statuses, cancellation or payment reconciliation |
| Operations | Manual contact options and verified private project-enquiry inbox exist | No verified suppliers, feed, stock/pricing process, fulfilment owner, delivery contract/areas, currency, payment method, returns/warranty rules or order-confirmation workflow. Contact is not an order system |

No commerce SDK/payment package is installed. Existing auth, D1 and media patterns
can be reused after Store-specific review; this does not certify a ready-made
commerce backend or permit changes to PortfolioForest/deletion. Do not add paid
integrations or subscriptions, automate suppliers, or assume dropshipping is the
confirmed fulfilment model just because it appears in the old roadmap label.

One read-only production schema inventory on configured bitreca-db
(`8ff2d1f7-e747-4fe8-a6a3-87898e1ae79a`) confirmed no commerce tables:
`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE
'sqlite_%' ORDER BY name`. Metadata reported rows_written=0, changes=0,
changed_db=false. Only table names were read; no customer/project/portfolio/order
content or credentials were accessed. No new public/admin Live QA was performed.

### Release meanings and operating gates

- **Store introduction:** truthful category/direction page; no actual item
  catalogue or checkout. S1 can ship without settled commercial operations.
- **Live catalogue:** S2+S3 have owner-approved published real items and accurate
  availability/price wording. Browsing/enquiring is possible; ordering/payment
  is explicitly unavailable. An empty catalogue is not advertised as stocked.
- **Ready to accept real orders:** only after S5, with approved currency, supply,
  delivery, total-price rules, payment method and an owner-operated fulfilment/
  cancellation process. A cart or saved request alone is not an accepted order.
  No “paid”, “confirmed”, stock or delivery promise without its supporting event.

Every milestone below ends with its own focused QA, reviewed commit/push through
the established Cloudflare Git workflow, successful build/deployment check and
targeted Live verification. Store writes/migrations/live test records require
specific approval. Keep existing runtime settings/keep_vars and protected data
unchanged. Estimate ranges include implementation, scoped QA, release review
and one targeted verification cycle, not waiting on owners/suppliers/accounts.

### Sequential milestones

#### S1 — Honest Store introduction and category directory (4–8 hours)

**Recommended first implementable milestone.** Replace only the Store placeholder
with the approved dark navy/blue layout, the five existing category descriptions,
clear catalogue-in-preparation wording and working Contact/WhatsApp enquiries.
No fictional SKUs, pricing, stock, purchasing, checkout, delivery or supplier
claims. Existing Contact remains a general enquiry, never an order receipt.
Use Store-local styles/components; preserve Homepage and software Products.

Dependencies: existing brand/copy/category facts and official contact links are
available. Owner only needs to approve this limited informational scope; no
payment, currency, delivery-area or supplier choice blocks S1. Do not publish
unapproved launch dates. No database/API/admin changes.

Acceptance/release: direct /store load, readable 1440/768/390px layouts, keyboard
focus/menu/link checks, correct enquiry wording and no dead/fake buy buttons;
scoped lint/build/whitespace, then approved Git deployment and read-only Live
Store/navigation verification. Report **introduction Live, commerce unavailable**.

#### S2 — Minimal catalogue data and protected owner management (12–20 hours)

Add only Store-specific tables with an approved additive migration in existing
D1, protected /admin/store route and bounded owner CRUD for simple products:
SKU/slug, title/category, plain specifications, approved image, source reference,
draft/published visibility, availability/last-checked fields and optional approved
display price plus explicit currency. Store money in currency minor units when
prices are used; never infer currency. Prefer unpublish/archive over deletion.
Owner manually maintains initial data; no supplier feed/automation in this scope.

Dependencies: owner-approved initial product list/specifications/image rights,
supplier/availability evidence and data-maintenance responsibility. Decide
priced catalogue versus “enquire for price”; only the priced branch needs an
approved currency/price/tax display policy here. Simple products only: variants,
bundles or feed synchronization require revised scope/estimates, not silent work.
Use existing owner authentication/helpers, not a parallel login. Review media
reuse and an isolated Store namespace without touching portfolio storage/deletion.

Acceptance/release: draft records are private; anonymous/invalid-session reads
and writes denied, mutation origin checks enforced; validated bounded inputs,
unique SKUs/slugs, safe text/images, paginated admin states and edit conflicts.
Focused schema/auth/CRUD tests on isolated fixtures plus admin browser checks,
lint/build; review ledger before the separately approved additive migration,
deploy, then one owner-authorized draft create/edit/unpublish Live check.
No public buying, order records or changes to existing data. Live catalogue
content is still gated on S3; the admin tool alone is not a public Store.

#### S3 — Published public catalogue and item details (10–18 hours)

Read published Store records dynamically on /store and /store/:slug, with simple
category filtering, bounded pagination, responsive images/specifications and
product-specific enquiry links. Include loading, empty, error and not-found
states. Show only approved price/currency and dated/manual availability wording;
unknown supply must not become “in stock”. No cart, buy/download or payment action.

Dependencies: S2 and at least one owner-approved real published item for a
populated catalogue release, plus agreed enquiry-only disclaimer. Supplier prices
and availability must have an owner-defined review cadence; stale items can be
unpublished rather than promised. Empty-state release alone is not a populated
live catalogue. No changes to /products or approved Homepage required.

Acceptance/release: published-only API/detail access, no draft/source-sensitive
fields exposed, safe rendering, direct slug/back/filter behavior, responsive
1440/768/390px and keyboard checks. Scoped fixture/API checks, lint/build,
deploy and read-only Live catalogue/detail/enquiry-link verification against an
approved item. Do not submit another Contact enquiry as catalogue link QA.
Report **catalogue Live; orders not accepted**.

#### S4 — Order-request workflow behind a disabled launch gate (24–40 hours)

Build only after the operating decisions below are approved. Add a small cart
for simple SKUs, server-validated order-request creation, immutable item/price/
currency/delivery-fee snapshots, request-ID duplicate protection and a protected
paginated Admin Orders view. Capture only necessary contact/delivery fields;
reuse reviewed Turnstile and bounded abuse patterns without changing project
enquiries or existing auth. Revalidate catalogue/quantity/availability and compute
totals server-side; never trust browser prices. Unsupported areas/items are
rejected; no speculative reservations or guaranteed supplier stock.

Dependencies: S2+S3; owner approves suppliers and who buys/dispatches; delivery
areas, rates, timing and address format; one currency/tax/rounding policy; one
payment method; cancellation/returns/warranty and privacy/retention rules; owner
monitoring/reply process. Define request versus acceptance and fulfilment statuses.
No automatic messages, external fulfilment, card capture or paid integration.
An online-only payment decision without a verified provider is a blocker, not a
reason to silently substitute cash on delivery or bank transfer.

Acceptance/release: input/quantity/price tampering, idempotency/concurrent retry,
auth/no public order enumeration, status conflicts, failed storage and unavailable
product/area handling tested on isolated data. Cart/request/admin focused browser
QA, lint/build and reviewed additive migration/code release. Production ordering
stays disabled; verify launch gate/fallback and approved protected admin surface
Live without a real customer order. Report **workflow deployed, not order-ready**.

#### S5 — Controlled manual-order launch and operational handover (8–16 hours)

Current status: **Demo validation in progress — operational launch blocked by supplier/fulfilment decisions**.
The owner-authorized 2026-11-08 demo validation below does not authorize enabling
intake, accepting orders, configuring payments or making supplier commitments.

Publish approved delivery, payment, cancellation/returns/warranty and privacy
information in the Store flow; enable the approved method only after owner
acceptance. Order request receipt must say pending review, not paid/accepted.
Owner explicitly confirms supplier availability, price and delivery and records
acceptance/payment/fulfilment events separately. No payment method is preselected
by this plan; no automatic supplier purchase or messaging. The owner must have
an actual way to monitor and fulfil every accepted order.

Dependencies: S4, all operating decisions and a verified practical payment/
reconciliation process for the chosen method. Card/provider integration, if
chosen, needs a separate scoped milestone after account/currency/fee verification;
its build/approval/costs are not included in these estimates. Do not launch an
online-payment promise with an unverified provider.

Acceptance/release: focused end-to-end request/owner review/status/privacy and
failure/fallback QA; owner-approved production launch settings and Git deployment;
then one explicitly authorized controlled Live order with owner-controlled data
through the agreed acceptance/payment/fulfilment process. Any real charge,
supplier purchase, dispatch, refund or cleanup requires explicit authorization;
record actual events rather than simulating paid/delivered states. If validation
fails, disable new requests and preserve existing orders/admin access. Only mark
**ready to accept real orders** after successful technical and operational checks.

Baseline total S1–S5: **58–102 hours** of implementation/review/release effort,
not a schedule commitment. This excludes supplier onboarding, waiting for owner
decisions, catalogue population beyond the agreed pilot set, online payment
integration, automation, advanced variants, stock synchronization and logistics
contracts. Re-estimate each stage after its inputs are approved; no work starts
automatically just because a prior stage ships.

### Essential owner decisions (unanswered, not assumptions)

1. **Supply and fulfilment:** which initial products/categories and approved
   suppliers? Stock held by Bitreca, supplier dispatch or purchase-on-request?
   Who verifies availability, pays the supplier, handles dispatch and exceptions?
2. **Delivery:** which countries/areas, courier or collection option, fees, timing,
   failed-delivery responsibility and who bears duties/taxes? No Lebanon-only,
   worldwide, free-shipping or delivery-time assumption is made.
3. **Currency and pricing:** which displayed/settled currency, fixed prices versus
   quotes, exchange-rate ownership if relevant, tax inclusion and price validity?
4. **Payment:** which method is actually available to the business? Who confirms
   receipt/reconciles it, and when is an order accepted? No COD, bank transfer or
   card processor is assumed; paid integrations require separate approval.
5. **Customer obligations and operations:** who monitors orders, expected manual
   response hours, cancellation/refund/returns/warranty rules, authorised product
   imagery and personal-data retention/deletion process?

S1 is the recommended next action and is not blocked by these commercial
decisions. S2/S3 require verified merchandise/content; S4/S5 are blocked by the
unanswered operating/payment decisions. Keep a catalogue-only launch distinct
from permission or readiness to transact.

Planning validation: documentation-only diff/whitespace and exact staged-file
check before commit/push. No build or browser/feature QA needed or claimed for
this plan; no completed page or Contact Inbox tests rerun. No Store feature,
production data, payment configuration, secret or infrastructure change. Stop
after this roadmap plan; preserve all previous release evidence.

## Store S1 — implementation and local QA (2026-11-07)

Owner authorized only the introduction/category directory and its Git release.
The earlier planning audit is a historical baseline, not current page behavior.
Scope: Store.jsx, new Store.css and this roadmap. Reused the existing Store route,
shared header/footer, brand variables and the five established categories; no
architecture re-review, Homepage/shared component edits, assets or dependencies.

The page states catalogue in preparation, products/prices/stock not listed,
checkout unavailable and no orders accepted through the page. All five directory
links jump to meaningful category guides with compatibility/use-case questions.
Each guide has a category-specific WhatsApp enquiry; the final section links to
existing Contact and the separate software Products page. WhatsApp uses the
official number, opens a reviewable message in a new tab and sends nothing
automatically. Enquiries are expressly not orders/reservations or supply promises.
No fictitious products, pricing, suppliers, delivery dates or purchase actions.

Verified locally against the final production build:

- Scoped ESLint for Store.jsx passed. Required npm.cmd run build passed for
  client and unchanged Worker; bundles index-hxX8CCHl.js / index-DMY04gwX.css.
- Chrome at **1440/768/390px**: screenshots reviewed, one H1, five labelled
  category guides, five navigation entries, no horizontal overflow, no Store
  input/form/checkout controls. Availability notice present at every size.
- All six anchor links (hero plus five categories) activated by Enter and
  verified to scroll the intended visible target into view. A confirmed conflict
  with global smooth scrolling was fixed with immediate scrolling scoped only
  to the Store page; final checks passed. Visible Tab focus and keyboard
  mobile/tablet menu opening/closing passed.
- Contact and Products internal navigation passed. All six WhatsApp links have
  the official destination, appropriate prepared text, safe new-tab attributes
  and accessible new-tab notice. Links inspected without opening/sending any
  external message. No Contact enquiry submitted or Contact Inbox QA repeated.
- Reduced-motion transition/scroll settings passed; no uncaught browser errors
  or application mutations. Local runner/screenshots/report are outside repo:
  bitreca-store-s1-qa.mjs and bitreca-store-s1-qa-20261107 in user temp directory.
- Whitespace and exact three-file staged manifest checked before release.
  Existing evidence retained; no schema/API/admin/production configuration change.

Live verification is pending this pre-commit record. This is an introduction,
not a populated catalogue and not an operational shop. S2 tables/admin management
and all later milestones remain unstarted. No measured task-time claim.

## Store S1 — Verified Live (2026-11-07)

- Release **`f1c2c04b8053e32a3013c17dc44c669ded0e1c12`**, title
  `Complete Store introduction and hardware category directory`. Exact three-file
  manifest/whitespace passed; ordinary main push succeeded from 459ba05.
- [Cloudflare build](https://dash.cloudflare.com/4ec868eac2a3b9127531ad39d2501f15/workers/services/view/bitreca-website/production/builds/d1390c08-625e-43c0-be75-169b070fd7ce)
  completed successfully. Read-only deployment history shows version
  `5328f93b-2021-46f6-bcf5-32914f108421` at 100%, deployed
  `2026-11-07T08:13:48.872228Z`.
- `https://bitreca.com/store` returned HTTP 200 with release assets
  `/assets/index-hxX8CCHl.js` and `/assets/index-DMY04gwX.css`.
- Live Chrome checks passed at **1440/768/390px**: truthful unavailable-checkout/
  no-orders notice; five category guides; labelled sections and one H1; six
  keyboard anchor jumps scrolled to visible targets; visible Tab focus;
  mobile/tablet menu; Contact/Products links; no horizontal overflow; reduced
  motion settings. Screenshots/report saved alongside local artifacts; Live
  mobile screenshot reviewed.
- Six WhatsApp hrefs verified for official recipient, reviewable category/general
  text, new-tab notice and noopener/noreferrer. No external WhatsApp message,
  Contact enquiry, order or application mutation was sent. No uncaught browser
  exceptions. Existing Cloudflare analytics are not application mutation checks.
- Runtime metadata confirms existing D1 binding and Contact settings remain
  present with inbox enabled. No production configuration, schema, API, admin
  feature or completed page was modified or re-QA'd. All earlier deployment and
  planning evidence remains intact.
- **S1 Verified Live; no blockers in this milestone.** This is an introduction
  and category directory, not a populated catalogue or a store ready for orders.
  Supplier, fulfilment, currency, delivery and payment decisions in the plan
  remain unanswered. S2 catalogue tables/admin and later milestones are not
  started. Physical-device/cross-browser/screen-reader certification was not
  performed. This final roadmap-only update is committed/pushed separately as
  authorized; earlier pending wording is historical. Stop after S1.

## Store S2 — implementation and authorized migration (2026-11-07)

Owner authorized S2 schema/private admin workflows, additive migration and scoped
Git release. Earlier S1/planning statements are historical. No S3/public
catalogue API, checkout, order acceptance, payment, supplier integration or
operating policy was implemented. No sample catalogue data is seeded.

### Implementation and privacy

- New /admin/store uses existing ProtectedAdminRoute, AdminLayout and useAdminApi;
  existing sidebar Store link now resolves. New Worker dispatch is after existing
  session and mutation-origin checks. Authentication implementation is unchanged.
- Category/product create, paginated twenty-row lists/status filtering, private
  detail/edit, draft/published/archive states and optimistic version checks.
  Category choice pagination supports more than twenty categories. Public Store
  remains S1 regardless of admin publication status; published means owner-approved
  for a future catalogue, not a public listing in S2. No destructive delete API.
- Simple products include unique normalized SKU/slug, category, title/description,
  plain specifications, private Store image key, optional explicit price_minor/
  currency/price context, availability/check date and private supplier reference/
  internal notes. Draft/unknown/no-price are defaults; no assumed currency,
  supplier, stock or commercial policy. Publishing requires description/image,
  published category and price context if a price is supplied. Non-unknown
  availability requires a valid non-future check date.
- Strict field whitelist, type/length/date/slug/SKU/price validation, bounded JSON,
  bound SQL, generic sanitized errors, no new content/SQL/token logging, no-store
  responses. Client-generated UUID plus creation digest protects create retries;
  changed duplicate content conflicts, and versioned edits prevent lost updates.
- Store-only SQL triggers enforce category/product lifecycle even across races:
  unpublish published products before unpublishing a category; archive its active
  products before archiving it. Archived SKU/slug remains reserved. No cascades.
- Reuses existing bitreca_media binding under separate store-catalogue/UUID
  namespace, with new authenticated upload/read endpoints. Raw JPEG/PNG/WebP
  uploads bounded at 2 MB/five seconds and checked for file signature. No SVG,
  external URL, path traversal or public image endpoint. Existing public project
  media handler rejects Store keys and is unchanged. Lists exclude private notes
  and supplier references; full details and images require owner authorization.
- Read-only bucket settings confirmed managed r2.dev access disabled and no
  custom public domains. S3 must explicitly whitelist public product fields and
  review published image access separately; never expose private detail payloads.
- Uploaded/replaced/detached images are retained, not deleted automatically. Owner
  must use approved imagery and avoid unnecessary personal/secrets in notes. No
  media purge, hard record deletion or shared portfolio cleanup integration.

### Focused verification

- **10 Store-focused tests passed:** nine in-memory SQLite/auth/API tests plus
  actual bundled workerd D1/R2/session lifecycle test. Covers additive schema and
  preserved sentinel rows/auth, validation, anonymous/forged/expired/revoked
  denial, mutation origin, create/replay/conflict, unique identifiers, category
  state guards, version conflicts, private list/detail/media, no public routes,
  upload types/signatures/limits, pagination/filter/body errors, concurrent
  creates, lost acknowledgement recovery and safe database failure responses.
- Runtime harness was bundled using installed esbuild after direct Miniflare
  loading failed to resolve shared modules; no app dependency/config change.
  Additive assertion distinguishes ON DELETE RESTRICT from destructive SQL.
  No historical or Contact Inbox tests rerun.
- Scoped ESLint passed for all changed JS/JSX/tests with no warnings after fixing
  a new cleanup-ref warning. Required build passed: index-DFVrRiCS.js and
  index-DPBgnH_Y.css, with Worker/client bundles built successfully.
- Built UI with real Worker handlers/SQLite/auth and memory R2 at localhost:6202:
  Chrome **1440/768/390px** category/product creation, edit, private upload/preview,
  publish/archive, list filtering, conflict/reload and keyboard focus passed.
  Category pagination 20+5, choices load-more, list failure/recovery and revoked
  session redirect passed. Script-like titles stayed literal; no uncaught browser
  exception or overflow. Screenshots at desktop/mobile reviewed. All records,
  credentials and files were explicitly synthetic/in-memory, never production.
- Temporary helpers/artifacts outside repository: bitreca-store-s2-server.mjs,
  bitreca-store-s2-qa.mjs and bitreca-store-s2-qa-20261107 in user temp directory.
  No completed S1/Contact Inbox QA repeated; no physical-device/cross-browser or
  screen-reader certification claimed. No unmeasured effort/time-spent claim.

### Migration / release boundary

Configured bitreca_db verified against production bitreca-db,
**8ff2d1f7-e747-4fe8-a6a3-87898e1ae79a**, by local configuration and read-only
active runtime metadata. Remote ledger showed 0018 latest, no Store tables;
`wrangler d1 migrations list bitreca-db --remote` showed **0019 as sole pending**.
Inspected 0019: only two new tables, five indexes and three Store-only triggers,
no seeds, existing table changes or data deletion.

Owner-authorized `wrangler d1 migrations apply bitreca-db --remote` succeeded
for **0019_add_store_catalogue.sql only**, executing eleven commands including
the migration bookkeeping. No older migration or 0018 replay. No credentials,
configuration, DNS, binding or resource changes. Production records remain for
owner entry; code deployment/Live checks follow after they actually occur.

Release files: migrations/0019_add_store_catalogue.sql; shared/store-catalogue.js;
worker/admin-store.js; worker/index.js (import/protected dispatch only);
src/pages/AdminStore.jsx; src/pages/AdminStore.css; src/App.jsx (protected route);
tests/store-catalogue.test.js; tests/store-catalogue-runtime.test.js; this roadmap.

Rollback: revert only the reviewed code/version if needed; retain new Store
tables, records and uploaded files. No destructive migration reversal or deletion
of existing portfolio/project/auth/enquiry data. Keep S1 unchanged. Production
catalogue writes must remain untested if verifying them would violate the empty
owner-entry requirement; report that limitation rather than create fake listings.
Authenticated Live UI verification may need the owner to log in; do not retrieve
credentials, forge a session or claim an authenticated Live result without it.
Stop after S2; S3 remains unstarted.

## Store S2 — deployment evidence and Live limitations (2026-11-07)

- Release **`b6814c7ebdb650789de5076670362ec48c965c9e`**, title
  `Add private Store catalogue schema and protected admin management`. Exact
  ten-file staged manifest and whitespace passed; ordinary push to main succeeded
  from 547ccd0. All earlier release/planning evidence retained.
- [Cloudflare build](https://dash.cloudflare.com/4ec868eac2a3b9127531ad39d2501f15/workers/services/view/bitreca-website/production/builds/907a3812-ed1a-497f-980c-42e5012af8ac)
  completed successfully. Active version
  **`1edd7458-527a-4e32-8f48-1c19d69230c2`** served 100% at
  `2026-11-07T10:31:18.991619Z`.
- Post-migration read-only ledger: 0019 applied at **2026-11-07 10:25:19 UTC**.
  Schema inventory verified both Store tables, five explicit indexes and three
  lifecycle triggers. Post-migration and post-deployment counts both confirmed
  **0 categories / 0 products**; query metadata reported zero writes.
- Live /admin/store document returned HTTP 200 with expected index-DFVrRiCS.js;
  Chrome direct anonymous navigation redirected to /admin/login and showed no
  private Store UI. No uncaught page exceptions in this protection check.
- Anonymous GET category/product collections, product detail and private Store
  image returned **401**. Public /api/store/categories, /api/store/products,
  /api/products and legacy /api/media/store-catalogue/... returned **404**.
  No production POST/PUT/upload or synthetic listing was created for these checks.
- Read-only runtime metadata confirmed the existing D1 binding and Contact
  settings remain present, inbox enabled. No changes to wrangler/configuration,
  secrets, DNS, bindings, auth logic, portfolio/deletion workflows, S1 or other
  completed pages. No completed S1/Contact Inbox QA rerun.
- **Authenticated Live interface confirmation pending:** owner was asked to log
  in normally and confirm empty Categories/Products lists and New editors, without
  saving or uploading. Agent has no owner session and did not retrieve credentials
  or manufacture one. Local authenticated UI/API checks passed; this does not
  claim an authenticated production list/detail render.
- **Live write workflow deliberately unverified:** create/edit, private R2 upload,
  publish/unpublish/archive and conflict handling passed locally, including real
  isolated workerd D1/R2, but not against production. The latest instruction to
  leave production empty supersedes the planning-stage draft Live-write test.
  Owner enters real approved records later under an appropriate authorization;
  never create fake records just to claim a full Live write pass.
- No unresolved business decision blocked empty private management. No actual
  supplier, currency, price, stock, delivery or payment choice was invented.
  Published admin records remain inaccessible publicly during S2; S1's static
  category directory does not change when admin records are published. S3 is not
  started and requires separate authorization/content inputs.
- Final roadmap-only update committed/pushed as authorized; previous pending
  release wording is historical. Live protection report/helper outside repo:
  bitreca-store-s2-live.mjs and bitreca-store-s2-live-20261107. Temporary local
  server stopped after QA. No total task-time claim. Stop after S2.

## Store S2 — owner-confirmed authenticated Live interface (2026-11-07)

Owner confirmed after normal login at /admin/store:

- Categories and Products both show empty lists.
- New category and New product editors open successfully.
- No record was saved and no image was uploaded.

**S2 is deployed with its authenticated Live interface verified.** This owner
confirmation supersedes the earlier pending-authenticated-interface statements,
which remain intact as historical release evidence. Release SHA remains
**b6814c7ebdb650789de5076670362ec48c965c9e**; migration 0019 and the verified
anonymous/API protections are unchanged. The preceding roadmap evidence commit
408bfcb0c8a1c2a32720c642341c6f827b51d80f was pushed and its Cloudflare build
completed successfully.

**Production write/upload workflows remain explicitly unverified:** category/
product create/edit, image upload, publish/unpublish/archive and conflict handling
were tested only in isolated local SQLite/workerd/R2/browser fixtures. Production
catalogue remains empty for owner entry. This confirmation adds no Live write
claim and required no repeated checks, records, uploads or production setting
changes. Owner authorized this final roadmap-only commit/push. All previous
deployment/planning evidence is retained. Stop after S2; S3 remains unstarted.

## Store S3 — implementation and local verification (2026-11-07)

Owner authorized public enquiry-only catalogue/details, scoped release and Live
empty-state/access checks, explicitly requiring no production records/uploads or
enquiries. This supersedes the planning-stage populated Live item criterion:
populated verification uses isolated fixtures, not invented Live merchandise.
S2 production writes/uploads remain explicitly unverified.

### Public visibility boundary

- Reuses 0019/existing D1/R2. No migration, configuration, secret or resource
  changes. New GET /api/store/categories and /api/store/products provide bounded
  keyset pages (20 categories / 12 products), with validated category/cursor filters.
  Direct detail GET /api/store/products/:slug joins product/category publication
  state. Both must be published; drafts/archives/private categories are omitted
  from lists and return generic 404 for direct detail/media/filter access.
- Explicit product field allowlist: slug, title, sku, description, category_slug,
  category_title, image_url, availability, availability_checked_at, price_minor,
  currency, price_note; detail additionally specifications. Categories expose
  only slug/title/description. Lists have nextCursor and optional selected public
  category metadata. No SELECT * or database-row spread in public serialization.
  Supplier/source references, internal notes, raw image keys, creation hashes,
  IDs, admin versions/status fields/timestamps are not returned.
- New GET/HEAD /api/store/products/:slug/image checks eligible publication on
  every request before reading that product's current Store image from R2. No
  arbitrary key/media listing; detached/missing/private images return 404.
  JSON/images use no-store and nosniff; image MIME is restricted to the validated
  Store image-key extension. No immutable caching or conditional 304 bypass.
  Existing protected media/admin handlers and legacy project media remain unchanged.
- SQL values bound; fixed query columns, strict methods/parameters/cursors and
  generic safe failures. All public catalogue endpoints are read-only.

### UI and enquiry integration

- /store now browses owner-published categories/products with filter and product/
  category pagination. /store/:slug provides detail, plain specifications, safe
  responsive image/fallback, category/back links and price/availability context.
  Loading, independent category/product retry, empty and not-found states included.
  Invalid HTML/malformed data/private-field payloads are rejected by client guards.
- Prices only from owner-entered minor-unit/currency fields, with owner price/tax
  context on both cards and details. Known currencies use standard Intl minor-unit
  conventions; unrecognized codes fall back to explicit raw minor units, not an
  assumed conversion. Null prices say Price not listed. Unknown availability
  remains unspecified; known availability is labelled owner-marked with its check
  date, never silently upgraded to a current stock or delivery guarantee.
- Product-specific Contact link passes only public slug/title/SKU via router
  state. Minimal Contact initialization prepares editable message/reference and
  Not sure yet service; name/email remain blank. No message is submitted, no
  personal data placed in enquiry URLs, no new Contact API/schema/payload keys.
- AdminStore copy-only notices updated because S2's historical "published stays
  private" description would be false after S3. They now explain eligible public
  publication and private drafts/archives/internal fields. No management workflow
  change or repeat S2 QA. One obsolete S2 test assertion that all public Store
  APIs must be absent was narrowed to retained admin/raw-media protection.
- No checkout, cart, payments, order acceptance, supplier integration or new
  stock/price/delivery promise. Existing general-contact/software links retained.

### Verified local checks / release boundary

- **7 S3-focused tests passed**, including actual bundled workerd/D1/R2: exact
  allowlists; all product/category publication combinations, including deliberately
  inconsistent memory-only fixtures; direct media GET/HEAD; publication withdrawal;
  detachment/missing media; no cache escape; pagination/filter-bound cursors;
  invalid parameters/methods; safe failures; strict client/image/price guards;
  literal text and bounded product-specific enquiry fields. No S1/S2/Contact
  Inbox suite was repeated; fixtures never imported by production code.
- Scoped ESLint passed, including the two necessary Contact/admin copy integration
  files. Required final npm.cmd run build passed for Worker/client; release assets
  index-BQyFDH-T.js and index-CPeeD1S6.css. Whitespace/staged scope checked before push.
- Chrome built-UI checks at **1440/768/390px** against a loopback-only real-handler/
  in-memory SQLite/R2 server: listing/detail screenshots, no overflow, accessible
  focus, category filtering, 12/12/2 pagination and back navigation, portrait/
  missing/broken image behavior, hidden/unknown detail not-found, plain script-like
  content and price/date wording. Empty/loading/error/retry/HTML/malformed JSON,
  independent category retry and category 20-row paging passed.
- Contact CTA prefilled the correct public product reference while leaving name/
  email blank; zero application mutation requests, no saved-success UI and zero
  local enquiry submissions. These are new integration checks, not full Contact QA.
- Temporary artifacts outside repo: bitreca-store-s3-server.mjs,
  bitreca-store-s3-qa.mjs and bitreca-store-s3-qa-20261107. Synthetic images are
  generated local PNGs, not product assets. Local server stopped after QA.
- Pre-release production count-only SELECTs confirmed **0 categories / 0 products**,
  metadata rows_written=0/changed_db=false. No migrations, production records,
  images or enquiries created. Earlier deployment evidence and S2 write/upload
  limitation retained. No time-spent claim or physical-device certification.
- Live empty catalogue verification and release SHA follow after deployment.
  Populated Live catalogue, real product media and product-specific Live enquiry
  remain unavailable/unverified while production is intentionally empty. This is
  not a populated shop and cannot accept orders. Stop after S3; do not begin S4.

## Store S3 — deployed, empty catalogue Verified Live (2026-11-07)

- Release SHA **`2af36af3dcb277536f214443346da11cfbc6a6a8`**, title
  `Add published enquiry-only Store catalogue and product details`. Exact
  fifteen-file staged scope/whitespace passed; normal main push succeeded from
  382e59c. No dependencies, migrations or configuration changes were included.
- [Cloudflare build](https://dash.cloudflare.com/4ec868eac2a3b9127531ad39d2501f15/workers/services/view/bitreca-website/production/builds/c14b1a3d-9ab1-4913-9456-4a09bc54dbef)
  completed successfully. Active version
  **`1fb4be6b-d9c5-4bd9-8b33-7a3acf59887d`** served 100%, deployed
  `2026-11-07T13:54:25.614585Z`.
- Live /store HTTP 200 served expected release assets index-BQyFDH-T.js and
  index-CPeeD1S6.css. Chrome **1440/768/390px** confirmed empty catalogue, no
  product cards or shopping forms, explicit no-checkout/no-orders notice, one H1,
  visible keyboard focus and no horizontal overflow. Live mobile screenshot
  reviewed; no uncaught page exceptions or application mutation requests.
- Both bitreca.com and www.bitreca.com category/product collection APIs returned
  **200**, empty arrays, null nextCursor and Cache-Control:no-store.
- Unknown product detail and media GET/HEAD returned **404**; unknown category
  filter returned **404**. The corresponding product page showed Product not
  available, with no product-specific enquiry action; unknown category UI showed
  its unavailable state. Requesting status=draft returned **400**. Anonymous
  /api/admin/store/products remained **401**; legacy raw Store media remained
  **404**. All checks were GET/HEAD only and used no actual catalogue record.
- Post-deployment D1 count-only SELECTs again confirmed **0 categories / 0
  products**, metadata rows_written=0/changed_db=false. No production uploads,
  records or enquiries were created. Existing D1 binding and Contact runtime
  settings remain present; no Contact Inbox/S1/S2 functional QA repeated.
- **Limitations remain explicit:** populated product/category/media and
  product-specific enquiry behavior passed only with isolated local fixtures,
  not Live. Production is empty by instruction; this is not a populated shop.
  S2 production create/edit/publish/archive and image uploads remain unverified.
  Owner-approved data, price/availability review and operational decisions remain
  necessary before later use; there is no order acceptance or payment flow.
- Final roadmap-only evidence update committed/pushed as authorized; earlier
  pending-release wording is historical. Prior Batch #1/#2, Contact, About, S1/S2
  evidence and write/upload limits preserved. Live helper/report/screenshots:
  bitreca-store-s3-live.mjs and bitreca-store-s3-live-20261107 in user temp directory.
  No migration applied, production setting changed, message submitted or S4 work
  begun. Stop after S3.

## Store S4 — gated requests for manual review (2026-11-07)

Owner authorized this model and scoped migration/release: visitors select products
and quantities and request manual review. Owner confirms availability, final price,
delivery and payment manually. Submission is not an accepted order or payment.
This supersedes the original planning assumption of priced checkout/delivery-fee
totals in S4. No fee, currency, payment method, delivery area or operational policy
is invented; remaining commercial/launch decisions stay with S5.

### Implemented scope and security

- /store/request/review and product selection controls: up to 10 distinct products,
  1–10 units each, max 50 units total. Session storage holds only slugs/quantities;
  no customer contact data. Current published metadata is fetched for review;
  unavailable/withdrawn items must be removed. Customer name/email required,
  note optional, international phone optional with explicit WhatsApp permission.
  Mandatory acknowledgement says manual review is not order acceptance/payment.
- Server payload allows only selected slugs/quantities and bounded contact/ack/
  honeypot/challenge/request-ID fields. Browser prices/totals are rejected. Body
  max 16 KiB/five seconds; server revalidates product/category publication and
  excludes owner-marked unavailable items. Unknown availability requires manual
  confirmation; no stock reservation or catalogue mutation is performed.
- New header plus immutable item snapshots commit in one primary-D1 batch.
  INSERT...SELECT captures current title/SKU/category/listed-price/currency/context/
  availability directly from eligible catalogue rows. Final SQL trigger checks
  every selected line and quantity; missing/changed eligibility aborts the entire
  transaction. No partial requests. Snapshots are reference facts, not a quote;
  there is no financial total, delivery fee, payment method or fulfilment action.
- Unique client request UUID + purpose-separated HMAC protects retries. Exact
  stored receipt replay returns only reference/status and can recover a consumed
  CAPTCHA/lost acknowledgement without another write. Changed payload conflicts.
  Gate/origin/shape/rate checks still apply to replays. Success is only 201/200
  stored_for_review after committed persistence; uncertain outcomes remain errors.
- Turnstile Siteverify uses real server fetch, exact hostname and distinct action
  store_order_request, eight-second timeout, manual redirect policy, success check.
  Reuses existing CONTACT_TURNSTILE_SITE_KEY/SECRET and CONTACT_ALLOWED_ORIGINS.
  Existing CONTACT_RATE_LIMIT_SECRET is reused under separate order-request/IP
  HMAC purposes, never SESSION_SECRET. No new credentials or paid service.
- Separate atomic attempt counters: 200 shared/day, 20/minute, 5/IP/ten minutes,
  fixed UTC windows; bounded expiry cleanup affects only new temporary counters.
  Daily-scoped hashed IP identifiers; no raw IP storage. Limits include failed
  challenge attempts/retries and are not immunity to denial of service.
- Explicit runtime gate **STORE_ORDER_REQUESTS_ENABLED="false"** added to the
  existing wrangler vars; missing/false/anything except exact string true disables
  intake. POST /api/store/order-requests rejects before body reading, DB/counters
  or provider calls when disabled, including direct API attempts. Config GET
  returns enabled=false/siteKey=null. Enabled configuration also requires valid
  origins/keys/schema. Frontend fails closed and hides the customer form when
  disabled/unavailable. Product enquiries remain separate and available.
- Protected /admin/store/requests reuses current auth/origin guards, layout and
  sidebar. Private twenty-row list/filter/pagination, detail/contact/note/snapshots,
  versioned controlled status transitions New/Reviewing/Awaiting customer/Closed/
  Archived. These track review only; no accepted/paid/shipped state. Manual mailto
  and permissioned WhatsApp links send nothing automatically and change no status.
- Safe literal text, no-store private responses, no public request GET/list/detail,
  no raw body/token/SQL/secret logging and no delete/edit-snapshot endpoints. SQL
  guards prevent changes/deletion of submitted customer identity and snapshots;
  any future retention purge requires separately reviewed procedures. Existing
  project/portfolio/auth/contact/catalogue rows and deletion workflows unchanged.
- Shared ContactTurnstile gains optional action prop; default remains
  contact_enquiry. Contact workflow itself is unchanged. Store public/admin routes
  and links are integrated without changing S2/S3 data models or public allowlists.

### Focused verification and migration

- **15 S4 tests passed**, including actual bundled workerd/D1 and a synthetic
  Siteverify service. Covers additive empty schema/preserved sentinel rows; absent/
  false gate before any DB/body/provider work; validation/quantity/price tampering;
  origin/config/Turnstile hostname/action/redirect/exception failures; atomic
  snapshots and rollback on publication/category/availability changes; current
  server price capture; immutable snapshot guards; gate closure during verification;
  canonical/concurrent retries, lost commit acknowledgement recovery, persistent
  purpose-separated rate budgets, private admin access, controlled status/version
  conflicts, manual reply consent and pagination. No S1–S3/Contact suites repeated.
- Scoped lint passed; required final build passed for Worker/client, release
  assets index-Bf0_H2Qb.js and index-BsVmwd5n.css. Parsed config comparison confirms
  ONLY the new false gate variable changes configuration; all existing flags,
  keep_vars, routes, resources, schedules and settings match the baseline.
- Built UI + real handlers/SQLite/auth, memory-only catalogue and provider double:
  Chrome **1440/768/390px** passed selection, quantity/customer validation, visible
  keyboard focus, responsive request/admin layouts, single saved request/two
  snapshots despite duplicate action, no false accepted-order receipt, private
  literal notes, manual reply consent, review transitions and version conflict/
  reload. Screenshots reviewed; no overflow or uncaught exceptions.
- Also passed browser publication-change rollback, HTML/legacy false-response
  rejection, lost acknowledgement retry yielding one request, disabled gate UI and
  direct POST rejection, config/selection retry, admin 20+5 pagination/retry and
  revoked-session redirect. External reply launches were prevented in QA; no
  customer/supplier messages sent. Provider/widget were synthetic ONLY locally;
  this does not claim a real production S4 Turnstile submission.
- Temporary helpers/artifacts outside repo: bitreca-store-s4-server.mjs,
  bitreca-store-s4-qa.mjs, bitreca-store-s4-qa-20261107 in user temp directory.
  Local server stopped after QA. No total task-time or cross-browser certification.
- Verified target: existing bitreca_db -> bitreca-db,
  **8ff2d1f7-e747-4fe8-a6a3-87898e1ae79a**; active runtime identity matches.
  Read-only ledger showed 0019 latest, new request tables absent, 0 categories /
  0 products. Remote pending list showed **0020 as sole pending**.
- Inspected additive 0020: three new tables, four explicit indexes, six triggers
  scoped to new requests/snapshots; no seeds, old-table updates or destructive SQL.
  Authorized remote apply succeeded for **0020_add_store_order_requests.sql only**,
  fourteen commands including ledger bookkeeping. No older migration replay.
  No production catalogue records, order requests, uploads or enquiries created.
- Follow-up remote read-only object/count SELECT did not execute: execution prompt
  returned "rejected by user". It was not retried through another mechanism.
  Migration success above is from the existing apply result, not a claimed fresh
  ledger/count query. No post-migration SQL count/inventory result is claimed.

### S5 decisions and stop boundary

S4 must be reported **Deployed — order intake disabled** after release, not
operationally launched. No authorization to set the flag true in production.
Live enabled submissions, real S4 Turnstile action, request persistence/status
writes and all populated-production behavior remain unverified. S2 production
writes/uploads stay explicitly unverified. No production data will be fabricated
to remove those limitations. Rollback: keep intake false, restore reviewed code
if needed, retain all tables/records; never drop history or reverse old migrations.

Before S5, owner must decide/approve: real catalogue and supplier/availability
review; who monitors requests and replies; manual final-price/currency/tax and
acceptance process; fulfilment/delivery areas, fees, timing and exceptions;
available payment/reconciliation method (none assumed); cancellation/returns/
warranty wording; privacy/retention and separately reviewed purge procedure;
technical quantity/rate thresholds and monitoring. Do not capture payment details
or promise delivery before these are agreed. Manual-review intake does not itself
settle any commercial term or enable automated acceptance, charging or suppliers.
Only after separate S5 approval: reviewed launch setting, actual real Turnstile
action test and one owner-authorized controlled Live request/operational check.

Code deployment/Live disabled-check SHA/evidence follows after it occurs. Preserve
all earlier deployment evidence. Stop after S4; do not configure payments or start S5.

## Store S4 — Deployed — order intake disabled (2026-11-07)

- Release **`02a40f4b3867d5420a94fd2dc01f70e8f3eeae19`**, title
  `Add gated Store requests for manual review and protected admin workflow`.
  Exact twenty-file staged scope/whitespace and prior-evidence preservation
  passed. Ordinary push to main succeeded from f4559ef.
- [Cloudflare build](https://dash.cloudflare.com/4ec868eac2a3b9127531ad39d2501f15/workers/services/view/bitreca-website/production/builds/60d6473c-4297-4b8a-962b-1929402bb3ec)
  completed successfully. Active version
  **`95526876-6e10-471e-b798-609a0163dc6f`** served 100% at
  `2026-11-07T15:59:17.701958Z`.
- Runtime binding metadata verified **STORE_ORDER_REQUESTS_ENABLED=false** as a
  plain-text binding, existing D1 target unchanged, Contact settings present and
  Contact Inbox still enabled. No secret values retrieved; no production gate
  enablement, payment configuration or setting changes beyond the false gate.
- bitreca.com and www.bitreca.com config GET returned **200, enabled=false,
  siteKey=null**. Live /store/request/review at **1440/768/390px** rendered the
  disabled notice and empty selection with **zero customer forms/CAPTCHA iframes**,
  visible keyboard focus, no overflow and expected index-Bf0_H2Qb.js asset.
  Mobile screenshot reviewed. No uncaught page exceptions.
- One deliberately empty Live direct POST `{}` returned **503 intake_disabled**,
  with no saved reference. No name/email/items/token were supplied. This proves
  the server gate rather than testing an enabled request. No accepted write,
  customer message, supplier action, product record, request record or upload.
- Anonymous list/detail GET at /api/admin/store/requests returned **401**; direct
  /admin/store/requests navigation redirected to /admin/login with no private UI.
  Public request collection GET returned **405**, UUID detail GET **404**.
- Owner confirmed after normal login that the **empty request list and detail
  panel load without errors** at /admin/store/requests. Owner explicitly confirmed
  no products/requests/uploads created and intake not enabled. Authenticated Live
  rendering is passed on that evidence; not an agent-created/forged owner session.
- Initial Node Live runner encountered an HTTPS connection timeout before its
  page/API checks. Only unfinished checks were completed through Chrome; no local
  suites, migrations or completed owner rendering check repeated. No application
  fix was needed for the runner's connectivity issue.
- Migration evidence remains the successful owner-authorized Wrangler apply:
  **0020 only**, verified bitreca-db ID above, **14 commands**, additive schema
  with no seeds/old-table changes. The declined follow-up SQL query was not
  retried, and no fresh post-migration ledger/count inventory is claimed. Preflight
  catalogue counts were zero; no production request/data generation was performed.
- **Limits remain explicit:** no enabled production submission, real S4 Turnstile
  action, request/snapshot persistence, review-status mutation or reply dispatch
  verified on Live. S2 production writes/uploads and populated Live catalogue/media
  remain unverified. Only local isolated fixtures exercised those paths. The only
  Live intake POST was the empty denied gate probe. This is not an operational
  order launch; no final price/delivery/payment or acceptance policy was invented.
- Final roadmap-only evidence update committed/pushed as authorized. Previous
  release records and limitations remain intact; earlier pending wording is
  historical. Live runner/report/screenshots outside repo:
  bitreca-store-s4-live.mjs, bitreca-store-s4-live-browser.mjs and
  bitreca-store-s4-live-20261107 in user temp directory. Local QA server stopped.
  S5 decisions remain in the section above. **Stop before S5; do not enable intake.**

## Store demo catalogue — authorized production validation (2026-11-08)

**S5: Demo validation in progress — operational launch blocked by supplier/fulfilment decisions.**
**S4 remains Deployed — order intake disabled.** These demos are visible for
website testing, not available to purchase. This section supersedes only the
earlier empty-production/create-edit-upload/publication/populated-catalogue
limitations for the workflows actually checked below. All preceding release,
migration, Batch #1/#2, Contact and Store evidence remains intact and historical.

### Authorized records and identifiers for later archiving

The owner explicitly authorized these three demo products and original DEMO
placeholder images. Existing supported fields store prices as integer USD cents;
no schema, Worker, authentication, binding, secret or deployment-setting changes.

| Product / public detail | Category | Product UUID | SKU | Illustrative price / stored minor units | Final status / version |
| --- | --- | --- | --- | --- | --- |
| [DEMO — Laptop Stand](https://bitreca.com/store/demo-laptop-stand) | Accessories | `352acb68-426f-40d6-b07e-9072e554f3e7` | `BITRECA-DEMO-LAPTOP-STAND` | USD 15 / `1500` | published / 2 |
| [DEMO — Wireless Mouse](https://bitreca.com/store/demo-wireless-mouse) | Accessories | `30d6f5ba-17e6-449f-85fe-886eebcc7a2d` | `BITRECA-DEMO-WIRELESS-MOUSE` | USD 12 / `1200` | published / 2 |
| [DEMO — Desk Lamp](https://bitreca.com/store/demo-desk-lamp) | Home & Desk | `f5b991e6-fbe4-4a83-9113-fb12328abd36` | `BITRECA-DEMO-DESK-LAMP` | USD 20 / `2000` | published / 4 |

- Created [Accessories](https://bitreca.com/store?category=accessories), category
  UUID `5b3d2e37-3f3a-4fdc-8614-41e5cc064d45`, initially draft then published,
  final version 2. Its description includes the exact demo disclaimer below.
- Reused existing published [Home & Desk](https://bitreca.com/store?category=home-desk),
  UUID `7899e64b-7aa8-45f9-a978-570ce6d276f3`, version 1, without editing it.
  Existing Computer Accessories category and unrelated draft Laptop Stand were
  preserved. Existing-record IDs, statuses, versions and other list fields matched
  the preflight inventory after publication; no duplicate demo records were made.
- All three product descriptions are exactly:
  **"Demo item for website testing only. Not available for purchase. Price is illustrative."**
  Price notes independently explain illustrative pricing, not an offer for sale
  or tax/payment/delivery terms. Specifications assert no actual capabilities.
  Availability stays `unknown`, checked date null, supplier reference blank;
  private notes identify the authorized demo purpose. No inventory was invented.
- Original geometric SVG drawings were rendered to 1120×840 PNG placeholders,
  all under 71 KB, visibly marked **DEMO**, **NOT AVAILABLE FOR PURCHASE** and
  **Illustrative price only**. Uploaded through the authenticated Store image
  input, using the existing private media API/R2 path; no external imagery used.
  Product-to-image keys, in the table's order:
  `store-catalogue/c4929e09-90e3-40c7-9672-ac7e1d4ec8bb.png`,
  `store-catalogue/d2df7b69-9dd5-4a3d-91e1-8e13f79b5a27.png`,
  `store-catalogue/6287889b-b3d9-40a3-b26e-0baae6f775ac.png`.
  Retain these identifiers for separately authorized unpublish/archive cleanup;
  do not archive the reused category or unrelated records indiscriminately.

### Production workflows now verified

- Owner signed in normally in a dedicated Chrome session. Automation used the
  existing authenticated admin editors at `/admin/store` to create drafts,
  select categories, enter facts/prices, upload images, save and publish. No
  direct database mutation, fabricated session or credential extraction.
- Successful category create, category description edit, product creates,
  product status edits, image uploads/private previews, and publication were
  confirmed by successful saved records and incremented versions. Exactly one
  new category and three products were created, alongside existing owner data.
- The Desk Lamp was observed at published version 2 after its initial confirmed
  draft/version-1 save and before privacy QA. The cause was not attributed.
  Only that demo was returned to draft (version 3); all its other fields were
  checked unchanged. Draft privacy then passed before final publication/version 4.
  This is not evidence of a draft exposure defect: its observed status was published.
- In a fresh anonymous browser context, admin catalogue/media reads returned
  **401**. While all demos were confirmed drafts, the public list omitted all
  three; each direct detail and image API returned **404**, and each public detail
  UI rendered **Product not available**. Generic `/api/media/store-catalogue/...`
  paths returned **404**. Draft Accessories was absent from public categories,
  and filtering it returned **404**. The unrelated existing draft stayed private.
- After publication, anonymous product details/images returned **200**, with
  exact public-field allowlist and no supplier/internal fields. All three public
  PNG SHA-256 digests matched the original uploaded files. Accessories returned
  exactly two demos; Home & Desk exactly one. Private media remained **401** and
  generic media paths **404**, even for published demos.
- Live Chrome checks at **1440, 768 and 390 CSS pixels** verified the populated
  `/store`, both demo-category views and all three direct product pages: correct
  titles, exact disclaimers, illustrative USD prices, loaded images/DEMO alt
  text, visible keyboard focus and no horizontal overflow. Desktop/mobile
  catalogue and tablet/mobile detail screenshots visually reviewed.
- Each of the three product Contact CTAs was activated with **Enter at each
  viewport**. `/contact` opened with the correct title, SKU, canonical product
  URL and **Store enquiry — not an order** message; name/email stayed empty.
  No enquiry was submitted. Contact's existing QA was not repeated.
- All demo detail quantity/add-to-review controls were disabled. Server config
  GET remained **enabled=false, siteKey=null** before and after validation.
  Anonymous UI checks recorded **zero application mutation attempts** and no
  uncaught browser exceptions. No enquiries, order requests, payments, supplier
  contacts, new secrets or intake-setting changes.
- No application defect was found; no code fix, migration, new build or repeat
  of historical/local suites was needed. Only this roadmap changes in Git.
  Temporary scripts, originals, manifests and reports/screenshots are outside
  the repository under `bitreca-store-demo-20261108` in the user's temp directory.
  Local automation connection/guard setup failures occurred before the relevant
  mutation or privacy assertions; they did not justify application changes.

### Remaining limits and launch gate

Catalogue **create/edit/upload/publish and populated demo browsing now pass on
Live** within the checks above. Arbitrary later data edits, archiving, concurrent
owner-edit conflicts, upload-failure recovery and real merchandise/supplier
accuracy were not all exercised on production; earlier isolated-test evidence
remains relevant but is not a new Live claim. No enabled request intake, real S4
Turnstile submission, request/snapshot/status write or manual-reply workflow was
tested, and no test enquiry/order request was created. Keep
`STORE_ORDER_REQUESTS_ENABLED=false`; do not configure payments or accept orders.

Operational launch remains blocked on real supplier/catalogue ownership and
availability review, fulfilment/delivery areas and fees, manual final pricing/
currency/tax/acceptance, payment/reconciliation, cancellation/returns/warranty,
privacy/retention, monitoring and explicit launch authorization. Demo USD prices
do not decide the real Store's commercial currency or policies. These are the
previously recorded S5 decisions, not requirements silently satisfied by demos.
Stop after this authorized demo validation; no further S5 implementation/launch.

## Store request intake activation — owner authorized (2026-11-08)

**Request workflow Verified Live — operational fulfilment remains blocked.** The owner
explicitly authorized enabling the existing order-request workflow, focused fixes,
Git release and one real Turnstile test request, followed by authenticated Admin
Requests and status-management verification. This supersedes prior instructions
to keep intake disabled for this task only; all historical evidence is retained.
Receiving a request remains separate from accepted orders, payment and fulfilment.

- Production runtime preflight confirmed the existing Turnstile site key/secret,
  allowed-origins and rate-limit-secret bindings and unchanged `bitreca_db` target
  `bitreca-db / 8ff2d1f7-e747-4fe8-a6a3-87898e1ae79a`. No secret values exposed,
  credentials changed, new paid service or schema/migration required. Before this
  release, runtime intake gate is explicitly false.
- Scoped release changes only `STORE_ORDER_REQUESTS_ENABLED` from `"false"` to
  `"true"` in `wrangler.jsonc`, with existing `keep_vars: true`, and removes one
  stale Admin Requests empty-list assertion that production intake is always
  disabled. The empty state continues to explain manual review, not acceptance.
- Existing public/authenticated APIs, quantity/body/rate limits, server-side
  Turnstile hostname/action validation, atomic snapshots and idempotency are
  unchanged. Reuse the completed 15 S4 tests and responsive/keyboard/local-state
  evidence; do not repeat broad page or Contact Inbox QA.
- Demo products, exact disclaimers, USD illustrative prices, images and
  `availability=unknown` remain unchanged. Unknown availability is eligible under
  the existing server rule `availability <> 'unavailable'`; it does not assert
  stock. Owner-marked unavailable or unpublished products/categories cannot be
  requested. No stock adjustment/reservation, delivery/tax/payment terms or
  automatic customer/supplier messages are introduced.
- Focused parsed-config comparison passed: only the gate changes false -> true;
  all other configuration, `keep_vars`, resources, routes and protected flags are
  identical to baseline. Exact admin-page comparison confirmed only the empty-list
  sentence changes. Scoped AdminStoreRequests ESLint, `git diff --check` and
  `npm.cmd run build` passed; client assets index-CMJfDvfs.js/index-BsVmwd5n.css.
  Runtime pre-deployment binding metadata fingerprint saved outside the repository
  for post-deployment comparison, without storing secret values. No historical
  suites or completed responsive checks repeated.
- Activation release **`3e1fe506f651c72fbc996654ce460b6e17f38bc7`**, title
  `Activate manual-review Store request intake`, exactly three reviewed files.
  Ordinary push from 004af09 to main succeeded. [Cloudflare build](https://dash.cloudflare.com/4ec868eac2a3b9127531ad39d2501f15/workers/services/view/bitreca-website/production/builds/44b0b030-42f3-435b-acad-bb07d59c08d3)
  completed successfully; at activation verification version
  **`abf2c694-527f-4806-80b7-42c48c7f375c`** served 100%, deployed at
  `2026-11-08T08:42:16.264196Z` (10:42:16 Asia/Beirut).
- Post-deployment production runtime metadata confirms the gate is **true**.
  Every other binding's metadata matches the pre-deployment snapshot exactly;
  D1/R2/authentication/Contact/protected flags remain unchanged. No new secret,
  paid service, migration or production product edit.
- Live config GET on **bitreca.com and www.bitreca.com** returned **200,
  enabled=true**, a public site key and unchanged quantity limits. These reads
  also exercised the existing schema readiness check; no migration was reapplied.
  Each demo's selection control enabled with quantity 1 while availability stayed
  unknown. Three products were selected using the public UI, and only a clearly
  labelled test note was prefilled; no customer detail or challenge was automated.
- Owner completed the actual public form/security step in the dedicated visible
  Chrome session and confirmed normal admin login. Exactly **one observed POST**
  `/api/store/order-requests` returned **201, stored_for_review** at
  `2026-11-08T08:54:38.396Z` (10:54:38 Asia/Beirut). Public receipt and authenticated
  stored record reference match **`15bdd7e4-1f28-416c-9cb8-807e6fc2c59f`**.
  The real production endpoint retained its required Siteverify success,
  hostname/action checks; no stub, test key, token extraction, security bypass or
  second public submission/replay was used. Saved receipt explicitly says manual
  review, not accepted order, reservation, quote or payment.
- Protected `/admin/store/requests` displayed the matching request, test note,
  recorded acknowledgement and **three immutable item snapshots / three units**:
  Laptop Stand, Wireless Mouse and Desk Lamp, each quantity 1. Snapshot listed
  prices were 1500/1200/2000 USD minor units, with illustrative context and unknown
  availability. Initial status/version **new/1**. Customer details remained in the
  protected workflow; only HTTP/status/UUID and non-personal test facts are recorded
  here or in temporary diagnostic reports. No name/email/phone, request body,
  cookies, credentials or Turnstile token were written to reports/source/output.
- Existing admin UI status controls successfully changed **New (v1) → Reviewing
  (v2) → Awaiting customer (v3) → Reviewing (v4) → Closed (v5) → Archived (v6)**.
  Each change was confirmed by a subsequent authenticated read with the expected
  version, and submitted contact/acknowledgement/note/item snapshots stayed
  identical. Reload and Archived filter found the test. Only this UUID was changed;
  it remains archived as identifiable release evidence, not deleted or active
  customer work. Status changes explicitly confirmed no automatic customer message,
  acceptance, payment or supplier action. Manual reply links were checked without
  opening them or sending anything; WhatsApp visibility matched recorded consent.
- In a separate anonymous context, request list and this actual UUID's private
  detail returned **401**; public request collection GET returned **405** and
  public UUID lookup **404**. No private request listing/details exposed. Runtime
  config still reported enabled=true. All demo descriptions, USD illustrative
  prices and unknown availability were checked unchanged after the request.
- **Verified Live applies only to receiving and managing manual-review requests.**
  No payment method or collection is configured/enabled; no supplier, stock,
  delivery, tax, final-price or commercial policy is invented. Actual manual
  reply dispatch, production idempotent retries/failure recovery/concurrent writes
  and commercial fulfilment were not exercised by this single test; reuse the
  existing isolated test evidence where relevant. Real merchandise, suppliers,
  fulfilment areas/fees, operational policies/retention and payment/reconciliation
  decisions remain with the owner. An enabled request is not an accepted sale.
- Rollback if later intake validation fails: disable the existing gate in runtime
  and reviewed Git configuration so deployment cannot reopen it accidentally;
  preserve all request/demo/history tables and submissions. Do not drop tables,
  reverse migrations, delete test evidence or alter unrelated settings. No other
  S5 operational work is started. Temporary sanitized reports/scripts are outside
  the repository in `bitreca-store-order-activation-20261108` under user temp.

## Admin Store — permanent product deletion (2026-11-08)

**Verified Live — authorized disposable draft and its private image removed.**
Owner explicitly authorized permanent product deletion, not archiving, including
products referenced by historical requests; required migration, Git release and
one dedicated disposable-product production check. Existing products are outside
the Live deletion test. Request intake remains enabled; no payments, new customer
request, unrelated data/settings or PortfolioForest/deletion workflow changes.

### Implementation and safety

- Only saved products gain permanent deletion; category lifecycle stays unchanged.
  A native modal fetches and shows the current saved title/SKU rather than unsaved
  editor text. Owner types the exact SKU and explicitly confirms; Cancel/Escape
  do nothing. The server requires existing admin authentication/origin protection,
  a bounded strict JSON confirmation with title, case-exact SKU and version.
  Stale/mismatched confirmation cannot delete the record. No new authentication.
- `DELETE /api/admin/store/products/:id` physically removes the row from
  `store_products`, including published/draft/archived records. It does not change
  status or hide a retained catalogue row. Minimal deletion/cleanup receipts retain
  ID, confirmed title/SKU/version, assigned image key and cleanup state for reliable
  retries; they are not a parallel catalogue, full archived product or public API.
  Deleted IDs cannot be recreated by stale create retries; new IDs may reuse a
  deleted product's SKU/slug without reattaching historical snapshots.
- Migration **0021_store_product_permanent_deletion.sql** is a controlled,
  transactional Store snapshot-table rebuild, not purely additive DDL: copy all
  rows/columns, replace the table with nullable `product_id REFERENCES
  store_products(id) ON DELETE SET NULL`, restore index/guards. Existing missing
  product links normalize to NULL. No request/header/product/category rows are
  deleted by the migration. On deletion, only the live product reference detaches;
  captured title/SKU/category/quantity/listed price/currency/context/availability/
  timestamps remain immutable. Request deletion/identity protections remain.
- A same-transaction receipt claims the currently assigned image only when no
  other product references it. Database triggers prevent new references to pending
  or removed image keys, including late writers that passed an earlier R2 check.
  Shared images remain; unrelated namespaces are never deleted. Current schema
  has one attached image; pre-existing detached/untracked uploads have no provable
  owner and are preserved, not swept by prefix or guessed ownership.
- R2 deletion follows the committed product deletion, with an absence check before
  recording completion. R2/confirmation failure returns **202, success=false,
  product_deleted=true, cleanup_complete=false** with honest pending text. Pending
  cleanup survives page reload and is listed/paginated privately in Admin Store;
  confirmed retry is idempotent. Uncertain D1 outcomes remain unconfirmed errors.
  No complete-deletion success is displayed while required cleanup is pending.
- Design references: [Cloudflare D1 foreign keys](https://developers.cloudflare.com/d1/sql-api/foreign-keys/)
  and [R2 consistency](https://developers.cloudflare.com/r2/reference/consistency/).
  No bucket listing, broad R2 deletion, new secret/binding, scheduled cleanup or
  change to PortfolioForest storage/authentication/permanent deletion.

### Focused verification and production preflight

- **7 new focused tests passed**: six real-SQLite/API cases and one actual
  workerd/D1/R2 case. Covers populated transactional migration and exact preserved
  request/snapshot data; live-link NULL detachment with another item/product intact;
  physical row/object removal; 401/403, bounded/exact confirmation/stale version;
  shared/unmanaged image safety; immutable historical fields; pending cleanup and
  durable replay; D1 failures/lost acknowledgements; image attachment races,
  concurrent deletion and deleted-ID resurrection guards. All fixtures isolated.
- New dialog and workflow checked in Chrome at **1440/768/390px**: title/SKU
  literal safe text, latest saved values despite unsaved edits, disabled wrong-SKU
  confirmation, cancellation/Escape, visible keyboard focus and no overflow.
  Simulated R2 failure showed honest pending state and succeeded after page reload
  and explicit retry. Shared-image fixture retained the other product and image;
  historical fixture snapshots/requests survived all three viewport checks.
  Desktop/mobile dialog screenshots reviewed. No broad completed QA repeated.
- Scoped ESLint, `npm.cmd run build` and whitespace checks passed before release;
  client assets index-DAWFM_Wk.js/index-C5oUhyKN.css. New source/tests/migration are
  confined to Store deletion and this roadmap. Existing config/intake flag untouched.
- Read-only production target verified from config, Worker runtime binding and D1
  identity: **bitreca-db / 8ff2d1f7-e747-4fe8-a6a3-87898e1ae79a**. Ledger contains
  0001–0020; both API comparison and Wrangler pending list showed **0021 only**.
  Pre-migration counts: **3 categories, 4 products, 1 request, 3 snapshots**.
  Only counts/hashes and non-personal metadata saved in temporary reports; no
  customer bodies or credentials copied to docs/source/output. Binding fingerprint
  records intake=true and all current settings for a later unchanged comparison.
- Authorized Wrangler remote apply succeeded for **0021 only** on verified
  **bitreca-db / 8ff2d1f7-e747-4fe8-a6a3-87898e1ae79a**, **22 commands in 83.43ms**.
  This is the migration execution result, not an estimate of task effort.
- Post-migration read-only verification passed: 0021 is recorded, no pending
  migrations remain, `PRAGMA foreign_key_check` has no violations, and all four
  Store table counts/hashes match the pre-migration snapshot exactly. Production
  binding metadata fingerprint also matches, with request intake still true.
- Code release **`f5965763c14ae8088b17eb129540381b68bfff81`**, title
  `Add confirmed permanent Store product deletion with safe media cleanup`, exactly
  nine scoped source/style/component/migration/test/roadmap files. Normal push
  from b0773aa to main succeeded. [Cloudflare build](https://dash.cloudflare.com/4ec868eac2a3b9127531ad39d2501f15/workers/services/view/bitreca-website/production/builds/4a9670b9-a7e5-4a63-8c9c-dc3f028bad87)
  succeeded. Verified release version **`49b2f4ef-986f-47a4-b3cf-b458db01e264`**
  served 100%, deployed `2026-11-08T10:44:24.282237Z`.
- Owner logged in normally in a dedicated Chrome session; no credential/session
  extraction or forged login. The browser connection closed before the first
  automation attempt could create/upload/delete anything; reopening the same
  profile retained a valid normal session. This was an automation interruption,
  not a Store defect, and did not justify additional products or code changes.
- Exactly **one disposable draft** created through the authenticated admin editor,
  using existing Accessories category. It was never published or requested:
  title **DISPOSABLE — Deletion validation only**;
  SKU **`DELETE-DISPOSABLE-20261108`**;
  slug **`disposable-deletion-validation-20261108`**;
  product UUID **`8aae0dbc-816f-4add-95f0-6f4cd37a1903`**, saved version 1.
  Price/currency remained null, availability unknown, supplier reference blank.
  Uploaded a fresh private copy of an original DEMO placeholder under its own key
  **`store-catalogue/10d2940e-4b55-48ae-9a28-16865aae771e.png`**; no existing demo
  asset key was reused. Private image read returned 200 before deletion.
- Live anonymous DELETE with omitted credentials returned **401** and left the
  test intact. The new modal then showed its saved title/SKU; confirmation was
  disabled until the exact SKU was typed. Explicit authenticated confirmation
  displayed **Permanent deletion confirmed**. Test completed at
  `2026-11-08T12:29:02.694Z` (14:29:02 Asia/Beirut). Subsequent authenticated product
  GET **404**, private media GET **404**, public product/image GET **404**. Pending
  cleanup list omitted the test, and request config stayed enabled=true. No second
  product, publication, enquiry, request, stock assertion or payment was created.
- Final read-only production preservation check passed after this deletion:
  **3 categories / 4 original products / 1 request / 3 request items**, each table's
  ordered-content SHA-256 exactly matching pre-migration data. This verifies the
  disposable row is physically absent rather than archived alongside existing
  rows; existing products, descriptions, pricing, availability, request status and
  historical snapshots were not altered. Ledger has 0021 with no pending migration;
  foreign-key check is clean. Binding fingerprints match both this task's baseline
  and the previous activation baseline, with intake=true and other settings intact.
- **Live scope limitation:** referenced/published product deletion, shared-image
  retention, race/lost-ack and cleanup-failure recovery passed isolated SQLite and
  actual workerd/D1/R2 tests as applicable; those failure/reference scenarios were
  not manufactured in production. The single Live target was an unreferenced
  draft. No existing product or real historical request was used as a destructive
  fixture. Earlier request/Contact/page QA was reused, not repeated. Minimal
  cleanup receipts are retained; older untracked uploads cannot be inferred to
  belong to this product and are deliberately left intact.
- Final roadmap evidence is committed/pushed separately after the release. All
  preceding Batch #1/#2, Contact, About, Store and request-intake evidence remains
  intact. Temporary reports/scripts/screenshots are outside the repository under
  `bitreca-store-delete-20261108` in user temp. No total task-time claim is made.
- Rollback: retain the migrated schema/history and cleanup receipts; roll code
  back if needed without reversing table copies or restoring deleted products.
  Old request/catalogue code remains compatible with the nullable live link.
  Preserve intake=true and all other settings. Pending cleanup requires a reviewed
  forward retry/fix; do not claim it complete or use a destructive bucket sweep.

## Contact Inbox — existing activation and one requested recheck (2026-11-08)

**Already Verified Live; no reimplementation or reactivation needed.** The current
repository baseline is **417b4efc1d535989167f7ff84e04b5c64b2a06a6**. Existing Contact
implementation **3e05fdb**, fix **1259994fff6bb04ce2e8b86c4e4bf795ad736daf**, owner
confirmed reference **f22e5c3e-641c-4514-b102-e000d886e03a**, completed 17 focused
tests and previous browser/build evidence were reused. No broad QA was repeated.

- Current application code still stores validated, real-Turnstile-verified messages
  idempotently in `contact_enquiries`, protected by the existing body/rate/origin
  controls. Private `/admin/enquiries` supports list/filter/detail, versioned
  status updates and manual reply links. No auto outbound messaging is enabled.
- Current reads of **both production origins** returned **200, enabled=true,
  mode=inbox, public site key present**. The application's Contact schema readiness
  path passed. Anonymous Admin Inbox read returned **401**; public enquiry
  collection GET **405**. Runtime metadata matched the previously verified binding
  fingerprint, including Contact settings, protected resources and Store intake=true.
- **Migration status:** 0018 was already applied; latest recorded remote ledger
  includes 0001–0021 with no pending entries. That prior evidence was reused, not
  presented as a newly executed migration audit. No new migration/configuration,
  secret, schema, application code or manual deployment was needed or performed.
- As expressly requested, owner completed **one additional real Contact submission**
  using their own details and the clearly labelled message
  `CONTACT INBOX RECHECK — 2026-11-08 — DISPOSABLE TEST ONLY` (with archive/no-reply
  instructions). Sanitized diagnostics recorded exactly **one POST /api/enquiries**,
  **201, stored**, at `2026-11-08T14:17:16.298Z` (16:17:16 Asia/Beirut), reference
  **`dfa24322-6775-4bf0-a61d-5a925b7806b9`**. Public receipt matches; no resubmission,
  token extraction, test key, forged identity, automatic reply or Store request.
- The automation browser's admin session remained unauthenticated (**401**), so
  automation did not read or update private messages. Owner then explicitly
  confirmed in their usual authenticated Admin Inbox: the correct saved UUID and
  test message were found, status saved as **In Progress → Archived**, and remained
  **Archived after refresh**. Owner confirmed **no other enquiries were modified**.
  This is owner-confirmed private verification, not an agent-authenticated read,
  and no unobserved version numbers or metadata hashes are invented. The disposable
  test remains archived and preserved; no genuine message was deleted or changed.
  No second submission was made to solve browser-session access. No message was
  sent/replied to, or falsely marked Replied. **No Contact activation blocker remains.**
- The genuine outstanding issue found was stale **CONTACT_ENQUIRY_INTEGRATION.md**
  wording still presenting historical setup as current BLOCKED/local-only work.
  Its current-status section now records the deployed feature and clearly labels
  the dated original procedures as historical. No old setup command was rerun.
- Only this roadmap and the integration guide change. Documentation-only checks
  apply; no new build/ESLint or completed test suite is needed for unchanged code.
  Git push uses the existing workflow and may trigger its normal Cloudflare build;
  no separate application deployment or production setting change is required.
- **Completed:** Contact Inbox implementation/activation, earlier verified release
  and this one requested public-to-protected recheck with owner-confirmed status
  persistence. Current Contact workflow is **Complete — Verified Live**. No further
  configuration, migration, application fix or activation is required.
  **Remaining V1 scope:** shared navigation/footer/cross-page review and S5 owner
  supplier/fulfilment/policy/operational handover decisions. Owner has now selected
  Cash on Delivery and Wish Money; no online gateway task is required. Practical
  manual-payment instructions/reconciliation are not implemented by this Contact
  documentation task. Do not start those remaining milestones here.

## Shared navigation and footer — finalization (2026-11-08)

**Complete — Verified Live.** Starting main
**25892bdbd935500722bd2cc04a3e1f90b68d5597** was clean and matched origin/main after
fetch. Existing page/Contact/Store/PortfolioForest QA and deployment evidence were
reused; only shared navigation/footer behavior was tested, not completed features.

### Confirmed gaps and scoped changes

- Eight public root destinations already existed. Preserved their URLs/order and
  branding; changed to NavLink for one accurate active-page/aria-current marker,
  including the existing parent paths for nested content. Menu button now names
  Open/Close, identifies the controlled links and has explicit type/focus styling.
- Baseline Escape left the mobile menu expanded. Baseline Footer navigation after
  scrolling left the new About heading above the viewport (scrollY 2519 and BODY
  focus). Existing page-local navbar exceptions also produced different tablet
  wrapping/heights. Shared Navbar styles now own its root layout consistently:
  80px desktop, 70px menu header at/below 1024px, without editing page styles.
- Menu closes on link selection, Escape (restoring toggle focus), outside pointer
  or keyboard click, focus leaving navigation, Back/history and resizing to desktop.
  Short landscape screens get a bounded scrollable link list; reopening starts
  from the first link. Confirmed/fixed both retained scroll and keyboard Footer
  navigation keeping the overlay open. A final Tab-out check confirmed focus had
  been obscured by the open menu; its targeted fix closes the menu and keeps the
  newly focused main-content link visible.
- Forward route navigation scrolls to the new page and focuses its heading;
  existing fragment destinations scroll/focus the matching section. Ordinary
  Back navigation keeps browser scroll restoration. Existing menu/hamburger and
  link animation styles remain, with reduced-motion support for these components.
- Footer now includes the existing PortfolioForest destination and approved
  `info@bitreca.com` / WhatsApp `+961 70 864 221`, reusing shared contact constants
  and the short manual WhatsApp deep link. No social profile URLs were supplied
  or invented; shared Footer has no social placeholders. No address, company
  achievement, gateway or payment terms were added.
- Four Footer service labels link to existing `/services#websites`, `#applications`,
  `#custom-software`, `#game-development` sections. Footer navigation has a distinct
  landmark, visible keyboard focus, safe external-link attributes and improved
  small-text readability; navy/blue identity and responsive column structure remain.

### Verified locally

- Chrome at **1440 and 390px**: actual keyboard navigation through all eight public
  routes, one correct active marker, closed menu after navigation, heading focus,
  no horizontal overflow; Footer-to-page returns to the top; all four service
  anchors scroll/focus the correct existing card. Official email/WhatsApp hrefs
  and new-tab protection checked without sending/opening external messages.
- Intermediate **1100/1025/1024/960/900/820/769/768px** checked shared geometry in
  About and PortfolioForest contexts: correct breakpoint/header height, no overlap
  or Footer overflow. **844×390 landscape**: all menu destinations reachable by
  scrolling, Escape works, reopening resets scroll. Resize, outside click, Footer
  keyboard navigation, history closure and reduced-motion checks passed.
- On **/portfolioforest** at desktop/mobile, Navbar's next element is still the
  original forest main, whose first gallery contains the original carousel; main
  top meets navbar bottom. **App, Home, all page files and PortfolioForest sources
  are unchanged.** No carousel, hosting, auth, deletion, inbox/request, stock,
  database, Worker, migration, dependency or Cloudflare setting changes.
- The full local route/layout matrix passed, then only the final Tab-out fix and
  following menu navigation were rechecked. Settled desktop/mobile Footer and
  landscape-menu screenshots visually reviewed. Initial harness issues required
  proper native Enter/keypress, animation/document-load waits and a restarted local
  safety timeout; they were not application defects or production operations.
- Final `npm.cmd run build`, scoped Navbar/Footer ESLint and `git diff --check`
  passed. Client assets **index-DDyA2pzj.js / index-CXy13QTv.css**. No unrelated or
  historical suites run. GET-only local synthetic fixtures/read-only browser guard
  recorded zero application mutations and no uncaught browser exceptions. Reports
  and screenshots remain outside repo in `bitreca-nav-final-20261108` under temp.
- Release is exactly **Navbar.jsx, Navbar.css, Footer.jsx, Footer.css and this
  roadmap**. No measured task-duration claim.

### Release and read-only Live evidence

- Commit **`b5fcb5888de60e516e2d332f291522353944de83`**, title
  `Finalize shared navigation, mobile menu and footer links`, reviewed five-file
  scope and whitespace check passed. Ordinary push from 25892bd to main succeeded.
  [Cloudflare build](https://dash.cloudflare.com/4ec868eac2a3b9127531ad39d2501f15/workers/services/view/bitreca-website/production/builds/072cbc32-63de-4656-b6c7-5abdc3d844f6)
  completed successfully. Verified version
  **`28dbaf11-4aed-4630-abe4-457e7558d8ed`** served 100%, deployed at
  `2026-11-08T17:16:19.091596Z` (19:16:19 Asia/Beirut).
- **https://bitreca.com, Chrome 1440/390px:** actual keyboard activation through
  Home, Services, Products, Store, Projects, PortfolioForest, About and Contact.
  Correct destination/heading focus, one active-page marker, closed mobile menu,
  correct 80/70px header and zero horizontal overflow at every destination.
- Footer About link returned to page top; all four service links reached and
  focused their real section cards. Approved email and WhatsApp URLs and safe
  new-tab attributes checked without opening/sending external messages. Footer
  keyboard focus remained visible; desktop/mobile Footer layout had no overflow.
- PortfolioForest main remained the next element after Navbar; its existing first
  gallery still contains the carousel and meets the Navbar bottom. This is a
  placement check, not a repeat of carousel controls, portfolio publishing,
  hosting or permanent-deletion QA. Approved page contents were not redesigned.
- Live browser guard recorded **zero application mutation attempts** and **zero
  uncaught browser exceptions**. No forms submitted, customers contacted, portfolio/
  product/request/message/stock data changed, uploads or admin actions performed.
  GET-only navigation/data reads are the only application operations in this check.
- Post-deployment runtime metadata matched the existing protected-binding
  fingerprint exactly: **Store intake=true**, Contact settings and D1/R2/auth/
  PortfolioForest flags unchanged. No configuration, secret, migration or resource
  operation was part of this release. No online gateway is needed or configured.
- Final roadmap-only evidence update is committed/pushed separately. All earlier
  deployment/Contact/Store/deletion evidence remains intact. Scope is **Complete —
  Verified Live** with no navigation/Footer blocker; stop after this task.

Remaining V1 scope: S5 owner-approved real
catalogue/suppliers, fulfilment/delivery, operational policies and practical manual
COD/Wish Money instructions/reconciliation. No online gateway is required. This
task does not begin operational launch or certify a full site-wide content audit.

## Minimum Store order fulfilment — resumed implementation (2026-11-09)

**Deployed — Live interface/access checks passed; fulfilment writes verified with
isolated fixtures only.** Resumed the exact
uncommitted fulfilment work from main 996372175c4012ab76fd3b304241472fe08790d7;
no restart, discarded work or repeated completed page/workflow QA. Earlier Batch
#1/#2, Contact Inbox, Store/deletion and navigation deployment evidence is preserved.

- Existing `store_order_requests` remains the only request/order record. Existing
  New/Reviewing/Awaiting customer/Closed/Archived review controls and history remain.
  Separate fulfilment stages track New, Supplier availability check, Customer
  confirmed, Product sourcing, Ready for delivery, Out for delivery, Completed,
  Cancelled and Unavailable. Stage filtering reuses existing bounded pagination.
- Optional personal/third-party delivery, company, tracking reference, private notes
  and delivery status are private authenticated metadata. No delivery API, supplier
  ordering, messages, stock reservation/adjustment or automatic operational action.
- COD/Wish Money are manual choices. Receipt defaults to Pending and requires an
  explicit verified-receipt acknowledgement to become Confirmed. Completion,
  delivered/cancelled/unavailable stages never infer or erase payment receipt.
- Captured item quantities/prices/currencies remain immutable. Confirmation requires
  every captured item to have a price in one currency, selected payment method,
  explicit agreed delivery charge (zero means free) in that currency, and an admin
  acknowledgement of actual customer agreement/availability. Supplier price changes
  cannot reprice the request. Confirmed charge/currency/payment method/timestamp are
  locked by API and DB guard; use notes/cancellation rather than silently changing
  customer terms. Unpriced/mixed-currency history remains readable/manageable but
  needs a new correctly priced request before confirmation. No historical rewrite.
- Existing session/origin checks protect the new PATCH fulfilment subroute. Strict
  field allowlist/enums/types, body/text/numeric limits and the shared request
  version prevent injected prices, invalid transitions and concurrent stale edits.
  No new public request reader; public submission, Turnstile and rate limits reused.
  Review and fulfilment saves serialize through the same UI busy state/version.
- Public request copy now explains fixed captured prices and manual COD/Wish Money
  arrangements. Existing selection, validation, submission and receipt logic stays
  unchanged. No new dependency, payment gateway or separate management platform.
- Migration **0022_store_request_fulfilment.sql** only ADDs request columns/defaults,
  one index and two confirmation guards. It changes no old review values, item
  table/trigger, product deletion/auth/Contact/PortfolioForest schema or data. Old
  code remains compatible; rollback code if necessary, retaining added columns,
  agreement/payment metadata and all customer records. No destructive down migration.

Verified local checks (completed earlier tests reused, then focused new validation
regression checked on resume):

- **10 focused tests pass** in the two fulfilment files, including actual
  workerd/D1 migration on populated isolated history, full stage/receipt flow,
  auth/origin, strict limits/types, stale/concurrent updates, honest DB failures,
  immutable item prices and unaffected deletion-reference detachment. No historical
  suites or Contact/PortfolioForest/navigation/product-deletion QA rerun.
- Scoped ESLint passes, including the final delivery-charge label clarification.
  Final production Vite build passes: `index-DLIHi5sc.js` / `index-DeYghGEM.css`.
  `git diff --check` passes. No dependencies added.
- Chrome isolated fixtures at **1440/768/390px**: complete supplier-to-completed
  progression, personal/third-party metadata, COD/Wish Money, missing-confirmation
  errors, locked agreed terms, payment remains pending through completion/delivery,
  explicit receipt acknowledgement, keyboard checkbox/submit and visible focus,
  associated labels, reload persistence, stage filtering and desktop stale-edit
  blocking/reload. No horizontal overflow; form viewport screenshots reviewed.
  Synthetic script-like titles/company data rendered as text. No production writes.
- Read-only preflight verified runtime **bitreca-website -> bitreca-db /
  8ff2d1f7-e747-4fe8-a6a3-87898e1ae79a**, intake=true, keep_vars=true. API ledger and
  Wrangler pending list agree **0022 only** (0001–0021 already applied). Baseline:
  **1 request, 3 item snapshots, 3 categories, 0 products, 3 Contact enquiries**.
  Sanitized hashes/column metadata are outside repo in temporary
  `bitreca-store-fulfilment-20261108`; no customer content/secrets committed or logged.

Production migration evidence:

- Guarded Wrangler execution printed **0022 success**, **15 commands executed** on
  `bitreca-db (8ff2d1f7-e747-4fe8-a6a3-87898e1ae79a)`. The local wrapper timed out
  after the successful result was printed; no blind retry or second apply was run.
  Read-only recheck at **2026-11-09T04:55:14.430Z** confirms 0022 in the ledger,
  zero pending migrations, valid foreign keys and all original row hashes unchanged
  across the five baseline tables. Existing schema outside the added request
  metadata and all runtime binding metadata match the preflight snapshot exactly;
  intake remains **true**. Existing requests have the intended unstarted/pending
  defaults; no customer confirmation, delivery or payment was inferred.
- Final reviewed release manifest is **11 files**: migration, shared fulfilment
  validator, new admin form, existing request admin JSX/CSS/API, two request-copy
  files, two focused tests and this roadmap. No temp helpers, credentials, auth,
  PortfolioForest, deletion implementation, resources or production config changes.

Production release and verification:

- Implementation **`c3f5fa43846f179ce38d58afd6bdaf17169c4a91`**, title
  `Add manual Store fulfilment and protected fixed-price confirmation`, ordinary
  main push succeeded from 9963721. [Cloudflare Git build](https://dash.cloudflare.com/4ec868eac2a3b9127531ad39d2501f15/workers/services/view/bitreca-website/production/builds/324bdcd2-6bfb-4a0c-9e5e-183810ef86ef)
  eventually completed **successfully**. Initially no Git check/build appeared;
  Builds API inspection returned 403 under the existing token. No CI permissions,
  build settings or credentials were changed. During that delay the authorized
  fallback deployed the exact clean commit's prebuilt output through existing
  Wrangler configuration, with `--keep-vars`; generated migration paths were
  verified equivalent and resource/route/cron/variable definitions unchanged.
- Wrangler deployment succeeded. At **2026-11-09T05:12:47.549Z** the authoritative
  runtime read showed version **`f69e4a50-dff0-4367-8dd8-a8e5865c9fe4`** serving
  **100%**, deployed at **2026-11-09T05:11:34.208674Z**. Migration 0022 recorded,
  zero pending migrations, valid foreign keys, every original row hash and all
  protected binding metadata unchanged. Store intake remains **true**; Contact,
  D1/R2, PortfolioForest, authentication and deletion settings are preserved.
- Read-only Live smoke at **2026-11-09T05:12:17.573Z**: `/admin/store/requests`
  and `/store/request/review` return 200 with final `index-DLIHi5sc.js` /
  `index-DeYghGEM.css`; both asset SHA-256 values match the reviewed local build.
  Anonymous request list/detail/fulfilment subroute reads return **401**, private
  no-store responses and no records. Public request config returns enabled=true.
  No Contact/PortfolioForest/navigation/deletion historical QA was repeated.
- Owner confirmed after normal login: **Order fulfilment, Delivery tracking and
  Payment receipt controls load without errors** on the existing request; **no
  changes saved**. This is authenticated Live rendering evidence, not a production
  status/payment/delivery write. No disposable production order, enquiry, upload,
  purchase, supplier message or payment was created. No customer record modified.
- Final Live evidence is a separate roadmap-only commit/push. All earlier evidence
  remains intact. No fulfilment software deployment blocker remains; production
  fulfilment writes, actual sourcing/delivery and money receipt remain explicitly
  unverified. Earlier real Turnstile intake evidence remains valid and was reused.

Remaining operating work: owner merchandise/pricing/availability entry (current
catalogue empty), real manual supplier purchasing, delivery arrangements/charge
agreement, COD/Wish Money receipt/reconciliation and owner-approved operating
policies. This software release does not claim actual goods delivered or money
received. No measured task-duration claim.

## Software-services marketing and SEO readiness (2026-11-09)

**Complete — Verified Live foundations; owner Search Console actions pending.** Main f85221424774aac29da7dd5824a579d70b7d7eec
was clean at start. Completed V1 page/Contact/Store/PortfolioForest/auth/deletion
evidence reused; no broad regression cycle or business-workflow mutation test.

Confirmed audit findings:

- Production Home/Services/PortfolioForest returned the same `bitreca-website`
  title, without descriptions or canonicals/social metadata. `/robots.txt` and
  `/sitemap.xml` returned 200 **HTML SPA shells**, not real indexing files. Repo
  inspection confirmed no implemented metadata/indexing layer. The favicon was
  the unrelated framework icon. Existing heading structure, project-image alt,
  image fallback/aspect-ratio/loading and internal navigation largely sound.
- Home marketed hardware as currently selected/available alongside software and
  lacked a service-card path to PortfolioForest. PortfolioForest explained its
  directory but lacked a clear prospective-client service/Contact next step.
- Production already injects a **Cloudflare analytics beacon**. No new tracker is
  needed or approved. No Google verification meta tag or public apex TXT marker was
  visible; Search Console ownership/account/dashboard status cannot be established
  from these public checks and is not claimed absent or completed.

Implemented scope:

- Shared truthful page metadata for the seven priority software/public routes plus
  the existing Store landing page, canonicals to HTTPS bitreca.com (without query/
  fragment/trailing-slash duplicates), Open Graph/Twitter large-image metadata and
  plain Organization/WebSite/WebPage JSON-LD. No fake location/team/reviews/ratings/
  history/results, offers, customer counts or product prices. Published project
  details read only public slug/title/description from the existing D1 model.
- Existing Worker adds a separate **GET/HEAD-only SEO handler**. To serve metadata
  to non-JavaScript sharing/crawling clients, the existing asset bundle is exposed
  through `ASSETS`, with explicit HTML/indexing `run_worker_first` paths. Existing
  `/api/*` retained, static resources stay asset-served, and no all-route wildcard.
  This is the required SEO asset-routing change; no DNS, secret, resource identity,
  paid service, auth, request gate, payment or production-security flag changes.
- Private HTML/demo/request-review pages get HTTP/meta noindex; their auth/API
  controls remain authoritative. Real XML sitemap lists only canonical public
  landing pages and eligible published projects, with no private API/customer/
  admin/demo/request URL or invented lastmod. robots.txt permits public rendering
  resources and lets private HTML be crawled to see noindex. Published detail
  missing/draft is HTTP404/noindex; metadata DB failure is temporary503/noindex.
- Client navigation updates existing head tags without duplicates or extra project
  fetches. Contact form/customer details never enter metadata. Unknown Store product
  metadata remains generic; no catalogue data/publication/intake change or Store
  commercial activation is part of this SEO milestone.
- Software-first Home H1/copy and targeted service links; PortfolioForest is the
  fourth Home service card (games remain on Services). Store region retained with
  explicit deferred-selling copy; Stockly’s unsupported Home “Available” badge is
  replaced by factual software-product wording. Services clarifies application
  platforms and links portfolio clients to PortfolioForest. Forest gets concise
  value copy and a Contact CTA; gallery/carousel structure/behavior stays intact.
  Homepage Hero CSS, layout, animations and approved page designs are unchanged.
- Original code-rendered navy/blue 1200×630 PNG sharing card plus editable SVG and
  a BITRECA B favicon. Share PNG is not added to the homepage’s visual loading path.
  No dependencies or tracking scripts added. App body remains the existing SPA;
  full SSR/route-splitting is not introduced or claimed necessary without evidence.

Verified local checks:

- **7 focused SEO tests pass**, including actual workerd/D1/HTMLRewriter fixtures:
  unique metadata, safe stored-text/JSON-LD escaping, preserved asset/security
  headers, query-free/www canonicals, published-only metadata/sitemap, private/
  preview noindex, HEAD, unavailable DB responses and unchanged API/mutation gates.
- Scoped ESLint and production Vite build pass. Client assets:
  `index-C3L9ZUPg.js` / `index-DRffJlhj.css`; initial bundle 482.59kB / 138.22kB gzip.
  This is a build size, not a Lighthouse/Core Web Vitals or ranking claim.
- Isolated Chrome at **1440/768/390px** verified software copy, service anchors,
  PortfolioForest keyboard discovery/Contact CTA, correct client metadata, unchanged
  first-gallery placement and no horizontal overflow; screenshots reviewed. Unique
  head tags, one main H1, existing alt attributes and published/404 project metadata
  checked across relevant routes. Hero CTA focus passed. GET-only local guard saw
  zero attempted application writes. A test expected the wrong existing Projects
  H1; only remaining metadata checks were resumed after fixing that expectation,
  without repeating the completed responsive matrix. No application defect there.
- Read-only public audit found the existing analytics beacon and no visible Google
  HTML/TXT verification; values/tokens were not printed, committed or changed.

Owner handover: [SEO_LAUNCH_CHECKLIST.md](SEO_LAUNCH_CHECKLIST.md) contains exact
Search Console/DNS verification, sitemap submission, rendered-page inspection and
existing analytics account steps, linked to primary documentation. These account/
DNS/indexing actions are **pending owner action**, not application deployment blockers.
Recommended content work is factual, consented real project detail and portfolio
briefs; no new thin service pages, invented case studies or redesign is started.

Release and actual Live verification:

- Implementation **`d917e1c0a47c3d4c23f6330dbc8142443cb3c2e6`**, title
  `Add software-services SEO foundations and PortfolioForest discovery`, exactly
  20 reviewed files; ordinary main push from f852214 succeeded. [Cloudflare build](https://dash.cloudflare.com/4ec868eac2a3b9127531ad39d2501f15/workers/services/view/bitreca-website/production/builds/01aedd54-c288-463b-8a41-141484f738b0)
  completed **successfully**. Authoritative runtime read at
  **2026-11-09T16:58:52.215Z** showed version
  **`b709e3ee-5227-4bec-afa8-f54d55550c47`** serving **100%**, deployed at
  `2026-11-09T16:51:10.156167Z`.
- Read-only Live checks at **2026-11-09T16:58:41.960Z** verified all seven priority
  pages plus Store: HTTP200 HTML, exactly one appropriate title/description/canonical,
  factual parseable JSON-LD, Open Graph/Twitter metadata and indexable public-page
  HTTP directives. The pre-existing Cloudflare analytics beacon remains on all.
  WWW/query entry declares the query-free apex canonical.
- `/robots.txt`: **200 text/plain**, correct sitemap reference and rendering rules.
  `/sitemap.xml`: **200 application/xml**, **10 canonical public URLs** (eight
  landing pages and two published project details), **zero private URLs**.
  Existing `/projects/portfolios` has published project metadata and HTTP200;
  deliberately invalid missing-project path returns **404/noindex**. No record
  was created or altered to perform these checks.
- Admin login/enquiries/Store requests, request-review and portfolio demo HTML all
  have HTTP/meta **noindex**. Anonymous enquiry/request admin API reads remain
  **401**. Existing Contact and Store intake configuration endpoints both remain
  **enabled=true**. These are scoped SEO-dispatch/privacy preservation reads, not
  repetitions of completed workflow/Turnstile submissions or status/deletion QA.
- Social card is public **200 image/png, 1200×630**; BITRECA favicon is public200.
  Public metadata/share URLs resolve. No new analytics integration/account/token,
  DNS/security/resource change, migration or customer-data write was performed.
- Live Chrome at **1440/390px** verified software-focused Home and deferred Store
  wording, actual keyboard links **Home → PortfolioForest → Contact**, updated
  canonical/title after navigation, unchanged first-gallery placement and no
  overflow. Read-only guard recorded **zero application mutation attempts** and
  **zero uncaught browser exceptions**. No form/enquiry/order/upload was submitted.
- All **pre-existing runtime binding metadata** matches baseline SHA-256
  `a7289aa35dfa6265b7380890c9574c570aee589cd36cbfdb32f2a29d2736b4fd` exactly.
  Only the required `ASSETS` handle for the existing static bundle is added.
  Store intake=true; existing Contact/D1/R2/auth/PortfolioForest/security flags
  are unchanged. Scope guard confirms Hero CSS and the original Worker API/
  mutation implementation unchanged apart from SEO dispatch. All earlier roadmap
  detail/deployment evidence remains intact.
- Final evidence is committed/pushed separately as a roadmap-only update. No
  application SEO deployment blocker remains. Search Console property ownership,
  sitemap submission, Google-selected canonical/indexing and analytics-dashboard
  event/account access are **not verified or claimed complete**; exact owner steps
  remain in the handover checklist. Deployment alone is not Google indexing.

Software-service marketing foundations are deployed. Physical Store commercial
operations remain deferred; its existing functionality/settings are preserved.
Recommended future content is owner-approved real project detail and portfolio
briefs. No new milestone or account setup is started. No measured task-time claim.

## Boundaries

Task 1 stopped after Services; Task 2 is Contact only. Services remains approved
locally and must not be reworked or retested beyond its links to Contact. No
commit, push or deployment. PortfolioForest, permanent deletion, existing
authentication, production databases and unrelated pages are outside Contact
scope. No Worker/configuration/migration changes are made in Task 2. No unrelated
historical test suites are part of these page milestones. Task 3 adds only the
isolated Contact API dispatch/handler to the Worker; it does not change existing
portfolio/deletion/admin behavior or production settings. Stop after Contact
integration reporting. Task 4 is software Products only; it does not modify
Homepage, Services, Contact, PortfolioForest, deletion, Workers, D1, R2,
Cloudflare configuration or the Dropshipping Store. Stop after Products reporting.
