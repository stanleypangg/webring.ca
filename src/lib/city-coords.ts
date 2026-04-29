interface CityCoord {
  readonly lat: number
  readonly lng: number
}

const CITY_COORDS: Readonly<Record<string, CityCoord>> = {
  'Toronto': { lat: 43.65, lng: -79.38 },
  'Vancouver': { lat: 49.28, lng: -123.12 },
  'Montreal': { lat: 45.50, lng: -73.57 },
  'Montréal': { lat: 45.50, lng: -73.57 },
  'Ottawa': { lat: 45.42, lng: -75.70 },
  'Calgary': { lat: 51.05, lng: -114.07 },
  'Edmonton': { lat: 53.55, lng: -113.49 },
  'Winnipeg': { lat: 49.90, lng: -97.14 },
  'Quebec City': { lat: 46.81, lng: -71.21 },
  'Halifax': { lat: 44.65, lng: -63.57 },
  'Victoria': { lat: 48.43, lng: -123.37 },
  'Waterloo': { lat: 43.47, lng: -80.52 },
  'Kitchener': { lat: 43.45, lng: -80.49 },
  'London': { lat: 42.98, lng: -81.25 },
  'Hamilton': { lat: 43.26, lng: -79.87 },
  'Saskatoon': { lat: 52.13, lng: -106.67 },
  'Regina': { lat: 50.45, lng: -104.62 },
  "St. John's": { lat: 47.56, lng: -52.71 },
  'Fredericton': { lat: 45.96, lng: -66.64 },
  'Charlottetown': { lat: 46.24, lng: -63.13 },
  'Whitehorse': { lat: 60.72, lng: -135.06 },
  'Yellowknife': { lat: 62.45, lng: -114.37 },
  'Iqaluit': { lat: 63.75, lng: -68.52 },
  'Mississauga': { lat: 43.59, lng: -79.64 },
  'Brampton': { lat: 43.73, lng: -79.76 },
  'Surrey': { lat: 49.19, lng: -122.85 },
}

export function getCityCoord(city: string): CityCoord | null {
  return CITY_COORDS[city] ?? null
}
