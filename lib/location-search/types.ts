export interface LocationSearchOption {
  id: string;
  label: string;
  subtitle?: string;
  lat: number;
  lng: number;
  source: "demo" | "mapbox";
  anchorPlaceId?: string;
}
