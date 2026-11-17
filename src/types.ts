import type { FirstServer } from "@/lib/services/matches";

export interface Player {
  id: string;
  name: string;
  created_at: string;
}

export interface Match {
  id: string;
  tournament_name: string | null;
  format: string;
  with_advantage: boolean;
  first_server: FirstServer;
  created_at: string;
  // Embedded record from `players(name)`.
  player: { name: string };
}
