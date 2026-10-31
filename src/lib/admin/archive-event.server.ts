import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../integrations/supabase/types";

// Local RPC extension until Lovable regenerates types. Generated files stay intact.
type ArchiveDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Functions"> & {
    Functions: Database["public"]["Functions"] & {
      archive_owned_event: { Args: { _event_id: string }; Returns: undefined };
    };
  };
};

export async function archiveOwnedEvent(client: SupabaseClient<Database>, eventId: string) {
  const { error } = await (client as SupabaseClient<ArchiveDatabase>).rpc("archive_owned_event", {
    _event_id: eventId,
  });
  if (error) throw new Error(error.message);
  return { ok: true as const };
}
