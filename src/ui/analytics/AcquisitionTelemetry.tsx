import { useEffect, useRef } from "react";
import { useRouter } from "next/router";
import {
  ACQUISITION_QUERY_PARAM,
  isAppEntryUrl,
  isMarketingSurface,
  localeToMarketCode,
  normalizeLandingPath,
  resolveAcquisitionAttribution,
  resolveEventLocale,
  type AcquisitionCtaLocation,
  type PublicAcquisitionEventName
} from "../../shared/acquisition";

type PublicEventPayload = {
  acquisition_id: string;
  event_name: PublicAcquisitionEventName;
  landing_path: string;
  locale: string;
  market_code: string;
  source: string;
  medium: string;
  campaign: string | null;
  referrer_host: string | null;
  cta_location: AcquisitionCtaLocation | null;
};

let pageAcquisitionId: string | null = null;

function getPageAcquisitionId() {
  if (!pageAcquisitionId) {
    pageAcquisitionId = globalThis.crypto?.randomUUID?.() || null;
  }
  return pageAcquisitionId;
}

function sendEvent(payload: PublicEventPayload) {
  const body = JSON.stringify(payload);
  if (typeof navigator.sendBeacon === "function") {
    const accepted = navigator.sendBeacon(
      "/api/v1/acquisition/events",
      new Blob([body], { type: "application/json" })
    );
    if (accepted) return;
  }

  void fetch("/api/v1/acquisition/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
    credentials: "same-origin"
  }).catch(() => undefined);
}

export default function AcquisitionTelemetry() {
  const router = useRouter();
  const trackedPathRef = useRef<string | null>(null);
  const contextRef = useRef<{
    acquisitionId: string;
    landingPath: string;
    locale: string;
    marketCode: string;
    source: string;
    medium: string;
    campaign: string | null;
    referrerHost: string | null;
  } | null>(null);

  useEffect(() => {
    if (!router.isReady) return;
    if (!isMarketingSurface(window.location.hostname, window.location.pathname)) return;

    const landingPath = normalizeLandingPath(window.location.pathname);
    const acquisitionId = getPageAcquisitionId();
    if (!landingPath || !acquisitionId) return;

    const locale = resolveEventLocale(router.locale);
    const attribution = resolveAcquisitionAttribution(
      window.location.href,
      document.referrer || null
    );
    contextRef.current = {
      acquisitionId,
      landingPath,
      locale,
      marketCode: localeToMarketCode(locale),
      source: attribution.source,
      medium: attribution.medium,
      campaign: attribution.campaign,
      referrerHost: attribution.referrerHost
    };

    if (trackedPathRef.current === landingPath) return;
    trackedPathRef.current = landingPath;

    const basePayload = {
      acquisition_id: acquisitionId,
      landing_path: landingPath,
      locale,
      market_code: localeToMarketCode(locale),
      source: attribution.source,
      medium: attribution.medium,
      campaign: attribution.campaign,
      referrer_host: attribution.referrerHost,
      cta_location: null
    };
    sendEvent({ ...basePayload, event_name: "landing_view" });
    if (attribution.isOrganic) {
      sendEvent({ ...basePayload, event_name: "organic_entry" });
    }
  }, [router.asPath, router.isReady, router.locale]);

  useEffect(() => {
    function trackAppEntry(event: MouseEvent) {
      const element = event.target instanceof Element ? event.target : null;
      const anchor = element?.closest("a[href]") as HTMLAnchorElement | null;
      const context = contextRef.current;
      if (!anchor || !context) return null;

      let targetUrl: URL;
      try {
        targetUrl = new URL(anchor.href, window.location.href);
      } catch {
        return null;
      }
      if (!isAppEntryUrl(targetUrl)) return null;

      targetUrl.searchParams.set(ACQUISITION_QUERY_PARAM, context.acquisitionId);
      anchor.href = targetUrl.toString();

      const ctaLocation = (
        anchor.dataset.acquisitionCta || "other"
      ) as AcquisitionCtaLocation;
      sendEvent({
        acquisition_id: context.acquisitionId,
        event_name: "connect_cta_clicked",
        landing_path: context.landingPath,
        locale: context.locale,
        market_code: context.marketCode,
        source: context.source,
        medium: context.medium,
        campaign: context.campaign,
        referrer_host: context.referrerHost,
        cta_location: ctaLocation
      });

      return { anchor, targetUrl };
    }

    function onClick(event: MouseEvent) {
      if (event.button !== 0) return;

      const trackedEntry = trackAppEntry(event);
      if (!trackedEntry) return;

      const { anchor, targetUrl } = trackedEntry;

      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        anchor.target === "_blank"
      ) {
        return;
      }

      event.preventDefault();
      window.location.assign(targetUrl.toString());
    }

    function onAuxClick(event: MouseEvent) {
      if (event.button !== 1) return;
      trackAppEntry(event);
    }

    document.addEventListener("click", onClick, true);
    document.addEventListener("auxclick", onAuxClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("auxclick", onAuxClick, true);
    };
  }, []);

  return null;
}
