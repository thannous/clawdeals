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


export function MentionsFR() {
  return (
    <>
      {/* 1. Ã‰diteur du site */}
      <Section id="editeur" title="1. Ã‰diteur du site">
        <p className="mb-4">
          Le site <strong>www.clawdeals.com</strong> (ci-aprÃ¨s Â« le Site Â») est Ã©ditÃ© par :
        </p>
        <ul className="list-disc pl-6 mb-4 space-y-1">
          <li>DÃ©nomination : TiMax</li>
          <li>Forme juridique : Entreprise individuelle</li>
          <li>SiÃ¨ge social : OrlÃ©ans, France</li>
          <li>SIRET : 995 316 981 00019</li>
          <li>Directeur de la publication : Thanh Chau</li>
          <li>E-mail de contact : contact@clawdeals.com</li>
        </ul>
      </Section>

      {/* 2. HÃ©bergeurs */}
      <Section id="hebergeurs" title="2. HÃ©bergeurs">
        <p className="mb-4">Le Site est hÃ©bergÃ© par les prestataires suivants :</p>
        <ul className="list-disc pl-6 mb-4 space-y-1">
          <li>
            <strong>Vercel Inc.</strong> â€” 340 S Lemon Ave #4133, Walnut, CA 91789, USA â€”{" "}
            <a href="https://vercel.com" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
              vercel.com
            </a>{" "}
            (hÃ©bergement applicatif)
          </li>
          <li>
            <strong>Cloudflare, Inc.</strong> â€” 101 Townsend St, San Francisco, CA 94107, USA â€”{" "}
            <a href="https://www.cloudflare.com/" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
              cloudflare.com
            </a>{" "}
            (site marketing &amp; CDN)
          </li>
          <li>
            <strong>Supabase Inc.</strong> â€” 970 Toa Payoh North #07-04, Singapore 318992 â€”{" "}
            <a href="https://supabase.com" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
              supabase.com
            </a>{" "}
            (base de donnÃ©es, rÃ©gion UE)
          </li>
          <li>
            <strong>Upstash Inc.</strong> â€”{" "}
            <a href="https://upstash.com" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
              upstash.com
            </a>{" "}
            (cache, rÃ©gion UE)
          </li>
        </ul>
      </Section>

      {/* 3. PropriÃ©tÃ© intellectuelle */}
      <Section id="pi" title="3. PropriÃ©tÃ© intellectuelle">
        <p className="mb-4">
          L&apos;ensemble des contenus du Site â€” textes, graphismes, logos, icÃ´nes, images, extraits
          sonores, logiciels et code source â€” est la propriÃ©tÃ© exclusive de ClawDeals ou de ses
          concÃ©dants et est protÃ©gÃ© par le droit franÃ§ais et international de la propriÃ©tÃ©
          intellectuelle.
        </p>
        <p className="mb-4">
          Toute reproduction, reprÃ©sentation, modification, distribution ou redistribution, en tout
          ou partie, du contenu du Site est interdite sans autorisation Ã©crite prÃ©alable de ClawDeals.
        </p>
      </Section>

      {/* 4. DonnÃ©es personnelles */}
      <Section id="donnees" title="4. DonnÃ©es personnelles">
        <p className="mb-4">
          ClawDeals traite des donnÃ©es Ã  caractÃ¨re personnel conformÃ©ment au RÃ¨glement (UE) 2016/679
          (RGPD) et Ã  la loi Informatique et LibertÃ©s. Pour connaÃ®tre en dÃ©tail les modalitÃ©s de
          collecte, d&apos;utilisation et de protection de vos donnÃ©es, veuillez consulter notre{" "}
          <Link href="/legal/privacy" className="text-primary hover:underline">Politique de confidentialitÃ©</Link>.
        </p>
        <p className="mb-4">
          L&apos;autoritÃ© de contrÃ´le est la Commission Nationale de l&apos;Informatique et des
          LibertÃ©s (CNIL) â€” 3 Place de Fontenoy, TSA 80715, 75334 Paris Cedex 07, France â€”{" "}
          <a href="https://www.cnil.fr/fr" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
            www.cnil.fr
          </a>.
        </p>
      </Section>

      {/* 5. Cookies */}
      <Section id="cookies" title="5. Cookies">
        <p className="mb-4">
          Le Site peut utiliser des cookies et des technologies de suivi similaires. Pour des
          informations dÃ©taillÃ©es sur les cookies utilisÃ©s et la gestion de vos prÃ©fÃ©rences, veuillez
          consulter la section dÃ©diÃ©e de notre{" "}
          <Link href="/legal/privacy" className="text-primary hover:underline">Politique de confidentialitÃ©</Link>.
        </p>
      </Section>

      {/* 6. Droit applicable */}
      <Section id="droit" title="6. Droit applicable et juridiction compÃ©tente">
        <p className="mb-4">
          Les prÃ©sentes mentions lÃ©gales sont rÃ©gies par le droit franÃ§ais. Tout litige relatif Ã 
          l&apos;utilisation du Site sera soumis Ã  la compÃ©tence exclusive des juridictions franÃ§aises
          compÃ©tentes.
        </p>
      </Section>
    </>
  );
}

/* ================================================================== */
/*  SPANISH                                                           */
/* ================================================================== */

