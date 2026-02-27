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


export function MentionsES() {
  return (
    <>
      {/* 1. Editor del sitio */}
      <Section id="editor" title="1. Editor del sitio">
        <p className="mb-4">
          El sitio web <strong>www.clawdeals.com</strong> (en adelante &ldquo;el Sitio&rdquo;) es publicado por:
        </p>
        <ul className="list-disc pl-6 mb-4 space-y-1">
          <li>DenominaciÃ³n: TiMax</li>
          <li>Forma jurÃ­dica: Empresa individual (<em>entreprise individuelle</em>)</li>
          <li>Domicilio social: OrlÃ©ans, Francia</li>
          <li>SIRET: 995 316 981 00019</li>
          <li>Director de publicaciÃ³n: Thanh Chau</li>
          <li>Correo electrÃ³nico de contacto: contact@clawdeals.com</li>
        </ul>
      </Section>

      {/* 2. Proveedores de alojamiento */}
      <Section id="alojamiento" title="2. Proveedores de alojamiento">
        <p className="mb-4">El Sitio estÃ¡ alojado en los siguientes proveedores:</p>
        <ul className="list-disc pl-6 mb-4 space-y-1">
          <li>
            <strong>Vercel Inc.</strong> â€” 340 S Lemon Ave #4133, Walnut, CA 91789, EE.UU. â€”{" "}
            <a href="https://vercel.com" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
              vercel.com
            </a>{" "}
            (alojamiento de la aplicaciÃ³n)
          </li>
          <li>
            <strong>Cloudflare, Inc.</strong> â€” 101 Townsend St, San Francisco, CA 94107, EE.UU. â€”{" "}
            <a href="https://www.cloudflare.com/" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
              cloudflare.com
            </a>{" "}
            (sitio de marketing y CDN)
          </li>
          <li>
            <strong>Supabase Inc.</strong> â€” 970 Toa Payoh North #07-04, Singapur 318992 â€”{" "}
            <a href="https://supabase.com" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
              supabase.com
            </a>{" "}
            (base de datos, regiÃ³n UE)
          </li>
          <li>
            <strong>Upstash Inc.</strong> â€”{" "}
            <a href="https://upstash.com" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
              upstash.com
            </a>{" "}
            (cachÃ©, regiÃ³n UE)
          </li>
        </ul>
      </Section>

      {/* 3. Propiedad intelectual */}
      <Section id="pi" title="3. Propiedad intelectual">
        <p className="mb-4">
          Todo el contenido del Sitio â€” incluyendo textos, grÃ¡ficos, logotipos, iconos, imÃ¡genes,
          clips de audio, software y su cÃ³digo fuente â€” es propiedad exclusiva de ClawDeals o de
          sus licenciantes y estÃ¡ protegido por las leyes francesas e internacionales de propiedad
          intelectual.
        </p>
        <p className="mb-4">
          Queda prohibida cualquier reproducciÃ³n, representaciÃ³n, modificaciÃ³n, distribuciÃ³n o
          redistribuciÃ³n, total o parcial, del contenido del Sitio sin autorizaciÃ³n previa por
          escrito de ClawDeals.
        </p>
      </Section>

      {/* 4. Datos personales */}
      <Section id="datos" title="4. Datos personales">
        <p className="mb-4">
          ClawDeals trata datos personales de conformidad con el Reglamento (UE) 2016/679 (RGPD) y
          la Ley francesa de ProtecciÃ³n de Datos (<em>Loi Informatique et LibertÃ©s</em>). Para
          obtener informaciÃ³n completa sobre cÃ³mo recopilamos, utilizamos y protegemos sus datos,
          consulte nuestra{" "}
          <Link href="/legal/privacy" className="text-primary hover:underline">PolÃ­tica de privacidad</Link>.
        </p>
        <p className="mb-4">
          La autoridad de control es la Commission Nationale de l&apos;Informatique et des LibertÃ©s
          (CNIL) â€” 3 Place de Fontenoy, TSA 80715, 75334 Paris Cedex 07, Francia â€”{" "}
          <a href="https://www.cnil.fr/fr" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
            www.cnil.fr
          </a>.
        </p>
      </Section>

      {/* 5. Cookies */}
      <Section id="cookies" title="5. Cookies">
        <p className="mb-4">
          El Sitio puede utilizar cookies y tecnologÃ­as de seguimiento similares. Para obtener
          informaciÃ³n detallada sobre las cookies que utilizamos y cÃ³mo gestionar sus preferencias,
          consulte la secciÃ³n dedicada en nuestra{" "}
          <Link href="/legal/privacy" className="text-primary hover:underline">PolÃ­tica de privacidad</Link>.
        </p>
      </Section>

      {/* 6. LegislaciÃ³n aplicable */}
      <Section id="ley" title="6. LegislaciÃ³n aplicable y jurisdicciÃ³n competente">
        <p className="mb-4">
          El presente aviso legal se rige por la legislaciÃ³n francesa. Cualquier litigio derivado
          del uso del Sitio serÃ¡ sometido a la jurisdicciÃ³n exclusiva de los tribunales competentes
          de Francia.
        </p>
      </Section>
    </>
  );
}
