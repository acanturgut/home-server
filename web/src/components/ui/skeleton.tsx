/** Pulsing placeholder rows shown while a card loads. */
export function SkeletonRows({
  rows = 3,
  block = false,
}: {
  rows?: number;
  block?: boolean;
}) {
  return (
    <div className="animate-pulse space-y-2" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className={`rounded-md bg-muted ${block ? 'h-12' : 'h-3'}`}
          style={{ width: block ? '100%' : `${60 + ((i * 17) % 30)}%` }}
        />
      ))}
    </div>
  );
}
