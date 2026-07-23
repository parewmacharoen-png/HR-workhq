import { useEffect, useState } from 'react';
import { previewWorkflow, type ApprovalPreview } from '../../api/approval';

interface Props {
  workflowType: string;
  employeeId: string;
  companyId?: string;
  leaveTypeCode?: string;
}

export function ApprovalPreviewPanel({ workflowType, employeeId, companyId, leaveTypeCode }: Props) {
  const [preview, setPreview] = useState<ApprovalPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!employeeId || !workflowType) return;
    setLoading(true);
    setError('');
    void previewWorkflow({ workflowType, employeeId, companyId, leaveTypeCode })
      .then(setPreview)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [workflowType, employeeId, companyId, leaveTypeCode]);

  if (loading) return <p className="muted">Loading approval path…</p>;
  if (error) return <p className="error-text">{error}</p>;
  if (!preview) return null;

  const uniqueSteps = preview.steps.length
    ? preview.steps
    : [{ stepOrder: 1, label: 'Approver', approverStrategy: '', approvers: preview.approvers.map((a) => ({ employeeId: a.employeeId, name: a.name })) }];

  return (
    <div className="approval-preview-card">
      <h3>Approvals Required</h3>
      <ul className="approval-preview-list">
        {uniqueSteps.map((step) => (
          <li key={step.stepOrder}>
            <span className="approval-check">✓</span>
            <div>
              <strong>{step.label}</strong>
              {step.approvers.map((a) => (
                <span key={`${step.stepOrder}-${a.employeeId ?? a.name}`} className="muted approval-name">
                  {a.name || 'Unassigned'}
                </span>
              ))}
            </div>
          </li>
        ))}
      </ul>
      {preview.steps.some((s) => s.approverStrategy === 'any_owner') && (
        <p className="muted">Any owner may approve — first approval completes this step.</p>
      )}
      {preview.requiresOwner && (
        <p className="muted">Owner approval is mandatory for this request.</p>
      )}
    </div>
  );
}
