type GeoPoint = { lat: number; lng: number };

type MarketCity = GeoPoint & { name: string };

const MARKET_CITIES: Record<string, MarketCity[]> = {
  FR: [
    { name: "Paris", lat: 48.8566, lng: 2.3522 },
    { name: "Lyon", lat: 45.764, lng: 4.8357 },
    { name: "Marseille", lat: 43.2965, lng: 5.3698 },
    { name: "Lille", lat: 50.6292, lng: 3.0573 },
    { name: "Bordeaux", lat: 44.8378, lng: -0.5792 },
    { name: "Toulouse", lat: 43.6047, lng: 1.4442 },
    { name: "Nantes", lat: 47.2184, lng: -1.5536 },
    { name: "Strasbourg", lat: 48.5734, lng: 7.7521 }
  ],
  GB: [
    { name: "London", lat: 51.5074, lng: -0.1278 },
    { name: "Birmingham", lat: 52.4862, lng: -1.8904 },
    { name: "Manchester", lat: 53.4808, lng: -2.2426 },
    { name: "Liverpool", lat: 53.4084, lng: -2.9916 },
    { name: "Leeds", lat: 53.8008, lng: -1.5491 },
    { name: "Bristol", lat: 51.4545, lng: -2.5879 },
    { name: "Edinburgh", lat: 55.9533, lng: -3.1883 },
    { name: "Glasgow", lat: 55.8642, lng: -4.2518 }
  ],
  ES: [
    { name: "Madrid", lat: 40.4168, lng: -3.7038 },
    { name: "Barcelona", lat: 41.3874, lng: 2.1686 },
    { name: "Valencia", lat: 39.4699, lng: -0.3763 },
    { name: "Seville", lat: 37.3891, lng: -5.9845 },
    { name: "Zaragoza", lat: 41.6488, lng: -0.8891 },
    { name: "Bilbao", lat: 43.263, lng: -2.935 },
    { name: "Malaga", lat: 36.7213, lng: -4.4214 }
  ]
};

function radians(value: number): number {
  return (value * Math.PI) / 180;
}

export function distanceBetweenKm(a: GeoPoint, b: GeoPoint): number | null {
  if (![a.lat, a.lng, b.lat, b.lng].every(Number.isFinite)) return null;
  const earthRadiusKm = 6371;
  const dLat = radians(b.lat - a.lat);
  const dLng = radians(b.lng - a.lng);
  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export function resolveListingLocation(marketCode: unknown, geo: GeoPoint | null | undefined): string {
  const code = typeof marketCode === "string" ? marketCode.trim().toUpperCase() : "";
  if (!code) return "";
  const cities = MARKET_CITIES[code] || [];
  if (!geo || cities.length === 0) return code;

  const closest = cities.reduce<{ city: MarketCity; distance: number } | null>((best, city) => {
    const distance = distanceBetweenKm(geo, city);
    if (distance === null) return best;
    return !best || distance < best.distance ? { city, distance } : best;
  }, null);

  return closest ? `${closest.city.name} · ${code}` : code;
}
