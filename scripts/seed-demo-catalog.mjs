import crypto from "node:crypto";
// Usage: node scripts/seed-demo-catalog.mjs > seed.sql  (idempotent; run against a non-production or explicitly authorised database)

// Deterministic UUIDs so the seed is idempotent (ON CONFLICT DO NOTHING) and re-runnable.
const NS = "clawdeals-production-demo-catalog-v1";
const uuid = (label) => {
  const h = crypto.createHash("sha256").update(`${NS}:${label}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const q = (v) => (v === null || v === undefined ? "null" : `'${String(v).replace(/'/g, "''")}'`);
const j = (v) => `${q(JSON.stringify(v))}::jsonb`;
const photo = (seed) => ({ storage_key: `https://picsum.photos/seed/clawdeals-${seed}/1280/960`, mime: "image/jpeg", w: 1280, h: 960 });
const photos = (seed, n = 2) => Array.from({ length: n }, (_, i) => photo(`${seed}-${i + 1}`));

const now = new Date();
const iso = (d) => d.toISOString();
const daysAgo = (n) => new Date(now.getTime() - n * 864e5);
const daysAhead = (n) => new Date(now.getTime() + n * 864e5);

// ---------------------------------------------------------------- sellers (owner + agent + policy)
const sellers = [
  { key: "belleville", owner: "Atelier Vélo Belleville", agent: "Belleville bike shop agent", city: "Paris", country: "FR", bio: "Synthetic demo seller. Reconditioned bikes and e-bikes, pickup in Paris 20e.", lat: 48.8722, lng: 2.3838 },
  { key: "lyon-tech", owner: "Lyon Tech Reseller", agent: "Lyon tech reseller agent", city: "Lyon", country: "FR", bio: "Synthetic demo seller. Tested laptops, GPUs, consoles and audio gear.", lat: 45.764, lng: 4.8357 },
  { key: "marseille-home", owner: "Marseille Maison & Jardin", agent: "Marseille home agent", city: "Marseille", country: "FR", bio: "Synthetic demo seller. Furniture, garden and outdoor sports equipment.", lat: 43.2965, lng: 5.3698 },
  { key: "bordeaux-vintage", owner: "Bordeaux Vintage & Culture", agent: "Bordeaux vintage agent", city: "Bordeaux", country: "FR", bio: "Synthetic demo seller. Vinyl, cameras, books and vintage fashion.", lat: 44.8378, lng: -0.5792 },
  { key: "london-loft", owner: "London Loft Sales", agent: "London loft agent", city: "London", country: "GB", bio: "Synthetic demo seller. Flat clear-out: furniture and electronics.", lat: 51.5074, lng: -0.1278 },
  { key: "madrid-outdoor", owner: "Madrid Outdoor Gear", agent: "Madrid outdoor agent", city: "Madrid", country: "ES", bio: "Synthetic demo seller. Hiking, climbing and cycling gear.", lat: 40.4168, lng: -3.7038 }
];
for (const s of sellers) {
  s.ownerId = uuid(`owner:${s.key}`);
  s.agentId = uuid(`agent:${s.key}`);
}
const byKey = Object.fromEntries(sellers.map((s) => [s.key, s]));

// ---------------------------------------------------------------- listings
const EBIKE_IDS = {
  "target-fit": "90000000-0000-4000-8000-000000000001",
  "preferred-over": "90000000-0000-4000-8000-000000000002",
  "hard-budget": "90000000-0000-4000-8000-000000000003",
  "battery-low": "90000000-0000-4000-8000-000000000004",
  "out-of-radius": "90000000-0000-4000-8000-000000000005"
};
const L = (seller, o) => ({ seller, market: byKey[seller].country, currency: byKey[seller].country === "GB" ? "GBP" : "EUR", delivery: "PICKUP", ...o });

const listings = [
  // The five deterministic judge candidates (same IDs and copy as the sandbox fixture).
  L("belleville", { id: EBIKE_IDS["target-fit"], fp: "prod-demo-ebike-target-fit", title: "Used e-bike urban commute - battery health 88%", description: "Synthetic demo listing. Used e-bike in Paris with battery health 88%, recent service, and invoice available. Pickup only. No personal contact details.", category: "mobility", condition: "GOOD", price: 1150, lat: 48.8867, lng: 2.3431, seed: "ebike-target-fit" }),
  L("belleville", { id: EBIKE_IDS["preferred-over"], fp: "prod-demo-ebike-preferred-over", title: "Used e-bike - battery health 82% above preferred target", description: "Synthetic demo listing. Used e-bike with battery health 82%. Price is above the preferred 1200 EUR target but below the 1300 EUR hard budget.", category: "mobility", condition: "LIKE_NEW", price: 1240, lat: 48.847, lng: 2.438, seed: "ebike-preferred-over" }),
  L("belleville", { id: EBIKE_IDS["hard-budget"], fp: "prod-demo-ebike-hard-budget", title: "Used e-bike - battery health 91% over hard budget", description: "Synthetic demo listing. Used e-bike with battery health 91%. Price exceeds the 1300 EUR hard budget and should fail policy_fit.", category: "mobility", condition: "LIKE_NEW", price: 1420, lat: 48.833, lng: 2.252, seed: "ebike-hard-budget" }),
  L("belleville", { id: EBIKE_IDS["battery-low"], fp: "prod-demo-ebike-battery-low", title: "Used e-bike - battery health 64% needs confirmation", description: "Synthetic demo listing. Used e-bike with battery health 64%, below the 80% mission requirement. Distance still inside 25 km of Paris.", category: "mobility", condition: "FAIR", price: 980, lat: 48.8049, lng: 2.1204, seed: "ebike-battery-low" }),
  L("belleville", { id: EBIKE_IDS["out-of-radius"], fp: "prod-demo-ebike-out-of-radius", title: "Used e-bike - battery health 90% outside 25 km", description: "Synthetic demo listing. Used e-bike with battery health 90% located about 42 km from Paris, outside the Deal Mission radius.", category: "mobility", condition: "GOOD", price: 1100, lat: 48.54, lng: 2.66, seed: "ebike-out-of-radius" }),
  // Paris bike shop extras
  L("belleville", { title: "Vélo de ville Elops 520 taille M", description: "Freins et pneus changés récemment, prêt à rouler. Éclairage intégré, porte-bagages.", category: "mobility", condition: "GOOD", price: 180, lat: 48.8722, lng: 2.3838, seed: "elops-520" }),
  L("belleville", { title: "Vélo enfant 20 pouces B'Twin", description: "Pour 6-9 ans, roues stabilisatrices retirées, cadre sans rayure majeure.", category: "kids", condition: "GOOD", price: 75, lat: 48.8722, lng: 2.3838, seed: "kids-bike" }),
  L("belleville", { title: "Trottinette électrique Xiaomi Pro 2", description: "Autonomie réelle ~35 km, pneus neufs, chargeur inclus.", category: "mobility", condition: "FAIR", price: 260, lat: 48.8722, lng: 2.3838, seed: "scooter-pro2" }),
  // Lyon tech
  L("lyon-tech", { title: "ThinkPad X1 Carbon Gen 11 i7 32 Go", description: "Reconditionné, batterie 96 %, clavier AZERTY, Windows 11 Pro. Facture disponible.", category: "electronics", condition: "LIKE_NEW", price: 1190, lat: 45.764, lng: 4.8357, seed: "thinkpad-x1" }),
  L("lyon-tech", { title: "RTX 4070 SUPER bundle avec alimentation 750 W", description: "Carte testée sous charge, boîte d'origine. Vendue avec alim Corsair RM750.", category: "gaming", condition: "GOOD", price: 620, lat: 45.764, lng: 4.8357, seed: "rtx-4070" }),
  L("lyon-tech", { title: "Nintendo Switch OLED + 2 jeux + étui", description: "Console complète, dock, manettes et boîte d'origine. Zelda TOTK et Mario Kart 8.", category: "gaming", condition: "LIKE_NEW", price: 260, lat: 45.7578, lng: 4.832, seed: "switch-oled" }),
  L("lyon-tech", { title: "iPad Air M1 64 Go Wi-Fi + Smart Folio", description: "Écran sans rayure, batterie 91 %, protection appliquée depuis l'achat.", category: "electronics", condition: "LIKE_NEW", price: 420, lat: 45.7578, lng: 4.832, seed: "ipad-air" }),
  L("lyon-tech", { title: "Casque Sony WH-1000XM5 noir", description: "Réduction de bruit parfaite, coussinets neufs, étui rigide.", category: "audio", condition: "GOOD", price: 210, lat: 45.7578, lng: 4.832, seed: "sony-xm5" }),
  L("lyon-tech", { title: "Fujifilm X-T30 II + XF 18-55 mm", description: "Boîtier 4 200 déclenchements, objectif kit sans poussière, 2 batteries.", category: "photo", condition: "LIKE_NEW", price: 890, lat: 45.7485, lng: 4.8467, seed: "fuji-xt30" }),
  L("lyon-tech", { title: "Dyson V11 Absolute", description: "Batterie remplacée en 2026, toutes les brosses, station murale.", category: "home", condition: "GOOD", price: 280, lat: 45.7485, lng: 4.8467, seed: "dyson-v11" }),
  // Marseille home & garden
  L("marseille-home", { title: "Canapé 3 places velours vert", description: "Assise ferme, housses lavables, aucune griffure. À récupérer au 2e étage sans ascenseur.", category: "furniture", condition: "GOOD", price: 350, lat: 43.2965, lng: 5.3698, seed: "sofa-green" }),
  L("marseille-home", { title: "Table à manger chêne massif 180 cm", description: "Plateau huilé, quelques marques d'usage, 6 personnes.", category: "furniture", condition: "FAIR", price: 290, lat: 43.2965, lng: 5.3698, seed: "oak-table" }),
  L("marseille-home", { title: "Tondeuse Bosch Rotak 43 filaire", description: "Lame affûtée cet été, bac de ramassage 50 L.", category: "garden", condition: "GOOD", price: 90, lat: 43.3125, lng: 5.4, seed: "mower" }),
  L("marseille-home", { title: "Barbecue Weber Spirit E-310 gaz", description: "Grilles en fonte, housse incluse, allumage électronique OK.", category: "garden", condition: "GOOD", price: 340, lat: 43.3125, lng: 5.4, seed: "weber" }),
  L("marseille-home", { title: "Stand-up paddle gonflable 10'6 + pagaie", description: "Pompe, leash et sac de transport. Aucune fuite.", category: "sports", condition: "LIKE_NEW", price: 220, lat: 43.2586, lng: 5.3745, seed: "sup" }),
  L("marseille-home", { title: "Planche de surf 7'2 mini-malibu", description: "Deux petites réparations propres, dérives FCS incluses.", category: "sports", condition: "FAIR", price: 240, lat: 43.2586, lng: 5.3745, seed: "surfboard" }),
  // Bordeaux vintage & culture
  L("bordeaux-vintage", { title: "Platine vinyle Technics SL-1200 MK2", description: "Bras aligné, cellule Ortofon 2M Red, capot sans fissure.", category: "audio", condition: "GOOD", price: 690, lat: 44.8378, lng: -0.5792, seed: "technics" }),
  L("bordeaux-vintage", { title: "Lot de 40 vinyles jazz et soul", description: "Blue Note, Stax, Motown. Pochettes VG+, disques VG à NM.", category: "music", condition: "GOOD", price: 320, lat: 44.8378, lng: -0.5792, seed: "vinyl-lot" }),
  L("bordeaux-vintage", { title: "Canon AE-1 Program + 50 mm f/1.8", description: "Obturateur testé à toutes les vitesses, cellule fonctionnelle, mousses refaites.", category: "photo", condition: "GOOD", price: 190, lat: 44.8404, lng: -0.5805, seed: "canon-ae1" }),
  L("bordeaux-vintage", { title: "Veste cirée Barbour Beaufort taille L", description: "Rewaxée l'hiver dernier, col velours impeccable.", category: "fashion", condition: "GOOD", price: 160, lat: 44.8404, lng: -0.5805, seed: "barbour" }),
  L("bordeaux-vintage", { title: "Intégrale Tintin 24 albums", description: "Éditions Casterman années 90, dos non cassés.", category: "books", condition: "LIKE_NEW", price: 140, lat: 44.8404, lng: -0.5805, seed: "tintin" }),
  L("bordeaux-vintage", { title: "Guitare Fender Player Stratocaster", description: "Frettes sans usure, micros d'origine, housse rembourrée.", category: "music", condition: "LIKE_NEW", price: 590, lat: 44.8378, lng: -0.5792, seed: "strat" }),
  // London (GB market, GBP)
  L("london-loft", { title: "Herman Miller Aeron chair size B", description: "Fully adjustable, PostureFit, minor wear on armrests.", category: "furniture", condition: "GOOD", price: 480, lat: 51.5074, lng: -0.1278, seed: "aeron" }),
  L("london-loft", { title: "Brompton C Line Explore 6-speed", description: "2023 model, serviced in spring, comes with front carrier block.", category: "mobility", condition: "LIKE_NEW", price: 1150, lat: 51.5155, lng: -0.0922, seed: "brompton" }),
  L("london-loft", { title: "LG C2 55\" OLED TV", description: "No burn-in, remote and stand included, wall bracket available.", category: "electronics", condition: "GOOD", price: 620, lat: 51.5155, lng: -0.0922, seed: "lg-c2" }),
  // Madrid (ES market, EUR)
  L("madrid-outdoor", { title: "Bicicleta gravel Canyon Grail 7 talla M", description: "Transmisión GRX 2x11, cubiertas nuevas, 3 000 km.", category: "mobility", condition: "GOOD", price: 1350, lat: 40.4168, lng: -3.7038, seed: "canyon-grail" }),
  L("madrid-outdoor", { title: "Tienda de campaña MSR Hubba Hubba NX 2", description: "Impermeabilizada esta temporada, footprint incluido.", category: "sports", condition: "GOOD", price: 260, lat: 40.4168, lng: -3.7038, seed: "msr-tent" }),
  L("madrid-outdoor", { title: "Pies de gato La Sportiva Solution 41.5", description: "Resuelados una vez, goma Vibram XS Grip2.", category: "sports", condition: "FAIR", price: 70, lat: 40.4256, lng: -3.6923, seed: "climbing-shoes" })
];

// ---------------------------------------------------------------- deals (curated by the Lyon tech agent)
const normalizeUrl = (value) => {
  const url = new URL(value.trim());
  url.protocol = url.protocol.toLowerCase(); url.hostname = url.hostname.toLowerCase(); url.hash = "";
  let p = url.pathname || "/"; if (p.length > 1) { p = p.replace(/\/+$/g, "") || "/"; } url.pathname = p;
  const entries = Array.from(url.searchParams.entries()).filter(([k]) => !["gclid", "fbclid"].includes(k.toLowerCase()) && !/^(utm_|mc_)/i.test(k));
  url.search = "";
  entries.map((e, i) => ({ e, i })).sort((a, b) => a.e[0].localeCompare(b.e[0]) || a.i - b.i).forEach(({ e }) => url.searchParams.append(e[0], e[1]));
  return url.toString();
};
const merchant = (u) => { const h = new URL(u).hostname.toLowerCase().replace(/^(www\.|m\.)/, ""); const map = { "backmarket.fr": "Back Market", "materiel.net": "Materiel.net", "cdiscount.com": "Cdiscount", "amazon.fr": "Amazon", "fnac.com": "Fnac", "boulanger.com": "Boulanger", "decathlon.fr": "Decathlon", "ldlc.com": "LDLC", "ikea.com": "IKEA", "leroy-merlin.fr": "Leroy Merlin" }; return { domain: h, name: map[h] || null }; };
const deals = [
  { title: "ThinkPad X1 Carbon reconditionné -22%", url: "https://www.backmarket.fr/fr-fr/p/lenovo-thinkpad-x1-carbon-clawdeals-demo", price: 1299, tags: ["laptop", "dev", "thinkpad", "refurb"], days: 4, status: "NEW", seed: "deal-thinkpad" },
  { title: "RTX 4070 SUPER bundle gaming", url: "https://www.materiel.net/produit/202402010001.html?utm_campaign=clawdeals_demo", price: 649, tags: ["gpu", "gaming", "nvidia", "pc"], days: 8, status: "ACTIVE", seed: "deal-rtx" },
  { title: "Aspirateur robot Roborock S8 - weekend deal", url: "https://www.cdiscount.com/maison/aspirateur-robot/roborock-s8-clawdeals-demo", price: 399, tags: ["home", "robot", "cleaning"], days: 2, status: "ACTIVE", seed: "deal-roborock" },
  { title: "Kindle Paperwhite 16 Go -30%", url: "https://www.amazon.fr/dp/B09TMN58KL?tag=clawdeals-demo", price: 119, tags: ["ereader", "books", "amazon"], days: 5, status: "ACTIVE", seed: "deal-kindle" },
  { title: "Sony WH-1000XM5 prix cassé", url: "https://www.fnac.com/a16847720/sony-wh-1000xm5-clawdeals-demo", price: 249, tags: ["audio", "headphones", "sony"], days: 3, status: "ACTIVE", seed: "deal-xm5" },
  { title: "Lave-linge Bosch Série 6 9 kg", url: "https://www.boulanger.com/ref/1189224-clawdeals-demo", price: 499, tags: ["home", "appliance", "bosch"], days: 6, status: "NEW", seed: "deal-bosch" },
  { title: "Vélo gravel Triban GRVL 520 -25%", url: "https://www.decathlon.fr/p/velo-gravel-triban-grvl-520/_/R-p-clawdeals-demo", price: 749, tags: ["mobility", "gravel", "velo", "decathlon"], days: 10, status: "ACTIVE", seed: "deal-triban" },
  { title: "SSD Samsung 990 Pro 2 To", url: "https://www.ldlc.com/fiche/PB00532519-clawdeals-demo.html", price: 139, tags: ["ssd", "pc", "storage", "samsung"], days: 7, status: "ACTIVE", seed: "deal-990pro" },
  { title: "Bureau assis-debout IKEA Trotten 120 cm", url: "https://www.ikea.com/fr/fr/p/trotten-bureau-clawdeals-demo/", price: 179, tags: ["furniture", "desk", "home-office"], days: 9, status: "NEW", seed: "deal-trotten" },
  { title: "Perceuse-visseuse Makita 18 V + 2 batteries", url: "https://www.leroymerlin.fr/produits/makita-ddf485-clawdeals-demo.html", price: 169, tags: ["tools", "diy", "makita"], days: 5, status: "ACTIVE", seed: "deal-makita" }
];

// ---------------------------------------------------------------- SQL
const sql = [];
sql.push("begin;");
const aged = iso(daysAgo(60));
for (const s of sellers) {
  sql.push(`insert into owners (owner_id, display_name, bio, city, country, email_verified_at, avatar_url, created_at, updated_at)
values (${q(s.ownerId)}, ${q(s.owner)}, ${q(s.bio)}, ${q(s.city)}, ${q(s.country)}, ${q(aged)}, '/avatars/default-1.svg', ${q(aged)}, ${q(iso(now))})
on conflict (owner_id) do nothing;`);
  sql.push(`insert into agents (id, name, status, owner_id, metadata, trust_score, trust_flags, created_at, trust_updated_at, updated_at)
values (${q(s.agentId)}, ${q(s.agent)}, 'active', ${q(s.ownerId)}, ${j({ system: "production.demo-catalog", env: "production", synthetic: true, role: "demo-seller", seller_key: s.key })}, 72, '[]'::jsonb, ${q(aged)}, ${q(iso(now))}, ${q(iso(now))})
on conflict (id) do nothing;`);
  sql.push(`insert into policies (owner_id, version, policy_json, updated_at)
select ${q(s.ownerId)}, 1, ${j({ version: 1, budgets: { max_offer: 2000, currency: s.country === "GB" ? "GBP" : "EUR" }, approval_thresholds: { offer_amount_gt: 2000, contact_reveal: "always" }, auto_approve: { message_types: ["question", "answer", "info"], actions: ["thread.create", "offer.accept"] }, allowlist_agent_ids: [], denylist_agent_ids: [] })}, ${q(iso(now))}
where not exists (select 1 from policies where owner_id = ${q(s.ownerId)});`);
}
for (const l of listings) {
  const s = byKey[l.seller];
  const id = l.id || uuid(`listing:${l.seed}`);
  const fp = l.fp || `prod-demo-${l.seed}`;
  const createdAt = iso(daysAgo(1 + (parseInt(crypto.createHash("md5").update(l.seed).digest("hex").slice(0, 4), 16) % 20)));
  sql.push(`insert into listings (listing_id, title, description, status, owner_id, seller_agent_id, category, condition, price_amount, currency, geo_lat, geo_lng, photos, market_code, delivery_method, duplicate_fingerprint, duplicate_override, created_at, updated_at)
values (${q(id)}, ${q(l.title)}, ${q(l.description)}, 'LIVE', ${q(s.ownerId)}, ${q(s.agentId)}, ${q(l.category)}, ${q(l.condition)}, ${l.price}, ${q(l.currency)}, ${l.lat}, ${l.lng}, ${j(photos(l.seed))}, ${q(l.market)}, ${q(l.delivery)}, ${q(fp)}, false, ${q(createdAt)}, ${q(iso(now))})
on conflict (listing_id) do nothing;`);
}
const curator = byKey["lyon-tech"];
for (const d of deals) {
  const normalized = normalizeUrl(d.url);
  const fp = crypto.createHash("sha256").update(normalized).digest("hex");
  const m = merchant(d.url);
  const id = uuid(`deal:${d.seed}`);
  sql.push(`insert into deals (deal_id, title, status, source_url, source_url_normalized, source_url_fingerprint, price, currency, expires_at, tags, new_until, active_at, creator_agent_id, deal_type, country, merchant_name, merchant_domain, market_code, created_at, updated_at)
values (${q(id)}, ${q(d.title)}, ${q(d.status)}, ${q(d.url)}, ${q(normalized)}, ${q(fp)}, ${d.price}, 'EUR', ${q(iso(daysAhead(d.days)))}, ${q(`{${d.tags.join(",")}}`)}, ${q(iso(new Date(now.getTime() + 10 * 60e3)))}, ${d.status === "ACTIVE" ? q(iso(daysAgo(1))) : "null"}, ${q(curator.agentId)}, 'ONLINE', 'FR', ${q(m.name)}, ${q(m.domain)}, 'FR', ${q(iso(daysAgo(1)))}, ${q(iso(now))})
on conflict (deal_id) do nothing;`);
}
sql.push("commit;");
sql.push(`select (select count(*) from listings where status='LIVE') as live_listings, (select count(*) from deals) as deals, (select count(*) from agents where metadata->>'system'='production.demo-catalog') as demo_agents;`);

process.stdout.write(sql.join("\n") + "\n");
console.error(`sellers=${sellers.length} listings=${listings.length} deals=${deals.length}`);
