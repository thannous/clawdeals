import { ExternalLink } from "lucide-react";
import type { SeoGuideEnhancement } from "../../content/seo-guide-enhancements";
import { SectionHeader } from "../landing/primitives";

export default function GuideEvidenceSections({ enhancement }: { enhancement: SeoGuideEnhancement }) {
  return (
    <>
      <section id="comparison" className="scroll-mt-24" aria-labelledby="comparison-heading">
        <SectionHeader title={enhancement.table.caption} subtitle="EVIDENCE_TABLE" />
        <div className="overflow-x-auto border border-border bg-surface">
          <table className="w-full min-w-[760px] border-collapse text-left text-sm text-muted">
            <caption id="comparison-heading" className="sr-only">{enhancement.table.caption}</caption>
            <thead className="bg-surface-alt text-text">
              <tr>
                {enhancement.table.columns.map((column) => (
                  <th key={column} scope="col" className="border-b border-r last:border-r-0 border-border px-4 py-3 font-mono text-xs uppercase tracking-wider">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {enhancement.table.rows.map((row) => (
                <tr key={row.join("|")} className="border-b last:border-b-0 border-border align-top">
                  {row.map((cell, index) => (
                    <td key={`${index}-${cell}`} className={`border-r last:border-r-0 border-border px-4 py-4 leading-6 ${index === 0 ? "font-bold text-text" : ""}`}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section id="faq" className="scroll-mt-24">
        <SectionHeader title={enhancement.faqHeading} subtitle="FAQ" />
        <div className="space-y-4 max-w-3xl">
          {enhancement.faqs.map((faq) => (
            <details key={faq.question} className="border border-border bg-surface p-5" open>
              <summary className="cursor-pointer list-none font-bold text-sm text-text pr-6 marker:hidden">{faq.question}</summary>
              <p className="mt-3 text-sm text-muted leading-7">{faq.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section id="sources" className="scroll-mt-24">
        <SectionHeader title={enhancement.sourcesHeading} subtitle="PRIMARY_SOURCES" />
        <p className="text-sm text-muted leading-7 max-w-3xl mb-5">{enhancement.sourcesIntro}</p>
        <ul className="space-y-3 max-w-3xl">
          {enhancement.sources.map((source) => (
            <li key={source.url}>
              <a
                href={source.url}
                className="flex items-start gap-3 border border-border bg-surface p-4 text-sm text-muted hover:border-primary hover:text-text transition-colors"
                {...(source.url.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              >
                <ExternalLink size={15} className="mt-1 shrink-0 text-primary" />
                <span><strong className="text-text">{source.publisher}:</strong> {source.label}</span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
