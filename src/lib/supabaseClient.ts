import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !anonKey) {
  console.warn(
    "[supabase] Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — la app no podrá leer ni escribir observaciones."
  );
}

export const supabase = createClient(url, anonKey, {
  realtime: {
    params: { eventsPerSecond: 10 },
  },
});

export const OBSERVATIONS_TABLE = "pm_observations";
export const INCIDENTS_TABLE = "pm_incidents";
