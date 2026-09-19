import { create } from "zustand";
import type { Observation } from "../types";

export interface Viewport {
  latitude: number;
  longitude: number;
  zoom: number;
}

export const PEREIRA_VIEWPORT: Viewport = {
  latitude: 4.8087,
  longitude: -75.6906,
  zoom: 12.5,
};

interface MapState {
  viewport: Viewport;
  observations: Observation[];
  selectedObservationId: string | null;
  realtimeConnected: boolean;
  lastEventAt: number | null;

  setViewport: (viewport: Partial<Viewport>) => void;
  setObservations: (observations: Observation[]) => void;
  upsertObservation: (observation: Observation) => void;
  selectObservation: (id: string | null) => void;
  setRealtimeConnected: (connected: boolean) => void;
}

export const useMapStore = create<MapState>((set) => ({
  viewport: PEREIRA_VIEWPORT,
  observations: [],
  selectedObservationId: null,
  realtimeConnected: false,
  lastEventAt: null,

  setViewport: (viewport) =>
    set((state) => ({ viewport: { ...state.viewport, ...viewport } })),

  setObservations: (observations) =>
    set({
      observations: [...observations].sort(
        (a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime()
      ),
    }),

  upsertObservation: (observation) =>
    set((state) => {
      const exists = state.observations.some((o) => o.id === observation.id);
      const next = exists
        ? state.observations.map((o) => (o.id === observation.id ? observation : o))
        : [observation, ...state.observations];
      return {
        observations: next.sort(
          (a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime()
        ),
        lastEventAt: Date.now(),
      };
    }),

  selectObservation: (id) => set({ selectedObservationId: id }),
  setRealtimeConnected: (connected) => set({ realtimeConnected: connected }),
}));
