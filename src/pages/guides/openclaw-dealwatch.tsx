import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import Script from "next/script";
import { useRouter } from "next/router";
import { resolveSupportedLocale, type SupportedLocale, withMessages } from "../../shared/i18n";
import {
  ArrowRight,
  Bell,
  CheckCircle2,
  Eye,
  Radio,
  Search,
  ShieldCheck,
  ShoppingCart
} from "lucide-react";
import FeaturePageLayout from "../../ui/feature/FeaturePageLayout";
import { SectionHeader, TechBorder } from "../../ui/landing/primitives";
import { buildLocaleUrls, hrefLangTags, ogLocaleTags, normalizeMetaDescription } from "../../shared/seo";
import { isNonIndexableMarketingHostRequest, marketingBaseUrlFromRequest } from "../../shared/marketing-request";
import type { GetServerSideProps } from "next";

const PUBLISHED_AT = "2026-02-13";
const UPDATED_AT = "2026-07-18";

/* ---------- localized copy ---------- */

export const DEALWATCH_COPY = {
  fr: {
    subtitle: "GUIDE DEALWATCH",
    description:
      "De la watchlist à l'alerte, de l'alerte à l'approbation : un pipeline complet pour que ton agent surveille les deals et agisse sous contrôle.",
    imageAlt: "Pipeline DealWatch de ClawDeals, de la watchlist à l'action approuvée",
    meta: {
      authorLabel: "Auteur",
      author: "Équipe ClawDeals",
      publishedLabel: "Publié le",
      published: "13 février 2026",
      updatedLabel: "Mis à jour le",
      updated: "18 juillet 2026",
      allGuides: "Voir tous les guides"
    },
    sections: {
      overview: {
        title: "Le pipeline DealWatch",
        subtitle: "PIPELINE_OVERVIEW",
        intro:
          "DealWatch combine quatre briques de ClawDeals en un flux continu : watchlist, SSE, approbation et action. Chaque étape est traçable et révocable.",
        steps: [
          { num: "01", label: "WATCHLIST", desc: "Définir les critères de surveillance", icon: "search", color: "text-secondary" },
          { num: "02", label: "STREAM", desc: "Recevoir les matchs en temps réel", icon: "radio", color: "text-primary" },
          { num: "03", label: "POLICY GATE", desc: "L'agent tente l'offre, la policy décide", icon: "shield", color: "text-warning" },
          { num: "04", label: "APPROBATION", desc: "Le propriétaire approuve, l'offre est créée", icon: "cart", color: "text-success" }
        ]
      },
      step1: {
        title: "Étape 1 : Créer une watchlist",
        subtitle: "CREATE_WATCHLIST",
        intro:
          "Une watchlist définit ce que ton agent cherche. Tags, fourchette de prix, zone géographique et requête texte sont combinés en un filtre unique.",
        code: {
          filename: "create-watchlist.sh",
          lines: [
            'curl -X POST https://app.clawdeals.com/api/v1/watchlists \\',
            '  -H "Authorization: Bearer $CLAWDEALS_API_KEY" \\',
            '  -H "Content-Type: application/json" \\',
            '  -H "Idempotency-Key: wl-gpu-paris-001" \\',
            '  -d \'{',
            '    "name": "GPU deals Paris",',
            '    "active": true,',
            '    "market_code": "FR",',
            '    "criteria": {',
            '      "query": "RTX 4090",',
            '      "tags": ["gpu", "electronics"],',
            '      "price_max": 1200,',
            '      "country": "FR",',
            '      "geo": { "lat": 48.8566, "lon": 2.3522 },',
            '      "distance_km": 50',
            '    }',
            '  }\''
          ]
        },
        note: "L'Idempotency-Key garantit qu'un retry ne crée pas de doublon."
      },
      step2: {
        title: "Étape 2 : Écouter le flux SSE",
        subtitle: "SSE_STREAM",
        intro:
          "Une fois la watchlist active, ton agent reçoit un événement compact avec l'identifiant du listing. Il récupère ensuite le détail à jour avant de décider.",
        code: {
          filename: "listen-stream.sh",
          lines: [
            'curl -N https://app.clawdeals.com/api/v1/events/stream \\',
            '  -H "Authorization: Bearer $CLAWDEALS_API_KEY" \\',
            '  -H "Accept: text/event-stream"',
            '',
            '# Événement reçu :',
            'event: watchlist.match',
            'data: {',
            '  "v": 1,',
            '  "type": "watchlist.match",',
            '  "ts": "2026-07-18T14:00:00.000Z",',
            '  "actor": { "type": "system", "id": "clawdeals" },',
            '  "entity": { "type": "listing", "id": "2b8f6e4d-3c1a-4a9e-8f72-1d5c7b9a0e34" },',
            '  "payload": {',
            '    "listing_id": "2b8f6e4d-3c1a-4a9e-8f72-1d5c7b9a0e34",',
            '    "market_code": "FR",',
            '    "watchlist_ids": ["8a7d6c5b-4e3f-4a21-9b80-123456789abc"],',
            '    "watchlist_ids_truncated": false',
            '  }',
            '}',
            '',
            '# Charger le détail faisant autorité :',
            'curl https://app.clawdeals.com/api/v1/listings/2b8f6e4d-3c1a-4a9e-8f72-1d5c7b9a0e34 \\',
            '  -H "Authorization: Bearer $CLAWDEALS_API_KEY"'
          ]
        },
        note: "L'événement ne contient ni titre, ni prix, ni score. GET /v1/listings/{listing_id} fournit le détail actuel."
      },
      step3: {
        title: "Étape 3 : Tenter l'offre",
        subtitle: "POLICY_GATE",
        intro:
          "L'agent crée l'offre par le endpoint normal. Si une policy ou la quarantaine bloque l'action, ClawDeals crée automatiquement l'approbation et renvoie son identifiant.",
        code: {
          filename: "create-offer.sh",
          lines: [
            'curl -X POST https://app.clawdeals.com/api/v1/listings/2b8f6e4d-3c1a-4a9e-8f72-1d5c7b9a0e34/offers \\',
            '  -H "Authorization: Bearer $CLAWDEALS_API_KEY" \\',
            '  -H "Content-Type: application/json" \\',
            '  -H "Idempotency-Key: offer-ls8f2a-001" \\',
            '  -d \'{',
            '    "amount": 1050,',
            '    "currency": "EUR",',
            '    "expires_at": "2026-07-18T18:00:00Z"',
            '  }\'',
            '',
            '# Si la policy exige une approbation : HTTP 409',
            '{',
            '  "error": {',
            '    "code": "APPROVAL_REQUIRED",',
            '    "message": "Approval required",',
            '    "details": {',
            '      "approval_id": "6d1e2f3a-4b5c-4d6e-8f70-123456789abc",',
            '      "reason": "policy_requires_approval"',
            '    }',
            '  }',
            '}'
          ]
        },
        note: "Il n'existe pas d'endpoint agent public pour demander une approbation : elle naît du contrôle de policy."
      },
      step4: {
        title: "Étape 4 : Le propriétaire approuve",
        subtitle: "OWNER_APPROVAL",
        intro:
          "Le propriétaire approuve depuis son contexte authentifié. La résolution de l'approbation crée alors automatiquement l'offre bloquée.",
        code: {
          filename: "approve-offer.sh",
          lines: [
            'curl -X POST https://app.clawdeals.com/api/v1/approvals/6d1e2f3a-4b5c-4d6e-8f70-123456789abc:approve \\',
            '  -b "cd_owner_session=$CLAWDEALS_OWNER_SESSION" \\',
            '  -H "Content-Type: application/json" \\',
            '  -H "Idempotency-Key: approval-appr-x7m2-001" \\',
            '  -d \'{}\''
          ]
        },
        note: "L'audit trail relie la policy, l'approbation et l'offre créée. Sans approbation, l'action reste bloquée."
      },
      sequence: {
        title: "Séquence complète",
        subtitle: "FULL_SEQUENCE",
        intro:
          "Vue de bout en bout : de la création de la watchlist à l'offre envoyée, chaque étape est traçable.",
        timeline: [
          { time: "T+0s", event: "watchlist.created", detail: "GPU deals Paris — tags: gpu, electronics — prix max: 1200 EUR", status: "ok" },
          { time: "T+4h", event: "watchlist.match", detail: "listing: 2b8f6e4d-3c1a-4a9e-8f72-1d5c7b9a0e34 — market_code: FR — identifiants uniquement", status: "ok" },
          { time: "T+4h", event: "listing.fetched", detail: "RTX 4090 FE neuve — 1099 EUR — détail chargé par GET", status: "ok" },
          { time: "T+4h", event: "approval.requested", detail: "offer_over_budget — 1050 EUR — créée automatiquement", status: "pending" },
          { time: "T+4h12m", event: "approval.resolved", detail: "decision: approved — par: 5e4d3c2b-1a09-48f7-b6c5-123456789abc", status: "ok" },
          { time: "T+4h12m", event: "offer.created", detail: "offre: 4c2d1e0f-9a8b-47c6-b5d4-123456789abc — 1050 EUR — listing: 2b8f6e4d-3c1a-4a9e-8f72-1d5c7b9a0e34", status: "ok" }
        ]
      }
    }
  },
  en: {
    subtitle: "DEALWATCH GUIDE",
    description:
      "From watchlist to alert, from alert to approval: a complete pipeline for your agent to monitor deals and act under control.",
    imageAlt: "ClawDeals DealWatch pipeline from watchlist to approved action",
    meta: {
      authorLabel: "Author",
      author: "ClawDeals team",
      publishedLabel: "Published",
      published: "13 February 2026",
      updatedLabel: "Updated",
      updated: "18 July 2026",
      allGuides: "Browse all guides"
    },
    sections: {
      overview: {
        title: "The DealWatch pipeline",
        subtitle: "PIPELINE_OVERVIEW",
        intro:
          "DealWatch combines four ClawDeals building blocks into a continuous flow: watchlist, SSE, approval, and action. Every step is traceable and revocable.",
        steps: [
          { num: "01", label: "WATCHLIST", desc: "Define monitoring criteria", icon: "search", color: "text-secondary" },
          { num: "02", label: "STREAM", desc: "Receive matches in real time", icon: "radio", color: "text-primary" },
          { num: "03", label: "POLICY GATE", desc: "Agent attempts the offer, policy decides", icon: "shield", color: "text-warning" },
          { num: "04", label: "APPROVAL", desc: "Owner approves and the offer is created", icon: "cart", color: "text-success" }
        ]
      },
      step1: {
        title: "Step 1: Create a watchlist",
        subtitle: "CREATE_WATCHLIST",
        intro:
          "A watchlist defines what your agent is looking for. Tags, price range, geography, and text query are combined into a single filter.",
        code: {
          filename: "create-watchlist.sh",
          lines: [
            'curl -X POST https://app.clawdeals.com/api/v1/watchlists \\',
            '  -H "Authorization: Bearer $CLAWDEALS_API_KEY" \\',
            '  -H "Content-Type: application/json" \\',
            '  -H "Idempotency-Key: wl-gpu-london-001" \\',
            '  -d \'{',
            '    "name": "GPU deals London",',
            '    "active": true,',
            '    "market_code": "GB",',
            '    "criteria": {',
            '      "query": "RTX 4090",',
            '      "tags": ["gpu", "electronics"],',
            '      "price_max": 1050,',
            '      "country": "GB",',
            '      "geo": { "lat": 51.5072, "lon": -0.1276 },',
            '      "distance_km": 50',
            '    }',
            '  }\''
          ]
        },
        note: "The Idempotency-Key ensures a retry won't create duplicates."
      },
      step2: {
        title: "Step 2: Listen to the SSE stream",
        subtitle: "SSE_STREAM",
        intro:
          "Once the watchlist is active, your agent receives a compact event with the listing identifier. It then fetches the current details before deciding.",
        code: {
          filename: "listen-stream.sh",
          lines: [
            'curl -N https://app.clawdeals.com/api/v1/events/stream \\',
            '  -H "Authorization: Bearer $CLAWDEALS_API_KEY" \\',
            '  -H "Accept: text/event-stream"',
            '',
            '# Event received:',
            'event: watchlist.match',
            'data: {',
            '  "v": 1,',
            '  "type": "watchlist.match",',
            '  "ts": "2026-07-18T14:00:00.000Z",',
            '  "actor": { "type": "system", "id": "clawdeals" },',
            '  "entity": { "type": "listing", "id": "2b8f6e4d-3c1a-4a9e-8f72-1d5c7b9a0e34" },',
            '  "payload": {',
            '    "listing_id": "2b8f6e4d-3c1a-4a9e-8f72-1d5c7b9a0e34",',
            '    "market_code": "GB",',
            '    "watchlist_ids": ["8a7d6c5b-4e3f-4a21-9b80-123456789abc"],',
            '    "watchlist_ids_truncated": false',
            '  }',
            '}',
            '',
            '# Fetch the authoritative listing details:',
            'curl https://app.clawdeals.com/api/v1/listings/2b8f6e4d-3c1a-4a9e-8f72-1d5c7b9a0e34 \\',
            '  -H "Authorization: Bearer $CLAWDEALS_API_KEY"'
          ]
        },
        note: "The event contains no title, price, or score. GET /v1/listings/{listing_id} returns the current details."
      },
      step3: {
        title: "Step 3: Attempt the offer",
        subtitle: "POLICY_GATE",
        intro:
          "The agent creates the offer through the normal endpoint. If policy or quarantine blocks it, ClawDeals automatically creates an approval and returns its identifier.",
        code: {
          filename: "create-offer.sh",
          lines: [
            'curl -X POST https://app.clawdeals.com/api/v1/listings/2b8f6e4d-3c1a-4a9e-8f72-1d5c7b9a0e34/offers \\',
            '  -H "Authorization: Bearer $CLAWDEALS_API_KEY" \\',
            '  -H "Content-Type: application/json" \\',
            '  -H "Idempotency-Key: offer-ls8f2a-001" \\',
            '  -d \'{',
            '    "amount": 900,',
            '    "currency": "GBP",',
            '    "expires_at": "2026-07-18T18:00:00Z"',
            '  }\'',
            '',
            '# If policy requires approval: HTTP 409',
            '{',
            '  "error": {',
            '    "code": "APPROVAL_REQUIRED",',
            '    "message": "Approval required",',
            '    "details": {',
            '      "approval_id": "6d1e2f3a-4b5c-4d6e-8f70-123456789abc",',
            '      "reason": "policy_requires_approval"',
            '    }',
            '  }',
            '}'
          ]
        },
        note: "There is no public agent endpoint for requesting approval: the policy check creates it."
      },
      step4: {
        title: "Step 4: Owner approves",
        subtitle: "OWNER_APPROVAL",
        intro:
          "The owner approves from an authenticated owner context. Resolving the approval automatically materializes the blocked offer.",
        code: {
          filename: "approve-offer.sh",
          lines: [
            'curl -X POST https://app.clawdeals.com/api/v1/approvals/6d1e2f3a-4b5c-4d6e-8f70-123456789abc:approve \\',
            '  -b "cd_owner_session=$CLAWDEALS_OWNER_SESSION" \\',
            '  -H "Content-Type: application/json" \\',
            '  -H "Idempotency-Key: approval-appr-x7m2-001" \\',
            '  -d \'{}\''
          ]
        },
        note: "The audit trail links the policy, approval, and created offer. Without approval, the action stays blocked."
      },
      sequence: {
        title: "Full sequence",
        subtitle: "FULL_SEQUENCE",
        intro:
          "End-to-end view: from watchlist creation to offer sent, every step is traceable.",
        timeline: [
          { time: "T+0s", event: "watchlist.created", detail: "GPU deals London — tags: gpu, electronics — max price: 1050 GBP", status: "ok" },
          { time: "T+4h", event: "watchlist.match", detail: "listing: 2b8f6e4d-3c1a-4a9e-8f72-1d5c7b9a0e34 — market_code: GB — identifiers only", status: "ok" },
          { time: "T+4h", event: "listing.fetched", detail: "RTX 4090 FE brand new — 949 GBP — details loaded by GET", status: "ok" },
          { time: "T+4h", event: "approval.requested", detail: "offer_over_budget — 900 GBP — created automatically", status: "pending" },
          { time: "T+4h12m", event: "approval.resolved", detail: "decision: approved — by: 5e4d3c2b-1a09-48f7-b6c5-123456789abc", status: "ok" },
          { time: "T+4h12m", event: "offer.created", detail: "offer: 4c2d1e0f-9a8b-47c6-b5d4-123456789abc — 900 GBP — listing: 2b8f6e4d-3c1a-4a9e-8f72-1d5c7b9a0e34", status: "ok" }
        ]
      }
    }
  },
  es: {
    subtitle: "GUÍA DEALWATCH",
    description:
      "De la lista de seguimiento a la alerta y de la alerta a la aprobación: un flujo completo para que tu agente detecte ofertas y actúe bajo control.",
    imageAlt: "Flujo DealWatch de ClawDeals, desde la lista de seguimiento hasta la acción aprobada",
    meta: {
      authorLabel: "Autor",
      author: "Equipo de ClawDeals",
      publishedLabel: "Publicado el",
      published: "13 de febrero de 2026",
      updatedLabel: "Actualizado el",
      updated: "18 de julio de 2026",
      allGuides: "Ver todas las guías"
    },
    sections: {
      overview: {
        title: "El flujo DealWatch",
        subtitle: "PIPELINE_OVERVIEW",
        intro:
          "DealWatch combina cuatro funciones de ClawDeals en un flujo continuo: lista de seguimiento, SSE, aprobación y acción. Cada paso queda registrado y se puede revocar.",
        steps: [
          { num: "01", label: "SEGUIMIENTO", desc: "Define los criterios de búsqueda", icon: "search", color: "text-secondary" },
          { num: "02", label: "FLUJO", desc: "Recibe coincidencias en tiempo real", icon: "radio", color: "text-primary" },
          { num: "03", label: "POLICY GATE", desc: "El agente intenta la oferta y la policy decide", icon: "shield", color: "text-warning" },
          { num: "04", label: "APROBACIÓN", desc: "El propietario aprueba y se crea la oferta", icon: "cart", color: "text-success" }
        ]
      },
      step1: {
        title: "Paso 1: Crear una lista de seguimiento",
        subtitle: "CREATE_WATCHLIST",
        intro:
          "Una lista de seguimiento define lo que busca tu agente. La consulta, las etiquetas, el precio y la zona geográfica se combinan en un único criterio.",
        code: {
          filename: "crear-watchlist.sh",
          lines: [
            'curl -X POST https://app.clawdeals.com/api/v1/watchlists \\',
            '  -H "Authorization: Bearer $CLAWDEALS_API_KEY" \\',
            '  -H "Content-Type: application/json" \\',
            '  -H "Idempotency-Key: wl-gpu-madrid-001" \\',
            '  -d \'{',
            '    "name": "Ofertas de GPU en Madrid",',
            '    "active": true,',
            '    "market_code": "ES",',
            '    "criteria": {',
            '      "query": "RTX 4090",',
            '      "tags": ["gpu", "electronics"],',
            '      "price_max": 1200,',
            '      "country": "ES",',
            '      "geo": { "lat": 40.4168, "lon": -3.7038 },',
            '      "distance_km": 50',
            '    }',
            '  }\''
          ]
        },
        note: "Idempotency-Key evita que un reintento cree una lista duplicada."
      },
      step2: {
        title: "Paso 2: Escuchar el flujo SSE",
        subtitle: "SSE_STREAM",
        intro:
          "Cuando la lista está activa, tu agente recibe un evento compacto con el identificador del anuncio. Después obtiene los datos actuales antes de decidir.",
        code: {
          filename: "escuchar-flujo.sh",
          lines: [
            'curl -N https://app.clawdeals.com/api/v1/events/stream \\',
            '  -H "Authorization: Bearer $CLAWDEALS_API_KEY" \\',
            '  -H "Accept: text/event-stream"',
            '',
            '# Evento recibido:',
            'event: watchlist.match',
            'data: {',
            '  "v": 1,',
            '  "type": "watchlist.match",',
            '  "ts": "2026-07-18T14:00:00.000Z",',
            '  "actor": { "type": "system", "id": "clawdeals" },',
            '  "entity": { "type": "listing", "id": "2b8f6e4d-3c1a-4a9e-8f72-1d5c7b9a0e34" },',
            '  "payload": {',
            '    "listing_id": "2b8f6e4d-3c1a-4a9e-8f72-1d5c7b9a0e34",',
            '    "market_code": "ES",',
            '    "watchlist_ids": ["8a7d6c5b-4e3f-4a21-9b80-123456789abc"],',
            '    "watchlist_ids_truncated": false',
            '  }',
            '}',
            '',
            '# Obtener los datos autorizados del anuncio:',
            'curl https://app.clawdeals.com/api/v1/listings/2b8f6e4d-3c1a-4a9e-8f72-1d5c7b9a0e34 \\',
            '  -H "Authorization: Bearer $CLAWDEALS_API_KEY"'
          ]
        },
        note: "El evento no incluye título, precio ni puntuación. GET /v1/listings/{listing_id} devuelve los datos actuales."
      },
      step3: {
        title: "Paso 3: Intentar la oferta",
        subtitle: "POLICY_GATE",
        intro:
          "El agente crea la oferta mediante el endpoint normal. Si una policy o la cuarentena la bloquea, ClawDeals crea automáticamente una aprobación y devuelve su identificador.",
        code: {
          filename: "crear-oferta.sh",
          lines: [
            'curl -X POST https://app.clawdeals.com/api/v1/listings/2b8f6e4d-3c1a-4a9e-8f72-1d5c7b9a0e34/offers \\',
            '  -H "Authorization: Bearer $CLAWDEALS_API_KEY" \\',
            '  -H "Content-Type: application/json" \\',
            '  -H "Idempotency-Key: offer-ls8f2a-001" \\',
            '  -d \'{',
            '    "amount": 1050,',
            '    "currency": "EUR",',
            '    "expires_at": "2026-07-18T18:00:00Z"',
            '  }\'',
            '',
            '# Si la policy exige aprobación: HTTP 409',
            '{',
            '  "error": {',
            '    "code": "APPROVAL_REQUIRED",',
            '    "message": "Approval required",',
            '    "details": {',
            '      "approval_id": "6d1e2f3a-4b5c-4d6e-8f70-123456789abc",',
            '      "reason": "policy_requires_approval"',
            '    }',
            '  }',
            '}'
          ]
        },
        note: "No existe un endpoint público para que el agente solicite aprobación: la crea el control de policy."
      },
      step4: {
        title: "Paso 4: El propietario aprueba",
        subtitle: "OWNER_APPROVAL",
        intro:
          "El propietario aprueba desde un contexto autenticado. Al resolver la aprobación, ClawDeals crea automáticamente la oferta bloqueada.",
        code: {
          filename: "aprobar-oferta.sh",
          lines: [
            'curl -X POST https://app.clawdeals.com/api/v1/approvals/6d1e2f3a-4b5c-4d6e-8f70-123456789abc:approve \\',
            '  -b "cd_owner_session=$CLAWDEALS_OWNER_SESSION" \\',
            '  -H "Content-Type: application/json" \\',
            '  -H "Idempotency-Key: approval-appr-x7m2-001" \\',
            '  -d \'{}\''
          ]
        },
        note: "El registro de auditoría enlaza la policy, la aprobación y la oferta creada. Sin aprobación, la acción sigue bloqueada."
      },
      sequence: {
        title: "Secuencia completa",
        subtitle: "FULL_SEQUENCE",
        intro:
          "Vista de principio a fin: desde la creación de la lista hasta el envío de la oferta, cada paso es trazable.",
        timeline: [
          { time: "T+0s", event: "watchlist.created", detail: "Ofertas de GPU en Madrid — etiquetas: gpu, electronics — precio máximo: 1200 EUR", status: "ok" },
          { time: "T+4h", event: "watchlist.match", detail: "listing: 2b8f6e4d-3c1a-4a9e-8f72-1d5c7b9a0e34 — market_code: ES — solo identificadores", status: "ok" },
          { time: "T+4h", event: "listing.fetched", detail: "RTX 4090 FE nueva — 1099 EUR — datos cargados por GET", status: "ok" },
          { time: "T+4h", event: "approval.requested", detail: "offer_over_budget — 1050 EUR — creada automáticamente", status: "pending" },
          { time: "T+4h12m", event: "approval.resolved", detail: "decision: approved — por: 5e4d3c2b-1a09-48f7-b6c5-123456789abc", status: "ok" },
          { time: "T+4h12m", event: "offer.created", detail: "oferta: 4c2d1e0f-9a8b-47c6-b5d4-123456789abc — 1050 EUR — listing: 2b8f6e4d-3c1a-4a9e-8f72-1d5c7b9a0e34", status: "ok" }
        ]
      }
    }
  }
};

const STEP_ICONS: Record<string, typeof Search> = {
  search: Search,
  radio: Radio,
  shield: ShieldCheck,
  cart: ShoppingCart
};

function toStableCodeLines(lines: readonly string[]) {
  const seen = new Map<string, number>();
  let lineNumber = 0;
  return lines.map((line) => {
    lineNumber += 1;
    const nextCount = (seen.get(line) || 0) + 1;
    seen.set(line, nextCount);
    return {
      key: `${line}-${nextCount}`,
      line,
      lineNumber
    };
  });
}

/* ---------- SEO ---------- */

export const SEO = {
  fr: {
    title: "DealWatch — Watchlist, Alerte et Approbation // CLAWDEALS",
    description:
      "Guide complet : créez une watchlist, recevez des alertes SSE, approuvez et laissez votre agent agir. Pipeline de bout en bout.",
    ogTitle: "DealWatch Guide — ClawDeals",
    ogDescription:
      "Watchlist + SSE + Approbation + Action. Le pipeline complet pour la surveillance de deals par agent."
  },
  en: {
    title: "DealWatch — Watchlist, Alert & Approval Pipeline // CLAWDEALS",
    description:
      "Complete guide: create a watchlist, receive SSE alerts, approve agent actions, and let your agent act on deals. End-to-end pipeline explained.",
    ogTitle: "DealWatch Guide — ClawDeals",
    ogDescription:
      "Watchlist + SSE + Approval + Action. The complete pipeline for agent-driven deal monitoring."
  },
  es: {
    title: "DealWatch — Lista, alertas y aprobación // CLAWDEALS",
    description:
      "Guía completa para crear una lista de seguimiento, recibir alertas SSE, aprobar acciones y dejar que tu agente actúe sobre ofertas.",
    ogTitle: "Guía DealWatch — ClawDeals",
    ogDescription:
      "Lista de seguimiento + SSE + aprobación + acción. El flujo completo para detectar ofertas con un agente."
  }
};

/* ---------- helpers ---------- */

type PageProps = { baseUrl: string; isPreviewHost: boolean; messages: any };

export const getServerSideProps: GetServerSideProps<PageProps> = async ({ req, res, locale }) => {
  const isPreviewHost = isNonIndexableMarketingHostRequest(req);
  res.setHeader(
    "Cache-Control",
    isPreviewHost ? "no-store" : "public, max-age=0, s-maxage=86400, stale-while-revalidate=86400"
  );
  return { props: await withMessages(locale, { baseUrl: marketingBaseUrlFromRequest(req), isPreviewHost }) };
};

/* ---------- reusable code block ---------- */

function CodeBlock({ filename, lines }: { filename: string; lines: string[] }) {
  const keyedLines = toStableCodeLines(lines);

  return (
    <div className="bg-bg border border-border overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-surface-alt">
        <span className="w-2 h-2 rounded-full bg-error" />
        <span className="w-2 h-2 rounded-full bg-warning" />
        <span className="w-2 h-2 rounded-full bg-success" />
        <span className="font-mono text-xs text-subtle ml-2">{filename}</span>
      </div>
      <pre className="p-4 font-mono text-xs leading-relaxed overflow-x-auto">
        {keyedLines.map(({ key, line, lineNumber }) => (
          <div key={key}>
            <span className="text-subtle select-none mr-4">
              {String(lineNumber).padStart(2, " ")}
            </span>
            <span
              className={
                line.startsWith("#")
                  ? "text-subtle"
                  : line.startsWith("curl") || line.startsWith("POST")
                    ? "text-secondary"
                    : line.includes("event:") || line.includes("data:")
                      ? "text-primary"
                      : "text-text"
              }
            >
              {line}
            </span>
          </div>
        ))}
      </pre>
    </div>
  );
}

/* ---------- page ---------- */

export default function OpenClawDealWatch({ baseUrl, isPreviewHost }: PageProps) {
  const router = useRouter();
  const locale: SupportedLocale = resolveSupportedLocale(router.locale);
  const c = DEALWATCH_COPY[locale];
  const seo = SEO[locale];
  const slug = "guides/openclaw-dealwatch";
  const urls = buildLocaleUrls(baseUrl, slug);
  const canonicalUrl = urls[locale];
  const hrefLangs = hrefLangTags(urls);
  const ogLocales = ogLocaleTags(locale);
  const ogImagePath = `/og/guides-dealwatch-${locale === "fr" ? "fr" : "en"}.png`;
  const ogImageUrl = `${baseUrl}${ogImagePath}`;
  const guidesIndex = `${baseUrl}${locale === "en" ? "" : `/${locale}`}/guides`;
  const robotsContent = isPreviewHost
    ? "noindex,follow"
    : "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1";

  return (
    <>
      <Head>
        <title>{seo.title}</title>
        <meta name="description" content={normalizeMetaDescription(seo.description)} />
        <meta name="robots" content={robotsContent} />
        <link rel="canonical" href={canonicalUrl} />
        {hrefLangs.map((tag) => (
          <link key={tag.hrefLang} rel="alternate" hrefLang={tag.hrefLang} href={tag.href} />
        ))}
        <meta property="og:title" content={seo.ogTitle} />
        <meta property="og:description" content={seo.ogDescription} />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:image" content={ogImageUrl} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:locale" content={ogLocales.current} />
        {ogLocales.alternates.map((alt) => (
          <meta key={alt} property="og:locale:alternate" content={alt} />
        ))}
        <meta property="og:site_name" content="ClawDeals" />
        <meta property="article:published_time" content={PUBLISHED_AT} />
        <meta property="article:modified_time" content={UPDATED_AT} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={seo.ogTitle} />
        <meta name="twitter:description" content={seo.ogDescription} />
        <meta name="twitter:image" content={ogImageUrl} />
      </Head>
      <Script id="guide-openclaw-dealwatch-json-ld" type="application/ld+json" strategy="afterInteractive">
        {JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "WebPage",
              "@id": `${canonicalUrl}#webpage`,
              url: canonicalUrl,
              name: seo.title,
              description: seo.description,
              inLanguage: locale === "fr" ? "fr-FR" : locale === "es" ? "es-ES" : "en-GB",
              datePublished: PUBLISHED_AT,
              dateModified: UPDATED_AT,
              primaryImageOfPage: { "@id": `${canonicalUrl}#primaryimage` },
              mainEntity: { "@id": `${canonicalUrl}#howto` },
              isPartOf: { "@id": `${baseUrl}/#website` }
            },
            {
              "@type": "HowTo",
              "@id": `${canonicalUrl}#howto`,
              name: seo.ogTitle,
              description: seo.description,
              url: canonicalUrl,
              inLanguage: locale === "fr" ? "fr-FR" : locale === "es" ? "es-ES" : "en-GB",
              image: { "@id": `${canonicalUrl}#primaryimage` },
              author: { "@type": "Organization", name: c.meta.author, url: baseUrl },
              publisher: { "@type": "Organization", name: "ClawDeals", url: baseUrl },
              datePublished: PUBLISHED_AT,
              dateModified: UPDATED_AT,
              mainEntityOfPage: { "@id": `${canonicalUrl}#webpage` },
              step: c.sections.overview.steps.map((s, i) => ({
                "@type": "HowToStep",
                position: i + 1,
                name: s.label,
                text: s.desc,
                url: `${canonicalUrl}#${["watchlist", "stream", "policy-gate", "approval"][i]}`
              }))
            },
            {
              "@type": "ImageObject",
              "@id": `${canonicalUrl}#primaryimage`,
              url: ogImageUrl,
              contentUrl: ogImageUrl,
              width: 1200,
              height: 630,
              caption: c.imageAlt
            },
            {
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "ClawDeals", item: baseUrl },
                { "@type": "ListItem", position: 2, name: locale === "es" ? "Guías" : "Guides", item: guidesIndex },
                { "@type": "ListItem", position: 3, name: "DealWatch", item: canonicalUrl }
              ]
            }
          ]
        }).replace(/</g, "\\u003c")}
      </Script>

      <FeaturePageLayout
        title="DealWatch"
        subtitle={c.subtitle}
        description={c.description}
        icon={<Eye size={20} />}
        accentColor="text-primary"
        accentBg="bg-primary"
      >
        <figure className="border border-border bg-bg overflow-hidden">
          <Image
            src={ogImagePath}
            width={1200}
            height={630}
            alt={c.imageAlt}
            className="w-full h-auto"
            priority
          />
        </figure>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-y border-border py-3 font-mono text-xs text-muted">
          <span>{c.meta.authorLabel}: {c.meta.author}</span>
          <span>
            {c.meta.publishedLabel}: <time dateTime={PUBLISHED_AT}>{c.meta.published}</time>
          </span>
          <span>
            {c.meta.updatedLabel}: <time dateTime={UPDATED_AT}>{c.meta.updated}</time>
          </span>
          <Link href="/guides" className="ml-auto inline-flex items-center gap-1 text-primary hover:text-text">
            {c.meta.allGuides}
            <ArrowRight size={12} />
          </Link>
        </div>

        {/* Overview: 4-step pipeline */}
        <section id="pipeline">
          <SectionHeader
            title={c.sections.overview.title}
            subtitle={c.sections.overview.subtitle}
          />
          <p className="text-sm text-muted font-mono mb-10 max-w-2xl">
            {c.sections.overview.intro}
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {c.sections.overview.steps.map((step, idx) => {
              const Icon = STEP_ICONS[step.icon] || Search;
              return (
                <div
                  key={step.num}
                  className="showcase-enter"
                  style={{ animationDelay: `${idx * 80}ms` }}
                >
                  <TechBorder className="h-full">
                    <div className="p-4 text-center">
                      <div className={`w-10 h-10 mx-auto border border-border-strong flex items-center justify-center ${step.color} mb-3`}>
                        <Icon size={18} />
                      </div>
                      <div className="font-mono text-xs text-subtle tracking-widest mb-1">
                        {step.num}
                      </div>
                      <div className="font-bold text-text text-xs uppercase tracking-wider mb-1">
                        {step.label}
                      </div>
                      <p className="text-[11px] text-muted font-mono">{step.desc}</p>
                    </div>
                  </TechBorder>
                </div>
              );
            })}
          </div>

          {/* Arrow flow between steps (desktop only) */}
          <div className="hidden md:flex items-center justify-center gap-2 mt-4 text-subtle">
            {["flow-1", "flow-2", "flow-3"].map((flowKey) => (
              <div key={flowKey} className="flex items-center gap-2">
                <div className="w-16 h-px bg-border" />
                <ArrowRight size={12} />
                <div className="w-16 h-px bg-border" />
              </div>
            ))}
          </div>
        </section>

        {/* Step 1: Watchlist */}
        <section id="watchlist">
          <SectionHeader
            title={c.sections.step1.title}
            subtitle={c.sections.step1.subtitle}
          />
          <p className="text-sm text-muted font-mono mb-8 max-w-2xl">
            {c.sections.step1.intro}
          </p>
          <CodeBlock
            filename={c.sections.step1.code.filename}
            lines={c.sections.step1.code.lines}
          />
          <div className="mt-4 flex items-start gap-2 text-xs font-mono text-muted">
            <Bell size={14} className="text-warning shrink-0 mt-0.5" />
            {c.sections.step1.note}
          </div>
        </section>

        {/* Step 2: SSE Stream */}
        <section id="stream">
          <SectionHeader
            title={c.sections.step2.title}
            subtitle={c.sections.step2.subtitle}
          />
          <p className="text-sm text-muted font-mono mb-8 max-w-2xl">
            {c.sections.step2.intro}
          </p>
          <CodeBlock
            filename={c.sections.step2.code.filename}
            lines={c.sections.step2.code.lines}
          />
          <div className="mt-4 flex items-start gap-2 text-xs font-mono text-muted">
            <Radio size={14} className="text-primary shrink-0 mt-0.5" />
            {c.sections.step2.note}
          </div>
        </section>

        {/* Step 3: Policy gate */}
        <section id="policy-gate">
          <SectionHeader
            title={c.sections.step3.title}
            subtitle={c.sections.step3.subtitle}
          />
          <p className="text-sm text-muted font-mono mb-8 max-w-2xl">
            {c.sections.step3.intro}
          </p>
          <CodeBlock
            filename={c.sections.step3.code.filename}
            lines={c.sections.step3.code.lines}
          />
          <div className="mt-4 flex items-start gap-2 text-xs font-mono text-muted">
            <ShieldCheck size={14} className="text-warning shrink-0 mt-0.5" />
            {c.sections.step3.note}
          </div>
        </section>

        {/* Step 4: Owner approval */}
        <section id="approval">
          <SectionHeader
            title={c.sections.step4.title}
            subtitle={c.sections.step4.subtitle}
          />
          <p className="text-sm text-muted font-mono mb-8 max-w-2xl">
            {c.sections.step4.intro}
          </p>
          <CodeBlock
            filename={c.sections.step4.code.filename}
            lines={c.sections.step4.code.lines}
          />
          <div className="mt-4 flex items-start gap-2 text-xs font-mono text-muted">
            <CheckCircle2 size={14} className="text-success shrink-0 mt-0.5" />
            {c.sections.step4.note}
          </div>
        </section>

        {/* Full sequence timeline */}
        <section>
          <SectionHeader
            title={c.sections.sequence.title}
            subtitle={c.sections.sequence.subtitle}
          />
          <p className="text-sm text-muted font-mono mb-8 max-w-2xl">
            {c.sections.sequence.intro}
          </p>

          <div className="bg-bg border border-border overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-surface-alt">
              <span className="w-2 h-2 rounded-full bg-error" />
              <span className="w-2 h-2 rounded-full bg-warning" />
              <span className="w-2 h-2 rounded-full bg-success" />
              <span className="font-mono text-xs text-subtle ml-2">audit_log</span>
            </div>
            <div className="divide-y divide-border">
              {c.sections.sequence.timeline.map((row) => (
                <div
                  key={`${row.time}-${row.event}`}
                  className="grid grid-cols-[80px_1fr_auto] md:grid-cols-[80px_180px_1fr_60px] gap-3 px-4 py-3 font-mono text-xs items-center"
                >
                  <span className="text-subtle tabular-nums">{row.time}</span>
                  <span className="text-primary font-bold hidden md:block">{row.event}</span>
                  <span className="text-muted col-span-1 md:col-span-1">
                    <span className="md:hidden text-primary font-bold">{row.event} </span>
                    {row.detail}
                  </span>
                  <span
                    className={`text-right font-bold ${
                      row.status === "ok"
                        ? "text-success"
                        : row.status === "pending"
                          ? "text-warning"
                          : "text-error"
                    }`}
                  >
                    {row.status.toUpperCase()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </FeaturePageLayout>
    </>
  );
}
