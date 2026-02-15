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
            <strong>Vercel Inc.</strong> — 340 S Lemon Ave #4133, Walnut, CA 91789, USA —{" "}
            <a href="https://vercel.com" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
              vercel.com
            </a>{" "}
            (application hosting)
          </li>
          <li>
            <strong>Cloudflare, Inc.</strong> — 101 Townsend St, San Francisco, CA 94107, USA —{" "}
            <a href="https://cloudflare.com" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
              cloudflare.com
            </a>{" "}
            (marketing site &amp; CDN)
          </li>
          <li>
            <strong>Supabase Inc.</strong> — 970 Toa Payoh North #07-04, Singapore 318992 —{" "}
            <a href="https://supabase.com" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
              supabase.com
            </a>{" "}
            (database, EU data region)
          </li>
          <li>
            <strong>Upstash Inc.</strong> —{" "}
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
          All content on the Site — including but not limited to text, graphics, logos, icons, images,
          audio clips, software and its underlying source code — is the exclusive property of ClawDeals
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
          Libertes (CNIL) — 3 Place de Fontenoy, TSA 80715, 75334 Paris Cedex 07, France —{" "}
          <a href="https://www.cnil.fr" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
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
            <a href="https://cloudflare.com" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
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
          <a href="https://www.cnil.fr" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
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

export function MentionsES() {
  return (
    <>
      {/* 1. Editor del sitio */}
      <Section id="editor" title="1. Editor del sitio">
        <p className="mb-4">
          El sitio web <strong>www.clawdeals.com</strong> (en adelante &ldquo;el Sitio&rdquo;) es publicado por:
        </p>
        <ul className="list-disc pl-6 mb-4 space-y-1">
          <li>Denominación: TiMax</li>
          <li>Forma jurídica: Empresa individual (<em>entreprise individuelle</em>)</li>
          <li>Domicilio social: Orléans, Francia</li>
          <li>SIRET: 995 316 981 00019</li>
          <li>Director de publicación: Thanh Chau</li>
          <li>Correo electrónico de contacto: contact@clawdeals.com</li>
        </ul>
      </Section>

      {/* 2. Proveedores de alojamiento */}
      <Section id="alojamiento" title="2. Proveedores de alojamiento">
        <p className="mb-4">El Sitio está alojado en los siguientes proveedores:</p>
        <ul className="list-disc pl-6 mb-4 space-y-1">
          <li>
            <strong>Vercel Inc.</strong> — 340 S Lemon Ave #4133, Walnut, CA 91789, EE.UU. —{" "}
            <a href="https://vercel.com" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
              vercel.com
            </a>{" "}
            (alojamiento de la aplicación)
          </li>
          <li>
            <strong>Cloudflare, Inc.</strong> — 101 Townsend St, San Francisco, CA 94107, EE.UU. —{" "}
            <a href="https://cloudflare.com" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
              cloudflare.com
            </a>{" "}
            (sitio de marketing y CDN)
          </li>
          <li>
            <strong>Supabase Inc.</strong> — 970 Toa Payoh North #07-04, Singapur 318992 —{" "}
            <a href="https://supabase.com" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
              supabase.com
            </a>{" "}
            (base de datos, región UE)
          </li>
          <li>
            <strong>Upstash Inc.</strong> —{" "}
            <a href="https://upstash.com" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
              upstash.com
            </a>{" "}
            (caché, región UE)
          </li>
        </ul>
      </Section>

      {/* 3. Propiedad intelectual */}
      <Section id="pi" title="3. Propiedad intelectual">
        <p className="mb-4">
          Todo el contenido del Sitio — incluyendo textos, gráficos, logotipos, iconos, imágenes,
          clips de audio, software y su código fuente — es propiedad exclusiva de ClawDeals o de
          sus licenciantes y está protegido por las leyes francesas e internacionales de propiedad
          intelectual.
        </p>
        <p className="mb-4">
          Queda prohibida cualquier reproducción, representación, modificación, distribución o
          redistribución, total o parcial, del contenido del Sitio sin autorización previa por
          escrito de ClawDeals.
        </p>
      </Section>

      {/* 4. Datos personales */}
      <Section id="datos" title="4. Datos personales">
        <p className="mb-4">
          ClawDeals trata datos personales de conformidad con el Reglamento (UE) 2016/679 (RGPD) y
          la Ley francesa de Protección de Datos (<em>Loi Informatique et Libertés</em>). Para
          obtener información completa sobre cómo recopilamos, utilizamos y protegemos sus datos,
          consulte nuestra{" "}
          <Link href="/legal/privacy" className="text-primary hover:underline">Política de privacidad</Link>.
        </p>
        <p className="mb-4">
          La autoridad de control es la Commission Nationale de l&apos;Informatique et des Libertés
          (CNIL) — 3 Place de Fontenoy, TSA 80715, 75334 Paris Cedex 07, Francia —{" "}
          <a href="https://www.cnil.fr" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
            www.cnil.fr
          </a>.
        </p>
      </Section>

      {/* 5. Cookies */}
      <Section id="cookies" title="5. Cookies">
        <p className="mb-4">
          El Sitio puede utilizar cookies y tecnologías de seguimiento similares. Para obtener
          información detallada sobre las cookies que utilizamos y cómo gestionar sus preferencias,
          consulte la sección dedicada en nuestra{" "}
          <Link href="/legal/privacy" className="text-primary hover:underline">Política de privacidad</Link>.
        </p>
      </Section>

      {/* 6. Legislación aplicable */}
      <Section id="ley" title="6. Legislación aplicable y jurisdicción competente">
        <p className="mb-4">
          El presente aviso legal se rige por la legislación francesa. Cualquier litigio derivado
          del uso del Sitio será sometido a la jurisdicción exclusiva de los tribunales competentes
          de Francia.
        </p>
      </Section>
    </>
  );
}
