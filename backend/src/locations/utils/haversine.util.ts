const EARTH_RADIUS_KM = 6371;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Haversine great-circle distance between two WGS-84 coordinates.
 * Returns distance in kilometres.
 */
export function haversineDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);

  const lat1Rad = toRadians(lat1);
  const lat2Rad = toRadians(lat2);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(dLng / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_KM * c;
}

/**
 * Implied ground speed in km/h from distance and elapsed time.
 */
export function calculateSpeedKmh(distanceKm: number, elapsedMs: number): number {
  if (elapsedMs <= 0) {
    return distanceKm > 0 ? Number.POSITIVE_INFINITY : 0;
  }

  const elapsedHours = elapsedMs / (1000 * 60 * 60);
  return distanceKm / elapsedHours;
}
