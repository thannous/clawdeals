import {
  Configuration,
  DealsApi,
  ListingsApi,
  OffersApi,
  WatchlistsApi
} from "../generated";
import type {
  DealCreateRequestV1,
  ListingCreateRequestV1,
  OfferCreateRequestV1,
  WatchlistCreateRequestV1
} from "../generated";
import { createClawdealsFetch } from "./http";
import type { FetchLike, Logger } from "./http";

export type ClawdealsClientOptions = {
  baseUrl?: string;
  apiKey?: string;
  apiKeyHeader?: string;
  fetch?: FetchLike;
  retries?: number;
  retryDelayMs?: number;
  maxRetryDelayMs?: number;
  logger?: Logger;
};

export type IdempotencyOptions = {
  idempotencyKey?: string;
};

export class ClawdealsClient {
  readonly configuration: Configuration;

  // Most common public resources.
  readonly deals: DealsApi;
  readonly watchlists: WatchlistsApi;
  readonly listings: ListingsApi;
  readonly offers: OffersApi;

  constructor(options: ClawdealsClientOptions = {}) {
    const fetchApi = createClawdealsFetch({
      fetch: options.fetch,
      apiKeyBearer: options.apiKey,
      apiKeyHeader: options.apiKeyHeader,
      retries: options.retries,
      retryDelayMs: options.retryDelayMs,
      maxRetryDelayMs: options.maxRetryDelayMs,
      logger: options.logger
    });

    this.configuration = new Configuration({
      basePath: options.baseUrl,
      fetchApi,
      accessToken: options.apiKey ? async () => options.apiKey! : undefined,
      apiKey: options.apiKeyHeader ? async () => options.apiKeyHeader! : undefined
    });

    this.deals = new DealsApi(this.configuration);
    this.watchlists = new WatchlistsApi(this.configuration);
    this.listings = new ListingsApi(this.configuration);
    this.offers = new OffersApi(this.configuration);
  }

  async postDeal(body: DealCreateRequestV1, opts: IdempotencyOptions = {}) {
    return await this.deals.v1DealsCreate({
      dealCreateRequestV1: body,
      idempotencyKey: opts.idempotencyKey
    });
  }

  async createWatchlist(body: WatchlistCreateRequestV1, opts: IdempotencyOptions = {}) {
    return await this.watchlists.v1WatchlistsCreate({
      watchlistCreateRequestV1: body,
      idempotencyKey: opts.idempotencyKey
    });
  }

  async createListing(body: ListingCreateRequestV1, opts: IdempotencyOptions = {}) {
    return await this.listings.v1ListingsCreate({
      listingCreateRequestV1: body,
      idempotencyKey: opts.idempotencyKey
    });
  }

  async createOffer(listingId: string, body: OfferCreateRequestV1, opts: IdempotencyOptions = {}) {
    return await this.offers.v1OffersCreate({
      listingId,
      offerCreateRequestV1: body,
      idempotencyKey: opts.idempotencyKey
    });
  }

  async createListingAndOffer(
    listing: ListingCreateRequestV1,
    offer: OfferCreateRequestV1,
    opts: { listingIdempotencyKey?: string; offerIdempotencyKey?: string } = {}
  ) {
    const createdListing = await this.createListing(listing, { idempotencyKey: opts.listingIdempotencyKey });
    const createdOffer = await this.createOffer(createdListing.listing_id, offer, { idempotencyKey: opts.offerIdempotencyKey });
    return { listing: createdListing, offer: createdOffer };
  }
}

export function createClient(options: ClawdealsClientOptions = {}) {
  return new ClawdealsClient(options);
}

