import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  fetchOrganizationTree,
  type OrganizationTreeNode,
} from '../../api/hierarchy';
import { useCompanyScope } from '../../hooks/useCompanyScope';
import { ErrorState } from '../../components/ErrorState';
import { EmptyState } from '../../components/EmptyState';
import { LoadingState } from '../../components/LoadingState';
import { WorkHQSelectCompanyState } from '../../components/workhq';
import {
  WorkHQAvatar,
  WorkHQButton,
  WorkHQPage,
  WorkHQPageHeader,
} from '../../components/ui';
import { avatarVariantForId, initials } from '../../components/ui/utils';
import { fetchForEachCompany } from '../../utils/multi-company';
import { roleLabel, th } from '../../i18n/th-labels';

function TreeNode({ node, depth = 0 }: { node: OrganizationTreeNode; depth?: number }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children.length > 0;
  const variant = avatarVariantForId(node.employeeId);

  return (
    <div style={{ marginLeft: depth ? 0 : 0 }}>
      <div className="whq-org-node">
        <div className="whq-org-node-header">
          <button
            type="button"
            className="whq-org-toggle"
            onClick={() => setExpanded((v) => !v)}
            disabled={!hasChildren}
            aria-expanded={expanded}
          >
            {hasChildren ? (expanded ? '▾' : '▸') : '·'}
          </button>
          <WorkHQAvatar
            initials={initials(node.firstName, node.lastName)}
            variant={variant}
            size="sm"
          />
          <div>
            <Link to={`/hr/employees/${node.employeeId}`} className="whq-org-name">
              {node.firstName} {node.lastName}
            </Link>
            <div className="whq-org-meta">
              <span className="whq-org-role-badge">{roleLabel(node.businessRole ?? node.roleLevel)}</span>
              <span>{node.globalId}</span>
              {node.position && <span>{node.position}</span>}
              {node.directReportCount > 0 && (
                <span>{th.organization.directReports(node.directReportCount)}</span>
              )}
            </div>
          </div>
        </div>
      </div>
      {expanded && hasChildren && (
        <div className="whq-org-children">
          {node.children.map((child) => (
            <TreeNode key={child.employeeId} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

interface CompanyOrgTree {
  companyId: string;
  companyName: string;
  nodes: OrganizationTreeNode[];
}

export default function OrganizationPage() {
  const {
    companies,
    scopedCompanyIds,
    isAllCompanies,
    companyLabel,
    hasCompanyScope,
  } = useCompanyScope();
  const [trees, setTrees] = useState<CompanyOrgTree[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    if (!hasCompanyScope) {
      setTrees([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const rows = await fetchForEachCompany(scopedCompanyIds, async (companyId) => {
        const data = await fetchOrganizationTree(companyId);
        return data.nodes;
      });
      setTrees(rows.map((row) => ({
        companyId: row.companyId,
        companyName: companies.find((company) => company.id === row.companyId)?.name ?? row.companyId,
        nodes: row.result,
      })));
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [companies, hasCompanyScope, scopedCompanyIds]);

  useEffect(() => { void load(); }, [load]);

  if (!hasCompanyScope) {
    return (
      <WorkHQPage shell>
        <WorkHQSelectCompanyState />
      </WorkHQPage>
    );
  }

  const subtitle = isAllCompanies
    ? `${th.organization.subtitle(companyLabel)} · ${scopedCompanyIds.length} บริษัท`
    : th.organization.subtitle(companyLabel);

  const hasNodes = trees.some((tree) => tree.nodes.length > 0);

  return (
    <WorkHQPage shell>
      <WorkHQPageHeader
        title={th.organization.title}
        subtitle={subtitle}
        actions={(
          <WorkHQButton type="button" variant="secondary" onClick={() => void load()}>
            {th.organization.refresh}
          </WorkHQButton>
        )}
      />

      {loading ? (
        <LoadingState label={th.common.loadingOrganization} />
      ) : error ? (
        <ErrorState error={error} onRetry={() => void load()} />
      ) : !hasNodes ? (
        <EmptyState
          icon="🌳"
          title={th.organization.emptyTitle}
          description={th.organization.emptyDesc}
          action={(
            <WorkHQButton to="/hr/employees" variant="primary">
              ไปที่พนักงาน
            </WorkHQButton>
          )}
        />
      ) : (
        <div className="whq-stack whq-stack--lg">
          {trees.map((tree) => (
            <section key={tree.companyId} className="whq-card whq-card--nested">
              {isAllCompanies ? (
                <h2 className="whq-section-title">{tree.companyName}</h2>
              ) : null}
              {tree.nodes.length === 0 ? (
                <p className="whq-muted">ยังไม่มีโครงสร้างในบริษัทนี้</p>
              ) : (
                <div className="whq-org-tree">
                  {tree.nodes.map((node) => (
                    <TreeNode key={node.employeeId} node={node} />
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </WorkHQPage>
  );
}
