interface Props {
  columns?: number;
  rows?: number;
}

export default function SkeletonTable({ columns = 6, rows = 8 }: Props) {
  return (
    <div className="bg-surface border border-border overflow-hidden animate-pulse">
      <div className="border-b border-border bg-bg/60 flex gap-3 px-3 py-2">
        {Array.from({ length: columns }).map((_, i) => (
          <div key={`h-${i}`} className="h-3 w-20 bg-surface-alt rounded" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={`r-${r}`} className="flex gap-3 px-3 py-2.5 border-b border-border/50">
          {Array.from({ length: columns }).map((_, c) => (
            <div key={`c-${c}`} className="h-3.5 w-16 bg-surface-alt rounded" />
          ))}
        </div>
      ))}
    </div>
  );
}
