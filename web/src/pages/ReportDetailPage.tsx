import { FormEvent, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiGet, apiPatch, apiPost } from '../api';

interface AuditEntry {
  id: string;
  actorName: string | null;
  action: string;
  fieldName: string | null;
  oldValue: string | null;
  newValue: string | null;
  reason: string | null;
  createdAt: string;
}

interface Detail {
  report: Record<string, unknown>;
  auditHistory: AuditEntry[];
  approvalHistory: AuditEntry[];
}

export default function ReportDetailPage() {
  const { id } = useParams();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  async function load() {
    if (!id) return;
    try {
      setDetail(await apiGet<Detail>(`/marketing/reports/${id}`));
      setError('');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => { load(); }, [id]);

  async function patch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!id || !detail) return;
    const form = new FormData(e.currentTarget);
    try {
      await apiPatch(`/marketing/reports/${id}`, {
        reason,
        contactedCount: Number(form.get('contactedCount')),
        newMemberCount: Number(form.get('newMemberCount')),
        depositAmount: Number(form.get('depositAmount')),
        startedWorkCount: Number(form.get('startedWorkCount')),
        note: form.get('note') || null,
      });
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function action(path: string, body?: Record<string, string>) {
    if (!id) return;
    try {
      await apiPost(`/marketing/reports/${id}/${path}`, body);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (!detail) return <div className="card">{error || 'Loading…'}</div>;
  const r = detail.report;

  return (
    <div className="card">
      <p><Link to="/marketing/reports">← Back to list</Link></p>
      <h1>Report Detail</h1>
      {error && <p className="error">{error}</p>}
      <dl>
        {Object.entries(r).map(([key, value]) => (
          <div key={key}><strong>{key}:</strong> {String(value ?? '-')}</div>
        ))}
      </dl>
      <div className="toolbar">
        <button type="button" onClick={() => action('approve')}>Approve</button>
        <button type="button" className="secondary" onClick={() => {
          const rejectReason = prompt('Reject reason');
          if (rejectReason) action('reject', { reason: rejectReason });
        }}>Reject</button>
        <button type="button" className="secondary" onClick={() => {
          const voidReason = prompt('Void reason');
          if (voidReason) action('void', { reason: voidReason });
        }}>Void</button>
      </div>
      <h2>Edit</h2>
      <form onSubmit={patch}>
        <div className="toolbar">
          <label>Reason<textarea value={reason} onChange={(e) => setReason(e.target.value)} required /></label>
          <label>Contacted<input name="contactedCount" type="number" defaultValue={Number(r.contactedCount)} /></label>
          <label>New Members<input name="newMemberCount" type="number" defaultValue={Number(r.newMemberCount)} /></label>
          <label>Deposit<input name="depositAmount" type="number" defaultValue={Number(r.depositAmount)} /></label>
          <label>Started Work<input name="startedWorkCount" type="number" defaultValue={Number(r.startedWorkCount)} /></label>
          <label>Note<input name="note" defaultValue={String(r.note ?? '')} /></label>
        </div>
        <button type="submit">Save changes</button>
      </form>
      <h2>Audit History</h2>
      <AuditTable rows={detail.auditHistory} />
      <h2>Approval History</h2>
      <AuditTable rows={detail.approvalHistory} />
    </div>
  );
}

function AuditTable({ rows }: { rows: AuditEntry[] }) {
  return (
    <table>
      <thead>
        <tr>
          <th>When</th>
          <th>User</th>
          <th>Action</th>
          <th>Field</th>
          <th>Old</th>
          <th>New</th>
          <th>Reason</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <td>{new Date(row.createdAt).toLocaleString('th-TH')}</td>
            <td>{row.actorName ?? row.id.slice(0, 8)}</td>
            <td>{row.action}</td>
            <td>{row.fieldName ?? '-'}</td>
            <td>{row.oldValue ?? '-'}</td>
            <td>{row.newValue ?? '-'}</td>
            <td>{row.reason ?? '-'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
