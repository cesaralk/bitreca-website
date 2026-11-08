# Contact Inbox + Admin — production status and integration reference

Updated 2026-11-08. **Contact Inbox is Verified Live.** The dated implementation
and preflight notes below are historical evidence, not outstanding setup steps.

## Current production status

- Existing implementation `3e05fdb` and Siteverify fix
  **`1259994fff6bb04ce2e8b86c4e4bf795ad736daf`** remain in the current deployment.
  Owner-confirmed successful public-to-private inbox reference:
  **`f22e5c3e-641c-4514-b102-e000d886e03a`** (recorded 2026-11-07).
- Migration **0018 is already applied** to production `bitreca-db`
  (`8ff2d1f7-e747-4fe8-a6a3-87898e1ae79a`); the latest recorded ledger also includes
  Store migrations through 0021. **Do not reapply 0018, repeat the old activation
  sequence, reinstall secrets or disable the working inbox.**
- Fresh 2026-11-08 config GETs on bitreca.com and www.bitreca.com returned **200,
  enabled=true, mode=inbox**, with a public site key. The existing code checks both
  Contact tables/required columns before reporting enabled. Anonymous private inbox
  read returned **401**; public collection GET **405**. Existing runtime bindings
  and the enabled Store request gate match the prior verified baseline.
- Real Turnstile, origin checks, strict validation/body limits, rate limits,
  idempotent D1 storage, existing admin authentication and message-management code
  remain unchanged. No automatic email/WhatsApp reply or Resend/paid email setup is
  required. Direct WhatsApp/mailto/copy options remain available. No missing Contact
  configuration, code or migration prerequisite was found.
- The owner's one additional disposable message on 2026-11-08 returned **201,
  stored**, reference **`dfa24322-6775-4bf0-a61d-5a925b7806b9`**. Owner confirmed
  that the exact test was found in their authenticated Admin Inbox, changed to
  In Progress then Archived, and remained Archived after refresh. No other enquiry
  was modified. Private verification is owner-confirmed; the automation browser
  had no authenticated session and is not claimed to have read/updated the inbox.
  The test is retained archived, not deleted. **No activation blocker remains.**
  Reuse this successful result; do not send another test or repeat old setup.

See [BITRECA_V1_ROADMAP.md](BITRECA_V1_ROADMAP.md) for actual release/test evidence.
Do not make a production change solely because a historical section below says
"local", "pending" or "blocked".

## Historical implementation snapshot — 2026-11-05

Updated 2026-11-05. Supersedes the previous Resend delivery plan. Implementation
is local only at production baseline `3ed49f470ae25f4a7a4900a8c5a188299f2473cf`.
No production migration, secret/configuration change, commit, push or deployment
has been performed. **No outbound email/WhatsApp service is used or enabled.**

## Authorized release progress — 2026-11-06

Owner approved activation and the nineteenth file, wrangler.jsonc. Its sole
configuration change is `"keep_vars": true`, verified by parsed comparison
against HEAD after removing that property. Dashboard variables are preserved
during deployment; secrets remain private. All five settings were found on the
production runtime, with inbox false. After reconfirming 0018 was the sole pending
migration, the authorized remote apply succeeded for 0018 only on bitreca-db
(`8ff2d1f7-e747-4fe8-a6a3-87898e1ae79a`). No historical migration was replayed.
Code rollout/enablement/real Turnstile and authenticated inbox verification are
not yet claimed; final SHA/live evidence follows in the roadmap after release.
Earlier gate statements describe the implementation/preflight handoff.

## Behavior and architecture

- Existing Contact layout, official WhatsApp action and `mailto:info@bitreca.com`
  remain. Submit enquiry now means store in Bitreca's private D1 inbox, not send
  email. Copy remains an honest local fallback.
- Public `POST /api/enquiries` accepts name/email/service/message, optional phone
  plus explicit WhatsApp permission, empty honeypot, requestId and Turnstile token.
  Only HTTP 201/200 with `{ status: "stored", reference: "<UUID>" } confirms storage.
  The UI never accepts old Resend `202/accepted` or HTML success responses.
- Existing `bitreca_db` binding stores the new data. One additive migration,
  `0018_add_contact_enquiries.sql`, creates only `contact_enquiries`,
  `contact_enquiry_limits` and their indexes. No existing tables/rows/triggers or
  historical migrations are changed; no parallel database or R2 resource.
- New enquiry states: New, In Progress, Replied, Archived. Created/updated Unix
  timestamps and a monotonically incremented row version support ordering and
  concurrent-edit detection. Unique request_id and payload HMAC prevent retries
  creating duplicate rows or reusing a receipt for different content.
- After D1 returns a confirmed inserted ID, response is 201. Exact request/body
  receipt replay returns 200, with the same reference and no message/status data.
  Concurrent insert conflict also resolves against the unique request record.
  Exact receipt replay can recover after a consumed CAPTCHA or lost acknowledgement;
  it still requires same-origin/configuration, rate checks, valid shape and the
  caller's matching unguessable request ID plus full original normalized payload.
- Different payload for the same requestId returns 409. Input errors return 422;
  invalid JSON/method/origin/size/content type and bot input are rejected. D1 or
  connection failures return unconfirmed/unavailable, never false storage success.
  The client preserves fields/request ID on retry. Reload/edit starts a new ID;
  this is request idempotency, not permanent deduplication by email/content.
- Raw message content stays literal React text. Email links are validated and
  encoded. Phone numbers require an international +country-code format and
  explicit checkbox permission; normalized E.164-style syntax does not prove
  phone/account ownership. No automatic acknowledgement is sent to visitors.

## Security and bounded abuse protection

- Public writes require CONTACT_INBOX_ENABLED=true, exact configured origin,
  migrated schema, D1 availability, a private rate/HMAC key and free Turnstile keys.
  Public config returns only `{ enabled, mode: "inbox", siteKey }`. Missing schema
  or configuration disables the form and preserves direct-contact/copy fallback.
- Turnstile Siteverify requires success, the exact request hostname and action
  `contact_enquiry`. New writes fail closed if verification fails/unavailable.
  Tokens are limited to 2048 characters; upstream timeout is eight seconds.
- Request body is streamed/bounded to 24 KiB with a five-second read deadline.
  Name 1-100, email at most 254 with strict syntax, service from the fixed list,
  message 20-5,000. Reject control/header injection, unknown keys and honeypot input.
- Atomic D1 primary UPSERTs reserve shared **200 attempts/day**, shared
  **20/minute**, then **5/IP per ten minutes**. These count valid-shaped attempts,
  including retries and failed challenge attempts, not only saved enquiries.
  Counter failures reject storage. A shared limit intentionally pauses all
  submissions until reset; this is cost/storage protection, not a promise of
  immunity to denial of service. Review thresholds with the owner before release.
- Rejected global reservations do not create new per-IP rows. Counters expire
  after their fixed window plus sixty seconds; a bounded cleanup deletes at most
  100 expired counter rows per allowed attempt. It never deletes enquiry data.
- No raw IP is stored. Daily-scoped HMAC IP keys use CONTACT_RATE_LIMIT_SECRET;
  payload receipt hashes use a separate purpose string under that secret.
  Do not reuse the admin SESSION_SECRET. Rotate via a reviewed change: prior
  receipt hashes may no longer match after key rotation, while request IDs remain
  unique. Never wipe receipt rows just to bypass a conflict.
- No logs of request bodies, tokens, phone/email, SQL errors or private keys are
  introduced. Responses use private/no-store and nosniff; no permissive CORS.
- D1/Workers use the existing account plan and usage quotas. This adds no paid
  service or subscription; free Turnstile is the only external verification.
  Existing platform quotas can still make the inbox temporarily unavailable.

## Protected owner inbox

- Route `/admin/enquiries` uses existing ProtectedAdminRoute and AdminLayout;
  Dashboard quick action and sidebar link lead to it. No new login/roles/session
  system. Existing admin authentication/configuration/fingerprint/revocation
  checks remain unchanged.
- API dispatch is AFTER existing Worker admin session and write-origin guards.
  Anonymous/forged/expired/revoked sessions cannot list/read/update messages.
  Public GET enquiry collection returns 405; there is no public message reader.
- `GET /api/admin/enquiries?status=all|new|in_progress|replied|archived&cursor=...`
  uses fixed twenty-row keyset pages, sorted by created_at/id, with status filter.
  The list omits message bodies, telephone, receipt request IDs and hashes.
- `GET /api/admin/enquiries/:id` exposes one message only to the authenticated
  owner. `PATCH` accepts exactly status and expected version; stale updates get
  409 and require reloading. All SQL values are bound, filters/cursors validated.
  No message-content edits, exports, bulk actions or delete endpoint added.
- Reply in email app opens encoded mailto for the validated submitted address.
  Reply in WhatsApp appears only for a valid supplied number with stored consent.
  Both require the owner to review/send in the external app. Opening a reply link
  neither sends anything nor marks Replied. Save Replied only after manual reply.
- On a 401 the shared admin helper redirects to login and the inbox unmounts.
  No PII is persisted in frontend localStorage/sessionStorage or URL queries.

## Privacy and retention guidance — owner decision

Messages contain personal information. Limit access to the owner account, keep
that account protected and log out on shared devices. Do not collect passwords,
payment details or other unnecessary sensitive content. Use the Contact notice
and approved company privacy guidance before activation.

Archiving is not deletion. No automatic expiry or purge job is implemented.
Suggested owner procedure: review monthly, retain only while needed for follow-up,
and agree a manual purge interval for completed enquiries (for example ninety
days) before collecting live data. Any future purge must be reviewed, touch only
contact tables, and account for database backups and request-ID retention. The
existing portfolio permanent-deletion workflow is unrelated and must not be used.
No claim of legal compliance or instant erasure from backups is made.

## Historical owner-configuration procedure — already completed for production

Reference for a separately authorized new environment/recovery only. The working
production settings already exist; do not run these steps again for this task.

1. Create/reuse a **Free** Managed Turnstile widget with only `bitreca.com` and
   `www.bitreca.com` allowed. Use a separate widget for any approved test hostname.
   Do not enable arbitrary hostnames or use test keys in production. No DNS
   change or paid Email Sending subscription is needed.
2. Install the paired **CONTACT_TURNSTILE_SECRET** as a Cloudflare Worker secret.
   Generate a separate high-entropy random rate/HMAC secret (at least 32 bytes
   before encoding) in the owner's secret manager, and install it only as
   **CONTACT_RATE_LIMIT_SECRET**. Do not paste values into source, chat, logs,
   build variables or committed files. No secret value is supplied by this guide.
3. Public runtime settings (future authorized configuration):

   | Variable | Required value |
   | --- | --- |
   | CONTACT_TURNSTILE_SITE_KEY | Public key paired with the private widget secret |
   | CONTACT_ALLOWED_ORIGINS | `https://bitreca.com,https://www.bitreca.com` |
   | CONTACT_INBOX_ENABLED | Keep `false` until schema/code/setup verification; then `true` for authorized test/activation |

4. No Resend key/domain flag, email subscription, custom rate binding, new D1/R2
   resource or admin credential change is required. Obsolete CONTACT_EMAIL_*
   settings and RESEND_API_KEY are ignored by the replacement implementation;
   do not enable them. Current wrangler.jsonc remains untouched.

## Historical initial deployment plan — completed, not a new release checklist

The original authorization, migration, release, corrected Siteverify rollout and
successful Live check are recorded in the roadmap. This dated plan does not direct
a second migration, secret installation or activation of current production.

**Gate:** owner reviews code, additive schema, privacy/retention and thresholds;
confirms free Turnstile setup and separate private rate key; then explicitly
approves production migration, one code commit/push and one live enquiry test.
No release action below was performed during implementation.

1. Confirm target repository main/baseline and existing `bitreca_db` maps to the
   intended `bitreca-db` production database. Reconfirm configuration/old source
   preservation and the current recovery/backup procedure. Keep inbox flag false.
   Check migration ledger read-only:
   `npx.cmd wrangler d1 migrations list bitreca-db --remote`.
   Proceed only if previous migrations are already reconciled and **0018 is the
   sole pending migration**. If historical entries are pending or schema/ledger
   disagree, STOP; never replay portfolio/auth/deletion migrations to release this.
2. Apply that one approved additive migration:
   `npx.cmd wrangler d1 migrations apply bitreca-db --remote`.
   Confirm only the two new tables and indexes were added, with no changes to
   existing records. Leave new tables in place on rollback; do not drop live data.
3. With explicit authorization, install the two secrets using interactive prompts
   against the intended account/Worker (never values in command arguments):
   `npx.cmd wrangler secret put CONTACT_TURNSTILE_SECRET --name bitreca-website`
   and `npx.cmd wrangler secret put CONTACT_RATE_LIMIT_SECRET --name bitreca-website`.
   Set the public widget/origin values while CONTACT_INBOX_ENABLED remains false.
   These commands/settings write cloud resources and may create Worker versions;
   they are future owner-authorized actions, not commands to run during review.
4. Stage only this reviewed workflow/migration/docs/tests, preserve the complete
   local Batch #2 evidence in the roadmap, create one commit and ordinary push
   to main. Let existing Cloudflare Builds deploy; no separate Wrangler deploy.
   Confirm check success and the new deployed version before enabling the flag.
5. Verify `/api/contact/config` reports mode=inbox; verify protected inbox access
   and anonymous API denial. Then enable CONTACT_INBOX_ENABLED for the authorized
   test. Config must be enabled with only public site key, no private key output.
6. **One authorized live test:** owner/tester enters a clearly labelled release
   enquiry and owner-controlled email in the public form, completes real
   Turnstile and submits once. Phone is optional; use a real owner-approved number
   and explicit permission only if testing WhatsApp reply availability. Record the
   stored UUID, log into the existing Admin Dashboard, open Enquiries and confirm
   the exact saved message. Verify one row/reference, status changes and manual
   reply href. Do not send a reply automatically or test with fabricated third-
   party addresses. Mark the test Archived after review if authorized.
7. Record commit/deployment/live evidence in the roadmap and stop. If any stage
   fails, disable CONTACT_INBOX_ENABLED to restore WhatsApp/mailto/copy fallback;
   owner can still review saved messages while authenticated. Preserve tables and
   records. Do not roll back by replaying or reversing unrelated migrations.

## Checks completed locally

- 16 focused endpoint/schema/auth/idempotency/abuse/manual-link tests against real
  in-memory SQLite, with the unchanged 0004 auth schema and additive 0018 schema.
- One isolated workerd/Miniflare D1 runtime test (installed toolchain dependency):
  storage, duplicate retry and owner authenticated read/update; no remote binding.
- New-workflow Chrome checks at 1440/768/390 against a loopback-only server serving
  the built app, real Worker handlers/auth and an in-memory synthetic database.
  Only Turnstile verification/widget responses were isolated test doubles.
- Browser public submit -> stored row -> actual session login -> private inbox;
  pagination/filtering, status/version conflict, permission-dependent reply links,
  validation, safe text, lost receipt recovery, rate feedback and 401 redirect.
  No outbound messages, production data, old-page visual suites or live test.
- Build, scoped ESLint and whitespace evidence is recorded in the roadmap.

The original implementation handoff was **BLOCKED** pending owner authorization,
free widget/secrets/settings, migration-ledger check and the real Live test. Those
prerequisites were subsequently completed; **current production is Verified Live**,
as stated above. Security setup was not bypassed.

## Primary references consulted

- [D1 prepared/batched operations and transaction behavior](https://developers.cloudflare.com/d1/worker-api/d1-database/)
- [D1 primary/session read consistency](https://developers.cloudflare.com/d1/best-practices/read-replication/)
- [Turnstile server-side verification](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
- [Turnstile Free plan](https://developers.cloudflare.com/turnstile/plans/)
