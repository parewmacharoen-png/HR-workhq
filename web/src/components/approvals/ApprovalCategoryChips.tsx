import type { ApprovalCategory } from '../../lib/request-type-meta';
import { APPROVAL_CATEGORIES } from '../../lib/request-type-meta';

interface Props {
  value: ApprovalCategory;
  onChange: (value: ApprovalCategory) => void;
  counts?: Partial<Record<ApprovalCategory, number>>;
}

export function ApprovalCategoryChips({ value, onChange, counts }: Props) {
  return (
    <div className="whq-category-chips" role="tablist" aria-label="กรองประเภทคำขอ">
      {APPROVAL_CATEGORIES.map((cat) => {
        const count = counts?.[cat.id];
        return (
          <button
            key={cat.id}
            type="button"
            role="tab"
            aria-selected={value === cat.id}
            className={`whq-category-chip ${value === cat.id ? 'whq-category-chip-active' : ''}`}
            onClick={() => onChange(cat.id)}
          >
            {cat.icon} {cat.label}
            {count != null && count > 0 && (
              <span className="whq-category-chip-count">{count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
