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
      {/* 1. Editeur du site */}
      <Section id="editeur" title="1. Editeur du site">
        <p className="mb-4">
          Le site <strong>www.clawdeals.com</strong> (ci-apres « le Site ») est edite par :
        </p>
        <ul className="list-disc pl-6 mb-4 space-y-1">
          <li>Denomination : TiMax</li>
          <li>Forme juridique : Entreprise individuelle</li>
          <li>Siege social : Orleans, France</li>
          <li>SIRET : 995 316 981 00019</li>
          <li>Directeur de la publication : Thanh Chau</li>
          <li>Email de contact : contact@clawdeals.com</li>
        </ul>
      </Section>

      {/* 2. Hebergeurs */}
      <Section id="hebergeurs" title="2. Hebergeurs">
        <p className="mb-4">Le Site est heberge par les prestataires suivants :</p>
        <ul className="list-disc pl-6 mb-4 space-y-1">
          <li>
            <strong>Vercel Inc.</strong> — 340 S Lemon Ave #4133, Walnut, CA 91789, USA —{" "}
            <a href="https://vercel.com" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
              vercel.com
            </a>{" "}
            (hebergement applicatif)
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
            (base de donnees, region UE)
          </li>
          <li>
            <strong>Upstash Inc.</strong> —{" "}
            <a href="https://upstash.com" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
              upstash.com
            </a>{" "}
            (cache, region UE)
          </li>
        </ul>
      </Section>

      {/* 3. Propriete intellectuelle */}
      <Section id="pi" title="3. Propriete intellectuelle">
        <p className="mb-4">
          L&apos;ensemble des contenus du Site — textes, graphismes, logos, icones, images, extraits
          sonores, logiciels et code source — est la propriete exclusive de ClawDeals ou de ses
          concedants et est protege par le droit francais et international de la propriete
          intellectuelle.
        </p>
        <p className="mb-4">
          Toute reproduction, representation, modification, distribution ou redistribution, en tout
          ou partie, du contenu du Site est interdite sans autorisation ecrite prealable de ClawDeals.
        </p>
      </Section>

      {/* 4. Donnees personnelles */}
      <Section id="donnees" title="4. Donnees personnelles">
        <p className="mb-4">
          ClawDeals traite des donnees a caractere personnel conformement au Reglement (UE) 2016/679
          (RGPD) et a la loi Informatique et Libertes. Pour connaitre en detail les modalites de
          collecte, d&apos;utilisation et de protection de vos donnees, veuillez consulter notre{" "}
          <Link href="/legal/privacy" className="text-primary hover:underline">Politique de confidentialite</Link>.
        </p>
        <p className="mb-4">
          L&apos;autorite de controle est la Commission Nationale de l&apos;Informatique et des
          Libertes (CNIL) — 3 Place de Fontenoy, TSA 80715, 75334 Paris Cedex 07, France —{" "}
          <a href="https://www.cnil.fr" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
            www.cnil.fr
          </a>.
        </p>
      </Section>

      {/* 5. Cookies */}
      <Section id="cookies" title="5. Cookies">
        <p className="mb-4">
          Le Site peut utiliser des cookies et des technologies de suivi similaires. Pour des
          informations detaillees sur les cookies utilises et la gestion de vos preferences, veuillez
          consulter la section dediee de notre{" "}
          <Link href="/legal/privacy" className="text-primary hover:underline">Politique de confidentialite</Link>.
        </p>
      </Section>

      {/* 6. Droit applicable */}
      <Section id="droit" title="6. Droit applicable et juridiction competente">
        <p className="mb-4">
          Les presentes mentions legales sont regies par le droit francais. Tout litige relatif a
          l&apos;utilisation du Site sera soumis a la competence exclusive des juridictions francaises
          competentes.
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
          <li>Denominacion: TiMax</li>
          <li>Forma juridica: Empresa individual (<em>entreprise individuelle</em>)</li>
          <li>Domicilio social: Orleans, Francia</li>
          <li>SIRET: 995 316 981 00019</li>
          <li>Director de publicacion: Thanh Chau</li>
          <li>Correo electronico de contacto: contact@clawdeals.com</li>
        </ul>
      </Section>

      {/* 2. Proveedores de alojamiento */}
      <Section id="alojamiento" title="2. Proveedores de alojamiento">
        <p className="mb-4">El Sitio esta alojado en los siguientes proveedores:</p>
        <ul className="list-disc pl-6 mb-4 space-y-1">
          <li>
            <strong>Vercel Inc.</strong> — 340 S Lemon Ave #4133, Walnut, CA 91789, EE.UU. —{" "}
            <a href="https://vercel.com" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
              vercel.com
            </a>{" "}
            (alojamiento de la aplicacion)
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
            (base de datos, region UE)
          </li>
          <li>
            <strong>Upstash Inc.</strong> —{" "}
            <a href="https://upstash.com" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
              upstash.com
            </a>{" "}
            (cache, region UE)
          </li>
        </ul>
      </Section>

      {/* 3. Propiedad intelectual */}
      <Section id="pi" title="3. Propiedad intelectual">
        <p className="mb-4">
          Todo el contenido del Sitio — incluyendo textos, graficos, logotipos, iconos, imagenes,
          clips de audio, software y su codigo fuente — es propiedad exclusiva de ClawDeals o de
          sus licenciantes y esta protegido por las leyes francesas e internacionales de propiedad
          intelectual.
        </p>
        <p className="mb-4">
          Queda prohibida cualquier reproduccion, representacion, modificacion, distribucion o
          redistribucion, total o parcial, del contenido del Sitio sin autorizacion previa por
          escrito de ClawDeals.
        </p>
      </Section>

      {/* 4. Datos personales */}
      <Section id="datos" title="4. Datos personales">
        <p className="mb-4">
          ClawDeals trata datos personales de conformidad con el Reglamento (UE) 2016/679 (RGPD) y
          la Ley francesa de Proteccion de Datos (<em>Loi Informatique et Libertes</em>). Para
          obtener informacion completa sobre como recopilamos, utilizamos y protegemos sus datos,
          consulte nuestra{" "}
          <Link href="/legal/privacy" className="text-primary hover:underline">Politica de privacidad</Link>.
        </p>
        <p className="mb-4">
          La autoridad de control es la Commission Nationale de l&apos;Informatique et des Libertes
          (CNIL) — 3 Place de Fontenoy, TSA 80715, 75334 Paris Cedex 07, Francia —{" "}
          <a href="https://www.cnil.fr" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
            www.cnil.fr
          </a>.
        </p>
      </Section>

      {/* 5. Cookies */}
      <Section id="cookies" title="5. Cookies">
        <p className="mb-4">
          El Sitio puede utilizar cookies y tecnologias de seguimiento similares. Para obtener
          informacion detallada sobre las cookies que utilizamos y como gestionar sus preferencias,
          consulte la seccion dedicada en nuestra{" "}
          <Link href="/legal/privacy" className="text-primary hover:underline">Politica de privacidad</Link>.
        </p>
      </Section>

      {/* 6. Legislacion aplicable */}
      <Section id="ley" title="6. Legislacion aplicable y jurisdiccion competente">
        <p className="mb-4">
          El presente aviso legal se rige por la legislacion francesa. Cualquier litigio derivado
          del uso del Sitio sera sometido a la jurisdiccion exclusiva de los tribunales competentes
          de Francia.
        </p>
      </Section>
    </>
  );
}
