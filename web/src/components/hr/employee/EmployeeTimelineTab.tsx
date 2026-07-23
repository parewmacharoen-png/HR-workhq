import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError } from '../../../api/client';
import {
  fetchEmployeeTimeline,
  type EmployeeTimelineItem,
} from '../../../api/employee-timeline';
import {
  categoryLabel,
  filterTimelineItems,
  formatTimelineWhen,
  groupTimelineItems,
  searchTimelineItems,
  TIMELINE_FILTERS,
  type TimelineFilterId,
  timelineIconGlyph,
} from '../../../lib/employee-timeline-utils';
import { roleLabel } from '../../../i18n/th-labels';
import {
  WorkHQEmptyState,
  WorkHQErrorState,
  WorkHQPageState,
} from '../../workhq';
import { WorkHQButton, WorkHQCard, WorkHQField, WorkHQInput } from '../../ui';

function TimelineSkeleton() {
  return (
    <div className="whq-employee-timeline-skeleton" data-testid="timeline-skeleton">
      {[1, 2, 3].map((i) => (
        <div key={i} className="whq-employee-timeline-skeleton-row">
          <div className="whq-employee-timeline-skeleton-dot" />
          <div className="whq-employee-timeline-skeleton-body">
            <div className="whq-employee-timeline-skeleton-line whq-employee-timeline-skeleton-line--short" />
            <div className="whq-employee-timeline-skeleton-line" />
          </div>
        </div>
      ))}
    </div>
  );
}

function TimelineItemRow({ item }: { item: EmployeeTimelineItem }) {
  const when = formatTimelineWhen(item.timestamp);
  const actorLabel = item.actor
    ? (item.actor.businessRole ? roleLabel(item.actor.businessRole) : item.actor.name)
    : 'ระบบ';

  return (
    <li className="whq-employee-timeline-item" data-testid={`timeline-item-${item.id}`}>
      <div className={`whq-employee-timeline-dot whq-employee-timeline-dot--${item.color}`} aria-hidden>
        <span>{timelineIconGlyph(item.icon)}</span>
      </div>
      <div className="whq-employee-timeline-content">
        <div className="whq-employee-timeline-head">
          <strong>{item.title}</strong>
          <span className={`whq-employee-timeline-badge whq-employee-timeline-badge--${item.color}`}>
            {categoryLabel(item.category)}
          </span>
        </div>
        <p className="whq-employee-timeline-description">{item.description}</p>
        <div className="whq-employee-timeline-meta">
          <span>{when.dayLabel} · {when.timeLabel}</span>
          <span className="whq-employee-timeline-actor">โดย: {actorLabel}</span>
          <span>แหล่งที่มา: {item.source}</span>
        </div>
      </div>
    </li>
  );
}

interface EmployeeTimelineTabProps {
  employeeId: string;
}

export function EmployeeTimelineTab({ employeeId }: EmployeeTimelineTabProps) {
  const [items, setItems] = useState<EmployeeTimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [filter, setFilter] = useState<TimelineFilterId>('all');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchEmployeeTimeline(employeeId);
      setItems(res.items);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleItems = useMemo(
    () => searchTimelineItems(filterTimelineItems(items, filter), search),
    [items, filter, search],
  );

  const groups = useMemo(() => groupTimelineItems(visibleItems), [visibleItems]);

  const pageState = loading
    ? 'loading' as const
    : error
      ? 'error' as const
      : visibleItems.length === 0
        ? 'empty' as const
        : 'success' as const;

  return (
    <div className="whq-employee-timeline" data-testid="employee-timeline-tab">
      <div className="whq-employee-timeline-toolbar">
        <div className="whq-employee-timeline-filters" role="tablist" aria-label="Timeline filters">
          {TIMELINE_FILTERS.map((f) => (
            <WorkHQButton
              key={f.id}
              type="button"
              variant={filter === f.id ? 'primary' : 'secondary'}
              data-testid={`timeline-filter-${f.id}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </WorkHQButton>
          ))}
        </div>
        <WorkHQField label="ค้นหา">
          <WorkHQInput
            type="search"
            value={search}
            placeholder="ค้นหาชื่อเรื่อง รายละเอียด หรือผู้ดำเนินการ"
            data-testid="timeline-search"
            onChange={(e) => setSearch(e.target.value)}
          />
        </WorkHQField>
      </div>

      <WorkHQPageState
        state={pageState}
        loading={<TimelineSkeleton />}
        error={(
          <WorkHQErrorState
            referenceCode={error instanceof ApiError ? error.requestId : undefined}
            onRetry={() => void load()}
          />
        )}
        empty={(
          <WorkHQEmptyState
            title="ยังไม่มีประวัติ"
            description="เหตุการณ์ที่เกี่ยวกับพนักงานจะแสดงที่นี่เมื่อมีการเปลี่ยนแปลง"
          />
        )}
      >
        {groups.map((group) => (
          <WorkHQCard
            key={group.key}
            title={group.label}
            className="whq-detail-card whq-detail-card--wide whq-employee-timeline-group"
            data-testid={`timeline-group-${group.key}`}
          >
            <ol className="whq-employee-timeline-list">
              {group.items.map((item) => (
                <TimelineItemRow key={item.id} item={item} />
              ))}
            </ol>
          </WorkHQCard>
        ))}
      </WorkHQPageState>
    </div>
  );
}
