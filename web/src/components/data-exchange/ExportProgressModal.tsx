import { useEffect, useState } from 'react';
import { apiGet } from '../../api/client';
import type { ExportJob } from '../../api/data-exchange';

interface ExportProgressModalProps {
  jobId: string | null;
  onClose: () => void;
}

export function ExportProgressModal({ jobId, onClose }: ExportProgressModalProps) {
  const [job, setJob] = useState<ExportJob | null>(null);

  useEffect(() => {
    if (!jobId) return;
    const timer = setInterval(() => {
      void apiGet<ExportJob>(`/exports/${jobId}`).then((j) => {
        setJob(j);
        if (['completed', 'failed', 'cancelled'].includes(j.status)) clearInterval(timer);
      }).catch(() => undefined);
    }, 2000);
    return () => clearInterval(timer);
  }, [jobId]);

  if (!jobId) return null;

  const done = job && ['completed', 'failed', 'cancelled'].includes(job.status);

  return (
    <div className="whq-modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100 }}>
      <div className="whq-modal" style={{ background: '#fff', margin: '10% auto', padding: 24, maxWidth: 420, borderRadius: 8 }}>
        <h3>กำลัง Export</h3>
        <div style={{ height: 8, background: '#eee', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ width: `${job?.progressPercent ?? 0}%`, height: '100%', background: '#2563eb', transition: 'width 0.3s' }} />
        </div>
        <p>{job?.status ?? 'pending'} · {job?.progressPercent ?? 0}%</p>
        {job?.googleSheetUrl && (
          <p><a href={job.googleSheetUrl} target="_blank" rel="noreferrer">เปิด Google Sheets</a></p>
        )}
        {job?.failedReason && <p className="whq-error">{job.failedReason}</p>}
        {done && (
          <button type="button" onClick={onClose}>ปิด</button>
        )}
      </div>
    </div>
  );
}
