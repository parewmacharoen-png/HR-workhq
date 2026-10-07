# ============================================================================
# docker/backup/Dockerfile
# Cron container: nightly pg_dump → (optional) AES-256 encryption → local
# retention + (optional) S3 upload. `workhq-restore.sh` is included for
# emergency restores on the server.
# ============================================================================

FROM postgres:16-bookworm

RUN apt-get update \
 && apt-get install -y --no-install-recommends cron awscli openssl \
 && rm -rf /var/lib/apt/lists/*

COPY backup.sh /usr/local/bin/workhq-backup.sh
COPY restore.sh /usr/local/bin/workhq-restore.sh
COPY entrypoint.sh /usr/local/bin/workhq-backup-entrypoint.sh
COPY crontab /etc/cron.d/workhq-backup

RUN chmod +x /usr/local/bin/workhq-backup.sh /usr/local/bin/workhq-restore.sh \
 && chmod +x /usr/local/bin/workhq-backup-entrypoint.sh \
 && chmod 0644 /etc/cron.d/workhq-backup \
 && touch /var/log/workhq-backup.log

VOLUME ["/backups"]

ENTRYPOINT ["/usr/local/bin/workhq-backup-entrypoint.sh"]
CMD ["cron", "-f"]
