import { supabaseServer } from "./supabase/server";

export type BlueprintMembership = {
  blueprintId: string;
  name: string;
  role: "owner" | "editor";
};

export async function getCurrentBlueprintId(): Promise<string | null> {
  const sb = await supabaseServer();
  const { data } = await sb
    .from("blueprint_members")
    .select("blueprint_id")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.blueprint_id ?? null;
}

export async function getMyBlueprints(): Promise<BlueprintMembership[]> {
  const sb = await supabaseServer();
  const { data, error } = await sb
    .from("blueprint_members")
    .select("role, blueprint:blueprints(id, name)")
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return data
    .filter((r: any) => r.blueprint)
    .map((r: any) => ({
      blueprintId: r.blueprint.id,
      name: r.blueprint.name,
      role: r.role,
    }));
}
