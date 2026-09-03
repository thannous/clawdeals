export type ThreeIdea = {
  title: string;
  body: string;
};

/**
 * Shared "three ideas" block used by the landing hero and the WebMCP judge hub
 * so both surfaces tell the same story with the same visual rhythm.
 */
export default function ThreeIdeasGrid({
  items,
  ariaLabel,
  headingLevel = "h3",
  className = ""
}: {
  items: readonly ThreeIdea[];
  ariaLabel: string;
  headingLevel?: "h2" | "h3";
  className?: string;
}) {
  const Heading = headingLevel;
  return (
    <div className={`grid gap-4 lg:grid-cols-3 ${className}`} role="list" aria-label={ariaLabel} data-testid="three-ideas">
      {items.map((item, index) => (
        <article key={item.title} role="listitem" className="border border-border bg-surface p-5">
          <p className="font-mono text-xs text-primary">{String(index + 1).padStart(2, "0")}</p>
          <Heading className="mt-4 text-lg font-bold text-text">{item.title}</Heading>
          <p className="mt-2 text-sm leading-relaxed text-muted">{item.body}</p>
        </article>
      ))}
    </div>
  );
}
