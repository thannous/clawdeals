import { useTranslations } from "next-intl";
import { formatDate } from "../console/shared/formatDate";
import { resolveCoverImageSrc } from "../media/cover-image";
import { Field, Section } from "./Section";

function money(amount: unknown, currency: unknown) {
  if (amount === null || amount === undefined || amount === "") return "\u2014";
  return `${String(amount)} ${typeof currency === "string" ? currency : ""}`.trim();
}

// The listing and the accepted offer as frozen when the buyer paid.
export default function TermsCard({ terms }: { terms: any }) {
  const t = useTranslations("protectedCheckout");

  if (!terms?.listing) {
    return (
      <Section title={t("terms.title")} testId="pc-terms">
        <p className="text-sm text-subtle">{t("terms.unavailable")}</p>
      </Section>
    );
  }

  const listing = terms.listing;
  const photos = (Array.isArray(listing.photos) ? listing.photos : [])
    .map((photo: any) => resolveCoverImageSrc(photo))
    .filter((src: string | null): src is string => Boolean(src));

  return (
    <Section title={t("terms.title")} testId="pc-terms">
      <p className="text-sm text-muted">{t("terms.note")}</p>

      <div>
        <p data-testid="pc-terms-title" className="text-base font-semibold text-text [overflow-wrap:anywhere]">
          {listing.title || t("untitled")}
        </p>
        <p className="mt-2 text-sm text-muted whitespace-pre-line [overflow-wrap:anywhere]">
          {listing.description || t("terms.noDescription")}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label={t("terms.agreedPrice")}>{money(terms.offer?.amount, terms.offer?.currency)}</Field>
        <Field label={t("terms.listedPrice")}>{money(listing.price_amount, listing.currency)}</Field>
        <Field label={t("terms.condition")}>{listing.condition || "\u2014"}</Field>
        <Field label={t("terms.category")}>{listing.category || "\u2014"}</Field>
        <Field label={t("terms.delivery")}>{listing.delivery_method || "\u2014"}</Field>
        <Field label={t("terms.fingerprint")}>
          <span title={terms.sha256}>{String(terms.sha256 || "").slice(0, 12) || "\u2014"}</span>
        </Field>
      </div>

      <div>
        <p className="text-xs font-mono text-subtle uppercase tracking-wider mb-2">{t("terms.photos")}</p>
        {photos.length === 0 ? (
          <p className="text-sm text-subtle">{t("terms.noPhotos")}</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {photos.map((src: string, index: number) => (
              <li key={src}>
                <a href={src} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt={t("terms.photoAlt", { index: index + 1 })}
                    loading="lazy"
                    className="h-24 w-24 object-cover border border-border rounded"
                  />
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-xs font-mono text-subtle">{t("terms.savedAt", { date: formatDate(terms.captured_at) })}</p>
    </Section>
  );
}
