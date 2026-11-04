# Contact enquiry integration and owner activation guide

Updated 2026-11-04. Task 3 code is implemented locally, **disabled by default**.
No secret was installed, external account verified, email sent, WhatsApp message
sent, DNS changed or Worker deployed during implementation.

## Official destinations and behavior

- Recipient is fixed in code at `info@bitreca.com`; requests cannot choose it.
- Sender is fixed at `Bitreca <info@bitreca.com>`. This requires verified
  **bitreca.com** sending authorization in Resend. The code does not assume that
  the domain is currently verified. A deployment flag is an owner attestation,
  not a domain verification API result; Resend must still accept each email.
- Reply-To is the visitor's validated email. Names/messages are plain-text body
  data, never interpolated into subject, sender or recipient headers. No HTML,
  attachments, CC/BCC or automatic email to unverified visitors is generated.
- WhatsApp is `https://wa.me/96170864221`, phone `+96170864221`. The Contact link
  adds an encoded, short project introduction with service interest if selected.
  The visitor reviews and sends in WhatsApp. No private name/email/full message
  is automatically put in the URL. They can paste the copied brief themselves.
- Direct email opens the visitor's email application at `info@bitreca.com`.
  Opening either external action does not imply a message was sent or received.

## Implemented API and controls

`GET /api/contact/config` returns only `{ enabled, siteKey }` with no-store.
It does not reveal secrets. Sending is enabled only when all required flags,
keys, allowed origin and two rate-limit bindings are present; otherwise the
UI shows unavailable and retains WhatsApp, direct email and Copy project brief.

`POST /api/enquiries` accepts JSON fields `name`, `email`, `service`, `message`,
`turnstileToken`, `requestId`. Same-origin Origin is required; allowed deployment
origins must be explicitly configured. There is no permissive CORS response.

- Limits: 24 KiB streamed JSON body, 5-second body-read timeout; name 1-100,
  email at most 254 (local part at most 64), message 20-5,000 characters. Service
  must match the five UI options. Reject extra keys, single-line control
  characters, unsafe email syntax and inappropriate message control characters.
- Dedicated per-IP and shared contact traffic limiters run before external
  requests. Missing/failed limiters or missing CF-Connecting-IP fail closed.
- Server verifies Turnstile with Cloudflare Siteverify; requires success, exact
  request hostname and action `contact_enquiry`. Expired/reused/invalid tokens
  cannot authorize delivery. Each retry requires a fresh challenge token.
- Upstream calls have 8-second abort signals and reject redirects. No raw form
  bodies, secrets or upstream errors are logged by the Contact handler.
- Resend receives a stable Idempotency-Key made from the enquiry UUID and a
  SHA-256 digest of the exact email payload. Same-page retries preserve the UUID
  until fields change. Provider idempotency lasts 24 hours; reload/new edits
  start a new enquiry. This is not permanent, cross-device deduplication.
- Only a successful provider response containing a valid email ID produces
  HTTP 202 `{ status: 'accepted', reference }`. Rejections give 502; uncertain
  outcomes (timeouts, network errors, malformed success or upstream 5xx) give
  504 `unconfirmed`. Validation gives 422; challenge failure 400; rate limit
  429 with Retry-After 60; unavailable configuration/services 503.
- Frontend accepts only the explicit 202/accepted/valid-reference contract.
  It says **accepted for email delivery**, explicitly not confirmed inbox
  receipt. HTML SPA responses and arbitrary success JSON never show acceptance.
  Entries remain available on errors. A request that times out may still have
  been accepted: don't claim it was definitely unsent.
- No D1, R2, session, admin or deletion code changes. Owner reviews the email in
  the official inbox, not in a new database/admin UI.

## Owner setup — not executed by this task

### 1. Confirm the receiving inbox

Confirm `info@bitreca.com` exists, receives external email and is monitored by
an identified owner. Sending authorization does not create a receiving inbox.
Confirm that direct email and WhatsApp reach the intended person/account.

### 2. Resend account and DNS verification

1. In Resend, add `bitreca.com` under Domains, select the intended region and
   enable sending. Use the exact SPF, DKIM and any sending return-path records
   shown for this domain in the Resend dashboard; do not invent record values.
2. DNS edits require separate owner authorization. Review existing records first.
   Do not replace the root mailbox MX records or enable Resend receiving just to
   send enquiries. Add only the sending records required by Resend, merging SPF
   deliberately if necessary rather than creating conflicting SPF policies.
3. Ask Resend to verify the records and wait for the dashboard to show the
   domain as verified for sending. Verify that `info@bitreca.com` is authorized
   as From. A local test/mock or enabled flag is not evidence of verification.
4. Create a Resend sending-only API key restricted to this domain where supported.
   Keep the key private and install it only as the Worker secret RESEND_API_KEY.
5. Set appropriate account usage monitoring and delivery/bounce notifications.
   Owner inbox receipt must be tested separately from provider acceptance.

### 3. Cloudflare Turnstile

1. Create a Managed Turnstile widget in the intended Cloudflare account.
2. Allow only the intended hostnames (production `bitreca.com` and
   `www.bitreca.com`; use a separate widget for approved staging hosts).
   Do not enable Any Hostname. The application sends action `contact_enquiry`.
3. Put the public site key into CONTACT_TURNSTILE_SITE_KEY. The site key is
   deliberately public; its paired secret belongs only in the Worker secret
   CONTACT_TURNSTILE_SECRET. Never use test keys for production.
4. The UI loads Cloudflare's explicit-render script only when sending is enabled.
   If a CSP is introduced later, allow the documented Turnstile script/frame
   sources. The compact widget fits the existing mobile form without redesign.
5. Test challenge success, expiry, blocking and server-side token validation on
   the actual approved hostname. Synthetic QA does not verify the real widget.

### 4. Dedicated rate-limit bindings and activation flags

No changes to `wrangler.jsonc` were made. Before a separately authorized staging
or production activation, provision these **contact-only** bindings on that
environment. Select unique positive-integer namespace IDs in the owner account;
do not reuse admin/portfolio namespaces or copy example IDs blindly:

```jsonc
"ratelimits": [
  {
    "name": "CONTACT_RATE_LIMITER",
    "namespace_id": "<UNUSED_POSITIVE_INTEGER_A>",
    "simple": { "limit": 3, "period": 60 }
  },
  {
    "name": "CONTACT_GLOBAL_RATE_LIMITER",
    "namespace_id": "<UNUSED_POSITIVE_INTEGER_B>",
    "simple": { "limit": 30, "period": 60 }
  }
]
```

The proposed thresholds are 3 attempts per IP/minute and 30 shared attempts per
minute **per Cloudflare location**, with approximate counters. Despite its
binding name, CONTACT_GLOBAL_RATE_LIMITER is not an exact worldwide spending
cap. Use Resend usage alerts/limits as appropriate. A strict worldwide budget
would need a separately scoped coordinated limiter; it is not implemented here.

Configure non-secret Worker variables on the selected environment:

| Name | Value / prerequisite |
| --- | --- |
| CONTACT_ALLOWED_ORIGINS | `https://bitreca.com,https://www.bitreca.com` for production; exact staging origin(s) for staging |
| CONTACT_TURNSTILE_SITE_KEY | Public key for the correct hostname/widget |
| CONTACT_RESEND_DOMAIN_VERIFIED | `true` only after owner verifies sending authorization in Resend |
| CONTACT_EMAIL_ENABLED | Start `false`; enable `true` only for an authorized staged test/activation |

Install secrets with Wrangler's interactive prompts, never command-line values,
VITE_* variables, source code or committed files. **The commands below write
cloud resources and require later authorization; they were not run here.**
For a staging Worker, first select its verified isolated name/config instead of
the production name. After production activation is explicitly authorized:

```powershell
npx.cmd wrangler secret put RESEND_API_KEY --name bitreca-website
npx.cmd wrangler secret put CONTACT_TURNSTILE_SECRET --name bitreca-website
```

Use the intended Cloudflare account and check the exact target before each
command. Do not echo values or paste them into this guide. Secrets must exist on
both environments independently if both are used. No real secrets are needed
for the repository's mocked unit/browser checks.

### 5. Staged test and real inbox acceptance gate

1. Arrange an explicitly authorized isolated staging Worker and origin without
   production D1/R2 bindings, auth changes or deletion cron activation. Do not
   clone production bindings/schedules merely to test Contact. Stage the two
   Contact routes/handler with the approved flags, secrets, widget and limiters.
   Provisioning/deployment is a separate owner action, not part of this task.
2. Confirm config returns enabled with only the public site key and no secrets.
   Missing configuration must disable sending. Verify no secrets in browser
   source, network payloads, bundle or logs. Confirm the privacy/retention copy
   matches provider and owner inbox practices before collecting real data.
3. Submit a real, clearly labelled test enquiry from an owner-controlled email.
   Complete Turnstile on the allowed hostname. Record the returned reference and
   Resend's event status. HTTP 202 means provider acceptance, not inbox receipt.
4. Owner must open **info@bitreca.com**, check inbox/spam, identify the test by
   reference/content, confirm sender and body, and click Reply to verify it
   targets the test visitor email. Receiving-domain MX/authentication, spam
   filtering or a Resend Delivered event alone are not a substitute for this.
5. Exercise bad fields, invalid/expired challenge, wrong Origin, rate limits,
   provider rejection and network timeout. Verify entries remain and no false
   acceptance is shown. Retry unchanged data with a fresh token and the same
   request ID; confirm no duplicate during Resend's idempotency window.
6. Obtain explicit production activation authorization. If not approved, leave
   CONTACT_EMAIL_ENABLED false. Roll back sending by disabling that flag while
   leaving WhatsApp, direct email and copy fallback available.

## Verification performed locally

Focused automated tests cover handler validation, fail-closed configuration,
Worker routing isolation, provider/challenge errors, fixed From/To, Reply-To,
plain-text formatting and idempotency. Browser functional tests use mocked
Turnstile/provider outcomes; they do not prove real domain verification or inbox
receipt. Approved visual QA was not repeated. See BITRECA_V1_ROADMAP.md for actual
run results and current blockers.

## Primary references consulted

- [Resend Send Email API](https://resend.com/docs/api-reference/emails/send-email)
- [Resend verified domains](https://resend.com/docs/dashboard/domains/introduction)
- [Resend idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys)
- [Turnstile server-side verification](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
- [Turnstile client rendering](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/)
- [Workers rate-limit bindings and locality](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)

**Current blocker:** Resend account/domain/key, real Turnstile credentials,
contact limiter bindings and inbox receipt have not been verified/configured by
this task. Code completion is not production delivery readiness.
