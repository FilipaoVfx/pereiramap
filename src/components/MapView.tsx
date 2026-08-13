import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { ScatterplotLayer } from "@deck.gl/layers";
import { useMapStore } from "../store/mapStore";
import { computeFreshness, FRESHNESS_COLOR } from "../lib/status";
import { useNow } from "../hooks/useNow";

const DARK_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

function hexToRgb(hex: string): [number, number, number] {
  const v = hex.replace("#", "");
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}

const COLOR_RGB = {
  LIVE: hexToRgb(FRESHNESS_COLOR.LIVE),
  RECENT: hexToRgb(FRESHNESS_COLOR.RECENT),
  STALE: hexToRgb(FRESHNESS_COLOR.STALE),
  UNKNOWN: hexToRgb(FRESHNESS_COLOR.UNKNOWN),
};

export default function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);

  const observations = useMapStore((s) => s.observations);
  const selectedObservationId = useMapStore((s) => s.selectedObservationId);
  const selectObservation = useMapStore((s) => s.selectObservation);
  const viewport = useMapStore((s) => s.viewport);
  const now = useNow(3000);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: DARK_STYLE,
      center: [viewport.longitude, viewport.latitude],
      zoom: viewport.zoom,
      attributionControl: { compact: true },
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");
    map.addControl(new maplibregl.GeolocateControl({ trackUserLocation: true }), "bottom-right");

    const overlay = new MapboxOverlay({ layers: [] });
    map.addControl(overlay as unknown as maplibregl.IControl);

    mapRef.current = map;
    overlayRef.current = overlay;

    return () => {
      map.remove();
      mapRef.current = null;
      overlayRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!overlayRef.current) return;

    const layer = new ScatterplotLayer({
      id: "observations",
      data: observations,
      pickable: true,
      stroked: true,
      filled: true,
      radiusUnits: "pixels",
      getPosition: (d) => [d.location.longitude, d.location.latitude],
      getRadius: (d) => (d.id === selectedObservationId ? 11 : 7),
      getFillColor: (d) => {
        const freshness = computeFreshness(d.capturedAt, now);
        const [r, g, b] = COLOR_RGB[freshness];
        return [r, g, b, 220];
      },
      getLineColor: (d) => (d.id === selectedObservationId ? [255, 255, 255, 255] : [11, 15, 20, 200]),
      lineWidthUnits: "pixels",
      getLineWidth: (d) => (d.id === selectedObservationId ? 2.5 : 1.2),
      updateTriggers: {
        getFillColor: [now],
        getRadius: [selectedObservationId],
        getLineColor: [selectedObservationId],
        getLineWidth: [selectedObservationId],
      },
      onClick: ({ object }) => {
        if (object) selectObservation(object.id);
      },
      transitions: {
        getRadius: 150,
      },
    });

    overlayRef.current.setProps({ layers: [layer] });
  }, [observations, selectedObservationId, now, selectObservation]);

  return <div ref={containerRef} className="absolute inset-0" />;
}
