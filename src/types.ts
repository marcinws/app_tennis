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
  // Untrusted until read through parseMatchActions; the database only enforces an array.
  events: unknown;
  revision: number;
  // Embedded record from `players(id, name)`.
  player: { id: string; name: string };
}

export interface PlayerGoal {
  id: string;
  text: string;
  created_at: string;
}
