// Sorts a building's Idea projects into its strategy groups. Labels come from
// settings (the building's strategies); a project whose strategy is unset or
// no longer in settings lands in "No strategy yet" — never a made-up label.

import type { Strategy } from "./categories";

export const NO_STRATEGY_KEY = "__none";

export type IdeaGroup<T> = { key: string; label: string; projects: T[] };

export function groupIdeasByStrategy<T extends { strategy: string | null }>(
  ideas: T[],
  strategies: Strategy[],
): IdeaGroup<T>[] {
  const known = new Set(strategies.map((s) => s.key));
  const groups: IdeaGroup<T>[] = strategies.map((s) => ({
    key: s.key,
    label: s.label,
    projects: ideas.filter((p) => p.strategy === s.key),
  }));
  groups.push({
    key: NO_STRATEGY_KEY,
    label: "No strategy yet",
    projects: ideas.filter((p) => !p.strategy || !known.has(p.strategy)),
  });
  return groups;
}
