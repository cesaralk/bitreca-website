# Bitreca V1 roadmap

Updated: 2026-11-04. Batch #1 deployment authorized; push/live status is recorded
in the Batch #1 section below. Earlier task sections are historical local QA records.
Estimates are implementation/review effort, not delivery promises. Later
milestones need inspection and user agreement before work starts.

| Milestone | Status | Local / deployed | Estimated remaining effort |
| --- | --- | --- | --- |
| Homepage Hero typography/mobile CTA changes and testimonial removal | Approved for Batch #1 | Pending Batch #1 push/live verification | No new page work in this batch |
| Services: four categories, process, FAQs, contact CTAs and responsive styles | APPROVED locally; approved for Batch #1 | Pending Batch #1 push/live verification | No new page work in this batch |
| Contact: WhatsApp, mailto and copy fallback; optional email integration | Fallback approved for Batch #1; production email DEFERRED | Pending Batch #1 push/live verification; sending stays disabled | Resend/Turnstile setup and live email test deferred |
| About: factual company introduction | Pending review | Deployment unverified | 30–60 min; needs approved information |
| Software Products: Stockly POS and repeatable product layout | Task 4 complete; approved for Batch #1 | Pending Batch #1 push/live verification | No new page work in this batch |
| Dropshipping Store: content and intended V1 behavior | Pending; outside Task 4 scope | Deployment unverified | Scope/effort to be agreed separately |
| Projects: content and project navigation | Pending review | Deployment unverified | 30–60 min; needs verified project material |
| Shared navigation/footer and cross-page accessibility/responsive review | Pending; existing components reused for Services | Deployment unverified | 45–90 min |
| V1 release Batch #1 | Owner authorized one reviewed commit and main push | Pre-push review complete; final build/push pending | Targeted deployment smoke checks only |

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

## Deploy Batch #1 — pre-push record

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
- Single final `npm.cmd run build`: passed for Worker and client. Whitespace
  check is performed on the exact staged manifest before committing.
- Commit/push: not performed at this snapshot. Cloudflare/live: unverified.

One feature commit is planned. Its actual SHA and post-push/live evidence will
be recorded in this local roadmap after the commit exists. That final record is
kept local unless a separate documentation commit is later requested; the
committed snapshot cannot contain its own final SHA without changing that SHA.

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
