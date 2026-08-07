/* ------------------------------------------------------------------ */
/*  Mentions Legales / Legal Notice — LCEN-compliant                  */
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
      {/* 1. Éditeur du site */}
      <Section id="editeur" title="1. Éditeur du site">
        <p className="mb-4">
          Le site <strong>www.clawdeals.com</strong> (ci-après « le Site ») est édité par :
        </p>
        <ul className="list-disc pl-6 mb-4 space-y-1">
          <li>Dénomination : TiMax</li>
          <li>Forme juridique : Entreprise individuelle</li>
          <li>Siège social : Orléans, France</li>
          <li>SIRET : 995 316 981 00019</li>
          <li>Directeur de la publication : Thanh Chau</li>
          <li>E-mail de contact : contact@clawdeals.com</li>
        </ul>
      </Section>

      {/* 2. Hébergeurs */}
      <Section id="hebergeurs" title="2. Hébergeurs">
        <p className="mb-4">Le Site est hébergé par les prestataires suivants :</p>
        <ul className="list-disc pl-6 mb-4 space-y-1">
          <li>
            <strong>Vercel Inc.</strong> — 340 S Lemon Ave #4133, Walnut, CA 91789, USA —{" "}
            <a href="https://vercel.com" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
              vercel.com
            </a>{" "}
            (hébergement applicatif)
          </li>
          <li>
            <strong>Cloudflare, Inc.</strong> — 101 Townsend St, San Francisco, CA 94107, USA —{" "}
            <a href="https://www.cloudflare.com/" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
              cloudflare.com
            </a>{" "}
            (site marketing &amp; CDN)
          </li>
          <li>
            <strong>Supabase Inc.</strong> — 970 Toa Payoh North #07-04, Singapore 318992 —{" "}
            <a href="https://supabase.com" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
              supabase.com
            </a>{" "}
            (base de données, région UE)
          </li>
          <li>
            <strong>Upstash Inc.</strong> —{" "}
            <a href="https://upstash.com" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
              upstash.com
            </a>{" "}
            (cache, région UE)
          </li>
        </ul>
      </Section>

      {/* 3. Propriété intellectuelle */}
      <Section id="pi" title="3. Propriété intellectuelle">
        <p className="mb-4">
          L&apos;ensemble des contenus du Site — textes, graphismes, logos, icônes, images, extraits
          sonores, logiciels et code source — est la propriété exclusive de ClawDeals ou de ses
          concédants et est protégé par le droit français et international de la propriété
          intellectuelle.
        </p>
        <p className="mb-4">
          Toute reproduction, représentation, modification, distribution ou redistribution, en tout
          ou partie, du contenu du Site est interdite sans autorisation écrite préalable de ClawDeals.
        </p>
      </Section>

      {/* 4. Données personnelles */}
      <Section id="donnees" title="4. Données personnelles">
        <p className="mb-4">
          ClawDeals traite des données à caractère personnel conformément au Règlement (UE) 2016/679
          (RGPD) et à la loi Informatique et Libertés. Pour connaître en détail les modalités de
          collecte, d&apos;utilisation et de protection de vos données, veuillez consulter notre{" "}
          <Link href="/legal/privacy" className="text-primary hover:underline">Politique de confidentialité</Link>.
        </p>
        <p className="mb-4">
          L&apos;autorité de contrôle est la Commission Nationale de l&apos;Informatique et des
          Libertés (CNIL) — 3 Place de Fontenoy, TSA 80715, 75334 Paris Cedex 07, France —{" "}
          <a href="https://www.cnil.fr/fr" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
            www.cnil.fr
          </a>.
        </p>
      </Section>

      {/* 5. Cookies */}
      <Section id="cookies" title="5. Cookies">
        <p className="mb-4">
          Le Site peut utiliser des cookies et des technologies de suivi similaires. Pour des
          informations détaillées sur les cookies utilisés et la gestion de vos préférences, veuillez
          consulter la section dédiée de notre{" "}
          <Link href="/legal/privacy" className="text-primary hover:underline">Politique de confidentialité</Link>.
        </p>
      </Section>

      {/* 6. Droit applicable */}
      <Section id="droit" title="6. Droit applicable et juridiction compétente">
        <p className="mb-4">
          Les présentes mentions légales sont régies par le droit français. Tout litige relatif à
          l&apos;utilisation du Site sera soumis à la compétence exclusive des juridictions françaises
          compétentes.
        </p>
      </Section>
    </>
  );
}

/* ================================================================== */
/*  SPANISH                                                           */
/* ================================================================== */

