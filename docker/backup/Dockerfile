# ============================================================================
# docker/backup/Dockerfile
# Cron container that runs daily pg_dump backups with 30-day retention.
# ============================================================================

FROM postgres:16-bookworm

RUN apt-get update \
 && apt-get install -y --no-install-recommends cron \
 && rm -rf /var/lib/apt/lists/*

COPY backup.sh /usr/local/bin/workhq-backup.sh
COPY entrypoint.sh /usr/local/bin/workhq-backup-entrypoint.sh
COPY crontab /etc/cron.d/workhq-backup

RUN chmod +x /usr/local/bin/workhq-backup.sh \
 && chmod +x /usr/local/bin/workhq-backup-entrypoint.sh \
 && chmod 0644 /etc/cron.d/workhq-backup \
 && touch /var/log/workhq-backup.log

VOLUME ["/backups"]

ENTRYPOINT ["/usr/local/bin/workhq-backup-entrypoint.sh"]
CMD ["cron", "-f"]
