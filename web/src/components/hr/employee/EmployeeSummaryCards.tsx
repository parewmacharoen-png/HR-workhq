import type { EmployeeOverviewResponse } from '../../../api/employee-overview';
import { buildSummaryCards } from '../../../lib/employee-overview-display';
import { NO_DATA } from '../../../lib/employee-date-utils';
import type { EmployeeDetailTabId } from '../employee-detail/employee-detail-tabs';

import { EmployeeSummaryCardsSkeleton } from './EmployeeSummaryCardsSkeleton';

interface EmployeeSummaryCardsProps {
  overview: EmployeeOverviewResponse | null;
  loading?: boolean;
  onTabChange: (tab: EmployeeDetailTabId) => void;
  onOpenTelegram?: () => void;
}

export function EmployeeSummaryCards({
  overview,
  loading = false,
  onTabChange,
  onOpenTelegram,
}: EmployeeSummaryCardsProps) {
  if (loading) return <EmployeeSummaryCardsSkeleton />;
  if (!overview) return null;

  const cards = buildSummaryCards(overview);

  return (
    <div className="whq-employee-metrics-strip" data-testid="employee-summary-cards">
      {cards.map((card) => (
        <button
          key={card.id}
          type="button"
          className={`whq-employee-metric-chip whq-employee-metric-chip--${card.tone}`}
          data-testid={`summary-card-${card.id}`}
          onClick={() => {
            if (card.opensTelegram) {
              onOpenTelegram?.();
              return;
            }
            onTabChange(card.tab);
          }}
        >
          <div className="whq-employee-metric-chip-head">
            <span className="whq-employee-metric-chip-icon" aria-hidden>{card.icon}</span>
            <span className="whq-employee-metric-chip-label">{card.label}</span>
          </div>
          <span className="whq-employee-metric-chip-value">{card.value || NO_DATA}</span>
          {card.trend ? (
            <span
              className={`whq-employee-metric-chip-trend${
                card.trendTone === 'warning' ? ' whq-employee-metric-chip-trend--warning' : ''
              }`}
            >
              {card.trend}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
