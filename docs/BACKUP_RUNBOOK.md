# Backup & Restore Runbook

Database: MongoDB (`DB_NAME` from backend env). Critical collections: `orders`,
`payments`, `users`, `inventory_items`, `movement_log`, `admin_audit`, `stores`,
`products`, `product_overrides`, `offers`, `shifts`, `business_days`, `refunds`.

## Option A — MongoDB Atlas (recommended)

Enable **Continuous Cloud Backup with Point-in-Time Recovery (PITR)**:

1. Atlas → your cluster → **Backup** tab → **Edit Backup Policy**.
2. Turn ON **Continuous Cloud Backup** (requires M10+ tier).
3. Set snapshot schedule: daily snapshots, retention ≥ 30 days.
4. Set the PITR window to the maximum your tier allows (≥ 72 hours).
5. Verify: Backup tab shows "Continuous Cloud Backup: Enabled" and lists snapshots.

Restore (PITR): Backup tab → **Restore** → "Point in Time" → choose timestamp
just before the incident → restore to a **new cluster** (never overwrite the
live one directly) → repoint `MONGO_URL` after validating.

## Option B — Self-hosted MongoDB

Nightly compressed dump shipped to S3/object storage, 30-day retention.

```cron
# /etc/cron.d/mongo-backup — nightly at 02:30 IST
30 2 * * * app /usr/local/bin/mongo-backup.sh >> /var/log/mongo-backup.log 2>&1
```

```bash
#!/usr/bin/env bash
# /usr/local/bin/mongo-backup.sh
set -euo pipefail
STAMP=$(date +%F)
DUMP="/tmp/mongo-$STAMP"
mongodump --uri "$MONGO_URL" --db "$DB_NAME" --gzip --out "$DUMP"
tar -czf "$DUMP.tar.gz" -C "$DUMP" .
aws s3 cp "$DUMP.tar.gz" "s3://YOUR-BUCKET/mongo-backups/$STAMP.tar.gz"
rm -rf "$DUMP" "$DUMP.tar.gz"
# 30-day retention
aws s3 ls "s3://YOUR-BUCKET/mongo-backups/" | awk '{print $4}' | \
  while read -r f; do
    [ "$(date -d "${f%%.tar.gz}" +%s 2>/dev/null || echo 0)" -lt "$(date -d '30 days ago' +%s)" ] \
      && aws s3 rm "s3://YOUR-BUCKET/mongo-backups/$f"
  done
```

### Monthly RESTORE DRILL checklist (do this — a backup you haven't restored is a hope, not a backup)

- [ ] Pick last night's dump from S3; download to a scratch host.
- [ ] `mongorestore --uri "$SCRATCH_MONGO_URL" --nsFrom "$DB_NAME.*" --nsTo "drill_$DB_NAME.*" --gzip --dir <dump>`
- [ ] Count check: `db.orders.countDocuments({})` and `db.movement_log.countDocuments({})` in `drill_$DB_NAME` vs production at backup time — must match.
- [ ] Spot check: latest 5 orders' `total_price`/`payment_status` match production.
- [ ] Record drill date, dump file, counts, and any gaps in the ops log.
- [ ] Drop the scratch DB.

## Deploy rollback

1. Every deploy is tagged: `git tag deploy-YYYYMMDD-HHMM && git push --tags`.
2. Rollback = redeploy the previous tag: `git checkout <previous-tag>` → deploy.
3. Keep the last 10 deploy tags; never delete a tag that ran in production.
4. DB migrations in this codebase are additive/idempotent — old code runs on new data.
5. After rollback, verify `/api` health and one order round-trip before announcing.
