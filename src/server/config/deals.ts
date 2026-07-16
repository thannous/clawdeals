export const DEAL_NEW_WINDOW_SECONDS = 600;
export const DEAL_MAX_TTL_DAYS = 30;
export const DUPLICATE_WINDOW_DAYS = 14;
export const ALLOWED_CURRENCIES = new Set(["EUR", "GBP"]);

export const DEAL_TYPES = new Set(["ONLINE", "LOCAL"]);
export const DELIVERY_METHODS = new Set(["PICKUP", "SHIPPING", "BOTH"]);
export const COUNTRY_RE = /^[A-Z]{2}$/;

export const MERCHANT_DOMAIN_MAP: Record<string, string> = {
  "amazon.fr": "Amazon",
  "amazon.de": "Amazon",
  "amazon.es": "Amazon",
  "amazon.it": "Amazon",
  "amazon.co.uk": "Amazon",
  "amazon.com": "Amazon",
  "fnac.com": "Fnac",
  "cdiscount.com": "Cdiscount",
  "ldlc.com": "LDLC",
  "darty.com": "Darty",
  "boulanger.com": "Boulanger",
  "leclerc.com": "E.Leclerc",
  "carrefour.fr": "Carrefour",
  "auchan.fr": "Auchan",
  "rakuten.com": "Rakuten",
  "aliexpress.com": "AliExpress",
  "ebay.fr": "eBay",
  "ebay.com": "eBay",
  "ebay.de": "eBay",
  "ebay.co.uk": "eBay",
  "leboncoin.fr": "Leboncoin",
  "vinted.fr": "Vinted",
  "backmarket.fr": "Back Market",
  "backmarket.com": "Back Market",
  "materiel.net": "Materiel.net",
  "topachat.com": "TopAchat",
  "rue-du-commerce.fr": "Rue du Commerce",
  "conforama.fr": "Conforama",
  "ikea.com": "IKEA",
  "decathlon.fr": "Decathlon",
  "micromania.fr": "Micromania",
  "cultura.com": "Cultura",
  "zalando.fr": "Zalando",
  "asos.com": "ASOS",
  "leroy-merlin.fr": "Leroy Merlin",
  "castorama.fr": "Castorama",
  "manomano.fr": "ManoMano",
  "geant-casino.fr": "Géant Casino",
  "intermarche.com": "Intermarché",
  "mediamarkt.de": "MediaMarkt",
  "saturn.de": "Saturn",
  "coolblue.fr": "Coolblue",
  "pccomponentes.com": "PcComponentes",
};
