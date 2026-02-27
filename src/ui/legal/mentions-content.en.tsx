/* ------------------------------------------------------------------ */
/*  Mentions Legales / Legal Notice â€” LCEN-compliant                  */
/*  Three locale variants: EN, FR, ES                                 */
/*  Last updated: 2026-02-15                                          */
/* ------------------------------------------------------------------ */

import Link from "next/link";

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id}>
      <h2 className="text-lg font-bold text-text uppercase tracking-wide mb-4">{title}</h2>
      {children}
    </section>
  );
}


/* ================================================================== */
/*  ENGLISH                                                           */
/* ================================================================== */


export function MentionsEN() {
  return (
    <>
      {/* 1. Site editor */}
      <Section id="editor" title="1. Site Editor">
        <p className="mb-4">
          The website <strong>www.clawdeals.com</strong> (hereinafter &ldquo;the Site&rdquo;) is published by:
        </p>
        <ul className="list-disc pl-6 mb-4 space-y-1">
          <li>Business name: TiMax</li>
          <li>Legal form: Sole proprietorship (<em>entreprise individuelle</em>)</li>
          <li>Registered address: Orleans, France</li>
          <li>SIRET: 995 316 981 00019</li>
          <li>Publication director: Thanh Chau</li>
          <li>Contact email: contact@clawdeals.com</li>
        </ul>
      </Section>

      {/* 2. Hosting providers */}
      <Section id="hosting" title="2. Hosting Providers">
        <p className="mb-4">The Site is hosted by the following providers:</p>
        <ul className="list-disc pl-6 mb-4 space-y-1">
          <li>
            <strong>Vercel Inc.</strong> â€” 340 S Lemon Ave #4133, Walnut, CA 91789, USA â€”{" "}
            <a href="https://vercel.com" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
              vercel.com
            </a>{" "}
            (application hosting)
          </li>
          <li>
            <strong>Cloudflare, Inc.</strong> â€” 101 Townsend St, San Francisco, CA 94107, USA â€”{" "}
            <a href="https://www.cloudflare.com/" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
              cloudflare.com
            </a>{" "}
            (marketing site &amp; CDN)
          </li>
          <li>
            <strong>Supabase Inc.</strong> â€” 970 Toa Payoh North #07-04, Singapore 318992 â€”{" "}
            <a href="https://supabase.com" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
              supabase.com
            </a>{" "}
            (database, EU data region)
          </li>
          <li>
            <strong>Upstash Inc.</strong> â€”{" "}
            <a href="https://upstash.com" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
              upstash.com
            </a>{" "}
            (cache, EU data region)
          </li>
        </ul>
      </Section>

      {/* 3. Intellectual property */}
      <Section id="ip" title="3. Intellectual Property">
        <p className="mb-4">
          All content on the Site â€” including but not limited to text, graphics, logos, icons, images,
          audio clips, software and its underlying source code â€” is the exclusive property of ClawDeals
          or its licensors and is protected by French and international intellectual property laws.
        </p>
        <p className="mb-4">
          Any reproduction, representation, modification, distribution or redistribution, in whole or
          in part, of the Site&apos;s content is prohibited without prior written authorization from ClawDeals.
        </p>
      </Section>

      {/* 4. Personal data */}
      <Section id="data" title="4. Personal Data">
        <p className="mb-4">
          ClawDeals processes personal data in accordance with Regulation (EU) 2016/679 (GDPR) and
          the French Data Protection Act (<em>Loi Informatique et Libertes</em>). For full details on
          how we collect, use and protect your data, please refer to our{" "}
          <Link href="/legal/privacy" className="text-primary hover:underline">Privacy Policy</Link>.
        </p>
        <p className="mb-4">
          The supervisory authority is the Commission Nationale de l&apos;Informatique et des
          Libertes (CNIL) â€” 3 Place de Fontenoy, TSA 80715, 75334 Paris Cedex 07, France â€”{" "}
          <a href="https://www.cnil.fr/fr" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
            www.cnil.fr
          </a>.
        </p>
      </Section>

      {/* 5. Cookies */}
      <Section id="cookies" title="5. Cookies">
        <p className="mb-4">
          The Site may use cookies and similar tracking technologies. For detailed information on
          the cookies we use and how to manage your preferences, please consult the dedicated section
          in our{" "}
          <Link href="/legal/privacy" className="text-primary hover:underline">Privacy Policy</Link>.
        </p>
      </Section>

      {/* 6. Applicable law */}
      <Section id="law" title="6. Applicable Law &amp; Jurisdiction">
        <p className="mb-4">
          These legal notices are governed by French law. Any dispute arising from the use of the
          Site shall be submitted to the exclusive jurisdiction of the competent courts in France.
        </p>
      </Section>
    </>
  );
}

/* ================================================================== */
/*  FRENCH                                                            */
/* ================================================================== */

