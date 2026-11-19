import { describe, expect, it } from "vitest";
import { groupIdeasByStrategy, NO_STRATEGY_KEY } from "./idea-groups";

const strategies = [
  { key: "ADS", label: "Run more ads" },
  { key: "EMAIL", label: "Email and socials" },
];

describe("groupIdeasByStrategy", () => {
  it("sorts ideas into their strategy, in settings order", () => {
    const groups = groupIdeasByStrategy(
      [
        { id: 1, strategy: "EMAIL" },
        { id: 2, strategy: "ADS" },
        { id: 3, strategy: "ADS" },
      ],
      strategies,
    );
    expect(groups.map((g) => g.label)).toEqual([
      "Run more ads",
      "Email and socials",
      "No strategy yet",
    ]);
    expect(groups[0].projects.map((p) => p.id)).toEqual([2, 3]);
    expect(groups[1].projects.map((p) => p.id)).toEqual([1]);
  });

  it("puts unset or removed strategies under No strategy yet", () => {
    const groups = groupIdeasByStrategy(
      [
        { id: 1, strategy: null },
        { id: 2, strategy: "DELETED" },
      ],
      strategies,
    );
    const none = groups.find((g) => g.key === NO_STRATEGY_KEY)!;
    expect(none.projects.map((p) => p.id)).toEqual([1, 2]);
  });
});
