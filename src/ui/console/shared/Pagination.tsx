interface Props {
  nextCursor: string | null;
  loading?: boolean;
  onLoadMore: () => void;
}

export default function Pagination({ nextCursor, loading = false, onLoadMore }: Props) {
  if (!nextCursor) return null;

  return (
    <div className="flex justify-center pt-4">
      <button
        onClick={onLoadMore}
        disabled={loading}
        className="px-6 py-2 text-xs font-mono font-bold uppercase border border-border text-muted rounded hover:border-primary hover:text-primary disabled:opacity-50 transition-colors"
      >
        {loading ? "Loading..." : "Load More"}
      </button>
    </div>
  );
}
