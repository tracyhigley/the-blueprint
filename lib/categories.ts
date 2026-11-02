// Shared category shape used by Buildings, Documents, and (formerly) Boxes.
// Buildings are the categorization axis across Field Notes, Maint Tasks,
// and Calendar — see getBuildings() below. Documents are a separate,
// text-first storage category — see getDocuments().
//
// Destination is its own axis, picked explicitly per item at triage:
//   ATM     — energy-matched pulls; carries `category`, `energy`, `minutes`
//   COUNTER — obligations; carries `area`, `urgent`, `must`, `minutes`
//
// Buildings and documents all live in `settings` JSONB so
// they're editable from the Settings UI. No defaults — blueprints start empty.

import { normalizeDocumentFolderKey } from "@/lib/document-folders";
import { supabaseServer } from "./supabase/server";

export type Box = {
  key: string;
  label: string;
  color?: string;
  meta?: string;
};

// Reserved keys for the daily-action surfaces (top-level pages, not
// categories). Stored on item.box but never valid as a settings.buildings
// or settings.documents entry.
export const RESERVED_BOX_KEYS = new Set(["DROP", "ATM", "COUNTER", "DOCKET"]);

function normalize(raw: any): Box | null {
  if (!raw || typeof raw !== "object") return null;
  const key = typeof raw.key === "string" ? raw.key : null;
  if (!key) return null;
  if (RESERVED_BOX_KEYS.has(key)) return null;
  return {
    key,
    label: typeof raw.label === "string" ? raw.label : key,
    color: typeof raw.color === "string" ? raw.color : undefined,
    meta: typeof raw.meta === "string" ? raw.meta : undefined,
  };
}

export type Destination = "ATM" | "COUNTER";

// Buildings are the Master Project Plans' life domains (The Library, The Press, …) —
// same shape as boxes, separately configured so the planning layer never
// reshapes the daily engine's categories. A building can point at related
// box keys later; for now the link is by convention only.
export type Building = Box;

export async function getBuildings(): Promise<Building[]> {
  const sb = await supabaseServer();
  const { data } = await sb.from("settings").select("buildings").maybeSingle();
  const raw = (data?.buildings as any[]) ?? null;
  if (!raw || !Array.isArray(raw)) return [];
  return raw.map(normalize).filter((b): b is Building => b !== null);
}

// Convert a BUILDING_KEY → slug-case for URLs (mirrors the boxes hub).
export function buildingSlug(key: string): string {
  return key.toLowerCase().replace(/_/g, "-").replace(/\//g, "-");
}

// Documents are text-first storage categories (Notes, Measurements, Read &
// Watch, Health Ideas…) — separately configured from Boxes. Same shape;
// kept distinct so the Boxes page can render them in their own section and
// route them through /documents/<slug> instead of /boxes/<slug>.
export type DocumentType = {
  key: string;
  label: string;
  color?: string;
  meta?: string;
  // Building key from settings.buildings (e.g. "THE_WELLNESS_CENTER") — same
  // buildings Project Plans and Project Tasks use. Legacy pre-rebuild
  // folder values are translated forward on read; see document-folders.ts.
  folder?: string;
};

function normalizeDocument(raw: any): DocumentType | null {
  const n = normalize(raw);
  if (!n) return null;
  const folderRaw = typeof raw?.folder === "string" ? raw.folder : undefined;
  const folder = normalizeDocumentFolderKey(folderRaw);
  return { ...n, folder };
}

export async function getDocuments(): Promise<DocumentType[]> {
  const sb = await supabaseServer();
  // Prefer `documents` (post-migration); fall back to legacy `records` so the
  // app works if migration 0015 has not been applied to this database yet.
  const { data } = await sb.from("settings").select("*").maybeSingle();
  const row = data as { documents?: unknown; records?: unknown } | null;
  const raw = (row?.documents ?? row?.records) as unknown;
  if (!raw || !Array.isArray(raw)) return [];
  return raw
    .map(normalizeDocument)
    .filter((d): d is DocumentType => d !== null);
}
