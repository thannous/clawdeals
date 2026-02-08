interface Props {
  title: string;
  subtitle?: string;
}

export default function EmptyState({ title, subtitle }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <p className="text-sm font-mono font-bold text-muted uppercase tracking-wider">{title}</p>
      {subtitle && <p className="mt-2 text-xs font-mono text-subtle">{subtitle}</p>}
    </div>
  );
}
