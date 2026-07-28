export function SkeletonCard() {
  return (
    <div className="skeleton-card">
      <div className="skeleton-img skeleton-pulse" />
      <div className="skeleton-body">
        <div className="skeleton-line short skeleton-pulse" />
        <div className="skeleton-line skeleton-pulse" />
        <div className="skeleton-line medium skeleton-pulse" />
        <div className="skeleton-line short skeleton-pulse" />
      </div>
    </div>
  );
}

export function SkeletonGrid({ count = 8, className = 'products-grid' }) {
  return (
    <div className={className}>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
