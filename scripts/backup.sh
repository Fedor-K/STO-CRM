#\!/bin/bash
set -e

# Load environment
source /opt/STO-CRM/docker/.env

# Config
BACKUP_DIR=/tmp/stocrm-backups
DATE=$(date +%Y-%m-%d_%H-%M)
FILENAME=stocrm_${DATE}.sql.gz

mkdir -p $BACKUP_DIR

echo "[$(date)] Starting backup..."

# Dump database
docker exec stocrm-postgres pg_dump -U ${POSTGRES_USER:-stocrm} ${POSTGRES_DB:-stocrm} | gzip > $BACKUP_DIR/$FILENAME

SIZE=$(du -h $BACKUP_DIR/$FILENAME | cut -f1)
echo "[$(date)] Dump created: $FILENAME ($SIZE)"

# Upload to S3
docker run --rm \
  -e AWS_ACCESS_KEY_ID=$S3_BACKUP_ACCESS_KEY \
  -e AWS_SECRET_ACCESS_KEY=$S3_BACKUP_SECRET_KEY \
  -v $BACKUP_DIR:/backup \
  amazon/aws-cli \
  --endpoint-url https://$S3_BACKUP_ENDPOINT \
  --region $S3_BACKUP_REGION \
  --no-verify-ssl \
  s3 cp /backup/$FILENAME s3://$S3_BACKUP_BUCKET/daily/$FILENAME

echo "[$(date)] Uploaded to S3"

# Weekly backup (on Sundays)
if [ $(date +%u) -eq 7 ]; then
  docker run --rm \
    -e AWS_ACCESS_KEY_ID=$S3_BACKUP_ACCESS_KEY \
    -e AWS_SECRET_ACCESS_KEY=$S3_BACKUP_SECRET_KEY \
    -v $BACKUP_DIR:/backup \
    amazon/aws-cli \
    --endpoint-url https://$S3_BACKUP_ENDPOINT \
    --region $S3_BACKUP_REGION \
    --no-verify-ssl \
    s3 cp /backup/$FILENAME s3://$S3_BACKUP_BUCKET/weekly/$FILENAME
  echo "[$(date)] Weekly backup saved"
fi

# Cleanup local
rm -f $BACKUP_DIR/$FILENAME

echo "[$(date)] Backup completed\!"
