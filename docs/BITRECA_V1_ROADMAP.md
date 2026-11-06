# Bitreca V1 roadmap

Updated: 2026-11-05. Task #6 Contact Inbox/Admin is implemented locally; production
activation is BLOCKED pending owner review/setup. Projects Batch #2 remains Live. Batch #1 remains
pushed and verified Live; evidence is recorded
in the Batch #1 section below. Earlier task sections are historical local QA records.
Estimates are implementation/review effort, not delivery promises. Later
milestones need inspection and user agreement before work starts.

| Milestone | Status | Local / deployed | Estimated remaining effort |
| --- | --- | --- | --- |
| Homepage Hero typography/mobile CTA changes and testimonial removal | Batch #1 complete | Verified Live at 8775054 | No new page work in this batch |
| Services: four categories, process, FAQs, contact CTAs and responsive styles | APPROVED; Batch #1 complete | Verified Live at 8775054 | No new page work in this batch |
| Contact: WhatsApp/mailto/copy fallback and private enquiry inbox | Existing fallback Live; Task #6 Inbox/Admin implemented and tested locally | Production unchanged at 3ed49f4; D1 inbox not migrated/deployed | Owner review, free Turnstile/secrets, one additive migration and live test required; no automatic outbound messaging |
| About: factual company introduction | Pending review | Deployment unverified | 30–60 min; needs approved information |
| Software Products: Stockly POS and repeatable product layout | Batch #1 complete | Verified Live at 8775054 | No new page work in this batch |
| Dropshipping Store: content and intended V1 behavior | Pending; outside Task 4 scope | Deployment unverified | Scope/effort to be agreed separately |
| Projects: public listing and slug details | Batch #2 complete; scoped QA reused | Verified Live at 3ed49f4 | No implementation/deployment blocker; no new scope |
| Shared navigation/footer and cross-page accessibility/responsive review | Pending; existing components reused for Services | Deployment unverified | 45–90 min |
| V1 release Batch #1 | Complete: one commit pushed; Cloudflare build successful | Verified Live at 8775054 | Email activation deferred; Projects/Store not started |

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
