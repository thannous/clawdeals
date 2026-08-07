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
            <a href="https://www.cloudflare.com/" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
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
          <a href="https://www.cnil.fr/fr" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
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
