interface Props {
  message?: string;
  onRetry?: () => void;
}

export default function ErrorState({ message = "Something went wrong", onRetry }: Props) {
  return (
    <div className="border border-red-500/40 bg-red-500/5 rounded clip-corner p-6 text-center space-y-3">
      <p className="text-sm text-red-300 font-mono">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-4 py-1.5 text-xs font-mono font-bold uppercase border border-primary text-primary rounded hover:bg-primary/10 transition-colors"
        >
          Retry
        </button>
      )}
    </div>
  );
}
