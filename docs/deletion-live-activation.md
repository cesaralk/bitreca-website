# Production deletion handover

The protected deletion rollout and the disposable portfolio11 application test are
complete. The retained job is ea5631ea-eb6f-4db6-bf35-0ef9117c2eaa: its immutable
finalization receipt and finalized dispatch confirm deletion of the approved HTML
object and removal of the portfolio row. Both owned prefixes were verified empty.
Legacy portfolios5-10 remained published with unchanged full metadata hashes.
This cleanup does not repeat that verification or assert a new deployment result.

## Production source and configuration

- Main: worker/index.js, configured by wrangler.jsonc.
- Hosting: portfolio-hosting/index.js, configured by wrangler.portfolio-hosting.jsonc.
- D1: bitreca-db, UUID8ff2d1f7-e747-4fe8-a6a3-87898e1ae79a.
- Existing public/media storage: bitreca-media; eligible new portfolios use
  bitreca-portfolios-prod-20261031 through PORTFOLIO_STORAGE.
- Authorization: solo-operator-v1, generation2, writer protocol1.
- Last verified runtime revision4 authorizes cleanup and separate finalization.
- Main source config preserves approved requests/cleanup/finalization/scheduling,
  one Cron each minute, closed evidence import and unfrozen portfolio mutations.
- Hosting retains its separate frozen read configuration; execution controls stay
  disabled. Legacy deletion/reconciliation import stay disabled on both Workers.

Wrangler stores public configuration only. Admin credentials, session secret and
ADMIN_AUTH_VERSION remain remote secrets. Encrypted owner keys, signed generation2
evidence, sealed production artifacts, database backups and Stage7-9D receipts
remain protected outside Git. No local cleanup changes those records.

## Development and deployment boundaries

PortfolioForest layout, production runtime sources, migrations0004-0017 and owner
key/recovery safeguards are unchanged by the cleanup. Reusable tests remain under
tests/. Historical disabled configuration fixtures now live under
tests/fixtures/retired-environments/; they are not deployment configurations.
One-off sandbox deployment/collection/transfer utilities and their exclusive tests
were retired. Required validation, signing and backup library dependencies remain.

GitHub main was pushed at 14dabbdbd3468c88e6919b1bb954b90d17234526. Automatic Cloudflare builds are enabled;
this cleanup commit is LOCAL ONLY and must not be pushed without separate approval.
No deployment, migration, signing, import or deletion is authorized by this document.
The retained signed artifact identity remains
2e8cc4a9a9cee71809be0d00a7170dc3794e3f86d272a2832c2665d7dedeed95; a source
commit alone never establishes fresh artifact byte identity or writer settlement.

Historical rollout commands and retired environment records are retained in
[the completed release](https://github.com/cesaralk/bitreca-website/blob/14dabbdbd3468c88e6919b1bb954b90d17234526/docs/deletion-live-activation.md). Do not rerun
completed cutovers, migrations, enrollment, deployment or deletion acceptance.
