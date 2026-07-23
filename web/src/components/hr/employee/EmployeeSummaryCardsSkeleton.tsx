export function EmployeeSummaryCardsSkeleton() {
  return (
    <div className="whq-employee-metrics-strip whq-employee-metrics-strip--skeleton" aria-hidden>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="whq-employee-metric-chip whq-skeleton whq-employee-metric-chip--skeleton" />
      ))}
    </div>
  );
}
