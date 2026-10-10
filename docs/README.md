# NTSOne: documentation

This folder documents the whole system. Read them in this order.

| Document | What it covers | Who it is for |
|---|---|---|
| [SYSTEM_OVERVIEW.md](SYSTEM_OVERVIEW.md) | What the platform is, who uses it, every module and feature, step-by-step workflows | Everyone: owners, admins, support, new developers |
| [ARCHITECTURE.md](ARCHITECTURE.md) | How it is built: stack, folders, request flow, data model, background jobs, API map, front end | Developers |
| [OPERATIONS.md](OPERATIONS.md) | Setting up, environment variables, migrations, deploying, going live, monitoring, troubleshooting | Whoever runs the system |
| [SECURITY.md](SECURITY.md) | Every protection in the system, what it defends against, and what is not covered | Owners, developers, auditors |
| [PAYMENTS.md](PAYMENTS.md) | Monime payments, the 5% fee, the payment fund, withdrawals, refunds, paid voting (detailed) | Developers and finance |
| [BOOKKEEPING.md](BOOKKEEPING.md) | The bookkeeping module and voice notes (detailed) | Developers and support |
| [SECURITY_AND_SCALABILITY_AUDIT.md](SECURITY_AND_SCALABILITY_AUDIT.md) | An earlier hardening pass and load notes | Developers |

## Honest status
- The system has **not** been load-tested against the live database, and **payments, refunds, withdrawals and the Monime
  payout calls have not been run with real money**. Follow the "Going live" checklist in OPERATIONS.md before relying on them.
- No document here claims the system is "100% secure". SECURITY.md lists what is protected and what is not.
- Where a document says something is "decided by the server", that is deliberate: the screen only mirrors the rules.

- [BACKUP_RECOVERY.md](BACKUP_RECOVERY.md): encrypted daily backups, verification, restore, disaster recovery, API.
- [RELIABILITY.md](RELIABILITY.md): the blank-page root cause and fix, scaling, concurrency, tests, remaining risks, deployment checklist.
- [WISHLIST.md](WISHLIST.md): the Wish List module (lists, items, gotten list, summary, activity, API).
- [PWA.md](PWA.md): installing NTSOne as an app on iPhone, Android and computers, offline behavior, and how it is built.
