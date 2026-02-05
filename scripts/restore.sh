#\!/bin/bash
set -e

source /opt/STO-CRM/docker/.env

BACKUP_DIR=/tmp/stocrm-backups
mkdir -p $BACKUP_DIR

# List available backups
echo "=== Доступные бэкапы ==="
echo ""
echo "Daily:"
docker run --rm \
  -e AWS_ACCESS_KEY_ID=$S3_BACKUP_ACCESS_KEY \
  -e AWS_SECRET_ACCESS_KEY=$S3_BACKUP_SECRET_KEY \
  amazon/aws-cli \
  --endpoint-url https://$S3_BACKUP_ENDPOINT \
  --region $S3_BACKUP_REGION \
  --no-verify-ssl \
  s3 ls s3://$S3_BACKUP_BUCKET/daily/ 2>/dev/null | tail -10

echo ""
echo "Weekly:"
docker run --rm \
  -e AWS_ACCESS_KEY_ID=$S3_BACKUP_ACCESS_KEY \
  -e AWS_SECRET_ACCESS_KEY=$S3_BACKUP_SECRET_KEY \
  amazon/aws-cli \
  --endpoint-url https://$S3_BACKUP_ENDPOINT \
  --region $S3_BACKUP_REGION \
  --no-verify-ssl \
  s3 ls s3://$S3_BACKUP_BUCKET/weekly/ 2>/dev/null || echo "(пусто)"

echo ""
echo "=== Для восстановления выполни: ==="
echo "  $0 daily/stocrm_YYYY-MM-DD_HH-MM.sql.gz"
echo ""

if [ -z "$1" ]; then
  exit 0
fi

BACKUP_FILE=$1
FILENAME=$(basename $BACKUP_FILE)

echo "[$(date)] Скачиваю $BACKUP_FILE..."

docker run --rm \
  -e AWS_ACCESS_KEY_ID=$S3_BACKUP_ACCESS_KEY \
  -e AWS_SECRET_ACCESS_KEY=$S3_BACKUP_SECRET_KEY \
  -v $BACKUP_DIR:/backup \
  amazon/aws-cli \
  --endpoint-url https://$S3_BACKUP_ENDPOINT \
  --region $S3_BACKUP_REGION \
  --no-verify-ssl \
  s3 cp s3://$S3_BACKUP_BUCKET/$BACKUP_FILE /backup/$FILENAME

echo "[$(date)] Останавливаю приложение..."
cd /opt/STO-CRM/docker
docker compose -f docker-compose.prod.yml stop api web

echo "[$(date)] Восстанавливаю базу данных..."
gunzip -c $BACKUP_DIR/$FILENAME | docker exec -i stocrm-postgres psql -U ${POSTGRES_USER:-stocrm} -d ${POSTGRES_DB:-stocrm}

echo "[$(date)] Запускаю приложение..."
docker compose -f docker-compose.prod.yml start api web

rm -f $BACKUP_DIR/$FILENAME

echo "[$(date)] Готово\! База восстановлена из $BACKUP_FILE"
