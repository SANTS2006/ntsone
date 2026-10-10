# Backup and recovery

For the platform's **super admin**: **Backup & Recovery** in the admin menu (`/admin/backups`).

## 1. What it does
- Copies the **whole database** every day, automatically, into an **encrypted file kept outside the server**.
- Checks every backup after it is made. Only a backup that passed all checks counts as a recovery point.
- Lets a super admin make a backup by hand, verify one again, download one, and delete old ones.
- Restores the database from a verified backup, in steps, after saving a safety copy of the current data. If a restore fails part-way it is undone completely.
- Records every action in the audit log.

## 2. Architecture
| Piece | Where | Job |
|---|---|---|
| Tables `backups`, `restores` | migration `0030` | One row per backup and per restore: status, size, checksum, who, errors. The files are **not** in the database. |
| `crypto.ts` | `backend/src/modules/backups` | Compresses and encrypts a dump with AES-256-GCM; checks the checksum and detects any change. |
| `storage.ts` | same | `BackupStorageProvider`: `local` (development) and `s3` (any S3-compatible bucket: Cloudflare R2, Backblaze B2, Amazon S3, MinIO). Requests are signed in the code with AWS Signature V4, so no extra library is needed. |
| `engine.ts` | same | Reads the database in one consistent snapshot and writes the dump; reads a dump back; restores inside one transaction. |
| `service.ts` | same | The rules: start, verify, delete, retention, restore steps, schedule. |
| `worker.ts` | same | A loop on every server instance (every 15 s) that runs queued restores and the daily backup. |
| `routes.ts` | same | The admin API under `/api/platform/backups` (super admin only). |

### No single clock, safe with many servers
No in-memory timer decides when to back up. Every instance asks the database "is today's backup due?". Two guards make sure only one instance does the work:
- a **unique index** allows only one `running` backup at a time (a second attempt is refused by the database);
- a queued restore is claimed with a row lock (`FOR UPDATE SKIP LOCKED`), and only one restore can be active (unique index).

A backup stuck in `running` for over 90 minutes (a server died) is marked failed automatically. On shutdown the server marks its own unfinished backup as interrupted.

## 3. The daily backup
- Runs at `BACKUP_SCHEDULE_HOUR_UTC` (default 02:00 UTC) on whichever instance gets there first.
- If it fails it tries again after 30 minutes, up to 3 attempts a day. A failure is shown on the page and recorded as `backup.failed`.
- The page warns when there is **no valid backup from the last 26 hours**.
- After each automatic backup, **retention** runs.

## 4. What is copied, and how
- Every table in the `public` schema except `backups` and `restores`. (Neon's own internals are not part of it.)
- The copy is read in **one repeatable-read, read-only transaction**, so it is a consistent picture of one moment even while people use the system. It does not lock anyone out.
- Each table's rows written are compared with a count taken in the same snapshot. A mismatch fails the backup.
- Format: one text line per row (`H` header, `R <table> <json>` rows, `E` footer with counts). Large numbers keep every digit. A file without its footer is rejected as cut short.

## 5. Encryption and keys
- AES-256-GCM. The key is derived (HKDF-SHA-256) from `BACKUP_ENCRYPTION_KEY` with a fresh random salt for every file, so no two files share a key.
- The file starts with the marker `NTSBK1`. GCM authenticates the whole file: a changed byte, a cut-short file or a wrong key all fail loudly.
- In production, backups **refuse to run without a key of at least 32 characters**.
- **Keep a copy of the key somewhere safe and separate** (a password manager, a sealed note). If the key is lost, the backups cannot be opened. Changing the key later means older backups need the older key.
- Credentials and the key are only in environment variables. The API never returns a storage location, key or credential.

## 6. Verification
A backup is `valid` only after **all** of these pass:
1. the file exists in storage with the size that was recorded;
2. it is downloaded again and its **SHA-256 checksum** matches the one taken before upload;
3. it decrypts (so it was not changed) and decompresses;
4. it has a header and a footer, and the rows found in each table match the footer and what was copied;
5. then it is marked `valid` and `verifiedAt` is set.

Any failure marks it `invalid` with the reason. An invalid or unverified backup can **never** be restored. A super admin can press **Verify** at any time to re-check an old backup (for example after moving storage).

## 7. Retention
- Default: keep **30 days** and always keep the newest **7** valid backups (`BACKUP_RETENTION_DAYS`, `BACKUP_KEEP_LATEST`; a super admin can change both on the page, within 1-3650 days and 3-365 backups).
- **Never deleted**: the newest valid backup, the only valid backup, the newest N valid backups, anything younger than the retention period, a backup that is running, and any backup used by a restore in progress.
- Failed or invalid backups older than the retention period are removed.
- A super admin can delete one by hand (password required); the same protections apply. Deleting records `backup.deleted`.

## 8. Restore, step by step
1. **Select** a backup in the history and press Restore. (Only valid backups have the button.)
2. **Review.** The server re-checks the backup and shows: *"You are about to restore the database to the state captured on [date/time]. Everything created or changed after that moment will be replaced."* It also reports problems, such as a changed database structure, a running backup or another restore.
3. **Confirm.** Type `RESTORE` and the first 8 characters of the backup's id, enter your **password**, and tick the box saying you understand data after the backup will be lost. The server checks all three again.
4. The request is queued (status `pending`) and the screen starts following it. **No browser request stays open.**
5. `preparing`: the file is fetched and its checksum is checked again.
6. `backing_up_current_database`: a **safety copy of the current database** is made and verified (type `pre_restore`). If it cannot be made, nothing is changed.
7. `restoring`: in **one transaction**, every table is emptied and refilled from the backup. The **audit log is never emptied**: it only gets back any rows it is missing.
8. `verifying`: row counts of every table are compared with the backup, still inside the transaction. Any mismatch **rolls everything back**.
9. `completed`. The restore is recorded in the audit log.

If anything fails at steps 5-8 the status is `failed`, and the page says whether the database was left exactly as it was (it always is, because the work is one transaction).

### After a restore
- People signed in may need to sign in again (their sessions come from the restored data).
- The money ledger returns to its state at the backup. The payments worker then asks Monime about any payment whose state changed after the backup; **check Payments for anything that was paid after the backup time.** Money moved at Monime after the backup is not undone by a restore.
- Use **Maintenance mode** (Maintenance page) before a planned restore so people are told.

### Limits
- A backup can only be restored into the **same database structure** (same migrations). After a deploy that changed the structure, older backups show "database structure has changed" and cannot be restored by this screen. Take a fresh backup before and after structure changes.
- The restore pauses foreign-key checks for the transaction (it uses `session_replication_role = replica`). The database user must be allowed to do that (Neon's default owner role is). If not, the restore stops before changing anything and says so.

## 9. Audit events
Every action is recorded (who, when, which backup, result, reason, request id). These are the event names (shown in the audit log with readable labels):

| Event | Name in the log |
|---|---|
| BACKUP_CREATED | `backup.created` |
| BACKUP_VERIFIED | `backup.verified` (outcome *failed* when invalid) |
| BACKUP_FAILED | `backup.failed` |
| BACKUP_DELETED | `backup.deleted` (reason in the details) |
| RESTORE_STARTED | `restore.started` (after `restore.requested`) |
| RESTORE_COMPLETED | `restore.completed` |
| RESTORE_FAILED | `restore.failed` |
| RESTORE_ROLLBACK | `restore.rollback` |
| (also) | `backup.downloaded`, `backup.policy_changed`, plus a request entry for each admin call |

The audit log cannot be edited or deleted by anyone (a database trigger enforces it).

## 10. Recovery objectives (assumptions)
- **RPO (data you could lose): up to 24 hours** with the daily backup. A super admin can press *Back up now* before risky work. Neon's **point-in-time restore** (database provider feature) gives a much smaller RPO and should stay switched on as a second layer.
- **RTO (time to be back):** the restore copies the data back in one transaction. For a database of a few hundred megabytes expect **minutes**; add the time to notice the problem and decide. Larger databases take longer; measure it with a copy of production.
- Assumptions: the storage bucket and `BACKUP_ENCRYPTION_KEY` survive the incident; the database structure has not changed since the chosen backup; a super admin can sign in (if not, see 11).

## 11. Disaster recovery
| Situation | What to do |
|---|---|
| **Wrong data / bad change** | Maintenance mode on, then Backup & Recovery, pick the newest valid backup **before** the problem, restore. The safety copy is the way back. |
| **Application crashed or bad deploy** | Redeploy the previous version on Render (Deploys, Rollback). The database is not affected. |
| **Database lost or corrupted at the provider** | First try the provider: Neon point-in-time restore. If that is not possible: create a new empty database, set `DATABASE_URL`, run the migrations (`npm run db:migrate`), create a super admin (`npm run db:create-super-admin`), then restore from the newest valid backup on the Backup & Recovery page. The backups in storage are listed in the page only if the `backups` table survived; for a brand-new database download the files from the bucket and see 12. |
| **Cannot sign in as super admin** | Create a new super admin with `npm run db:create-super-admin` against the database, then use the page. |
| **Lost `BACKUP_ENCRYPTION_KEY`** | The backups cannot be opened. Rely on Neon point-in-time restore and set a new key for future backups. This is why the key needs a separate safe copy. |

## 12. Opening a backup file outside the app
The file is `NTSBK1 | salt(16) | iv(12) | AES-256-GCM ciphertext | tag(16)`; the ciphertext is a gzip stream of the text dump. The key is `HKDF-SHA-256(secret = BACKUP_ENCRYPTION_KEY, salt, info = "ntsbk-v1-aes-256-gcm")`, 32 bytes. `backend/src/modules/backups/crypto.ts` (`unpackFile`) shows the exact steps and can be used from a small script to produce the plain text dump.

## 13. Settings (environment variables)
| Variable | Default | Meaning |
|---|---|---|
| `BACKUP_ENABLED` | `true` | Switch the whole feature on or off |
| `BACKUP_STORAGE` | `local` | `s3` in production. `local` is refused in production unless `BACKUP_ALLOW_LOCAL_IN_PRODUCTION=true` (not recommended: the disk is erased on deploy) |
| `BACKUP_S3_ENDPOINT` | | For example `https://<account>.r2.cloudflarestorage.com` |
| `BACKUP_S3_REGION` | `auto` | `auto` for Cloudflare R2; the real region for S3 or B2 |
| `BACKUP_S3_BUCKET`, `BACKUP_S3_PREFIX` | `database-backups` | Bucket and folder. **Keep the bucket private.** |
| `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY` | | A key limited to this bucket (read, write, delete) |
| `BACKUP_S3_FORCE_PATH_STYLE` | `true` | `true` for R2, B2, MinIO; `false` for virtual-hosted S3 |
| `BACKUP_ENCRYPTION_KEY` | | 32+ random characters (**secret**) |
| `BACKUP_RETENTION_DAYS` | `30` | Default; changeable on the page |
| `BACKUP_KEEP_LATEST` | `7` | Default; changeable on the page (minimum 3) |
| `BACKUP_SCHEDULE_HOUR_UTC` | `2` | Hour the daily backup starts |
| `BACKUP_LOCAL_DIR` | `./.backups` | Development only |

### Setting up storage (Cloudflare R2 example)
1. Create a **private** bucket. Create an API token limited to that bucket with read/write/delete.
2. Put the endpoint, bucket, key id and secret into Render's environment. Add `BACKUP_ENCRYPTION_KEY`.
3. Redeploy. Open **Backup & Recovery**: the red notice disappears when storage and key are valid.
4. Press **Back up now**, wait for **Valid**, then press **Verify** once more. Do a **test restore into a separate copy of the database** before relying on it.
5. Add a bucket **lifecycle/versioning rule** at the provider if you want protection against someone deleting files from the bucket.

## 14. API
All routes need a signed-in **super admin** (others get 403; no login gets 401). Responses use the usual `{ success, data }` envelope; errors add `error.code`, `error.message` and a top-level `requestId`.

| Method and URL | Purpose | Body / query | Notes |
|---|---|---|---|
| `GET /api/platform/backups/overview` | Status for the dashboard | | `ready`, `problem`, `storage`, `encrypted`, `nextScheduledAt`, `latestValid`, `latestFailed`, `running`, `activeRestore`, `policy`, `stale` |
| `GET /api/platform/backups` | History (paged) | `page`, `pageSize` (max 100), `type`, `status` | Never includes storage paths |
| `GET /api/platform/backups/:backupId` | One backup | | |
| `POST /api/platform/backups` | Back up now | | 202 and the new backup (`running`). Limit: 3 per 10 minutes. 409 if one is already running; 503 if not set up |
| `POST /api/platform/backups/:backupId/verify` | Verify again | | Returns the backup with `verificationStatus` |
| `DELETE /api/platform/backups/:backupId` | Delete | `{ password }` | 409 for the newest or only valid backup, or one in use |
| `POST /api/platform/backups/:backupId/download` | Download the encrypted file | `{ password }` | Streams the file; audited; 3 per 10 minutes |
| `GET /api/platform/backups/policy` / `PUT` | Retention | `{ retentionDays, keepLatest }` | |
| `GET /api/platform/backups/:backupId/restore-preview` | Step 2 of a restore | | `warning`, `problems`, `canRestore`, `confirmationPhrase`. Changes nothing |
| `POST /api/platform/backups/restores` | Queue a restore | `{ backupId, password, confirmation, acknowledgeDataLoss: true }` | 202 and the restore. 400 wrong words or password; 409 not restorable or another restore active. 3 per 15 minutes |
| `GET /api/platform/backups/restores` | Restore history (paged) | | |
| `GET /api/platform/backups/restores/:restoreId` | Progress | | `status`, `active`, `error`, `rolledBack` |

Statuses: backup `running | completed | failed | deleted`; verification `pending | valid | invalid`; restore `pending | preparing | backing_up_current_database | restoring | verifying | completed | failed`.

## 15. Front end
`frontend/src/features/backups/BackupsPage.tsx`: status cards, the red notice when storage or the key is missing, the amber notice when the daily backup is late, history table with Verify / Restore / Download / Delete, a three-step restore dialog (review, confirm, progress), restore history and the retention form. The restore progress is also shown on the page itself while one is active, so leaving and coming back is safe. Query keys start with `platform-backups` (refreshed automatically).

## 16. Troubleshooting
| Symptom | Check |
|---|---|
| Red notice "Backups are not running" | The text names what is missing (storage settings or the key) |
| Backup fails: "refused the upload (HTTP 403)" | Wrong key id/secret, or the key cannot write to this bucket/prefix |
| Backup fails: HTTP 301/400 | Wrong endpoint or region, or `BACKUP_S3_FORCE_PATH_STYLE` does not match the provider |
| "checksum does not match" | The stored file changed or was damaged; the backup is marked invalid. Make a new one |
| "database structure has changed" | A newer deploy changed the tables; take a new backup, older ones cannot be restored here |
| Restore says it is not allowed to pause table checks | Use the database owner role, or restore with the provider's own tools |
| Backup stays `running` | After 90 minutes it is marked failed by itself; check the Render log for "Backup failed" |
