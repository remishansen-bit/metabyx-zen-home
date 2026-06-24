// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { buildTimelineCsv } from "./PaywallAnalyticsCard";

describe("paywall funnel CSV export", () => {
  it("emits a header and per-action rows with rates and quoting", () => {
    const csv = buildTimelineCsv([
      {
        key: "pro:Circles",
        feature: 'Circles, "Pro"',
        required: "pro",
        impressions: 10,
        dismisses: 3,
        upgrades: 2,
        events: [],
      },
      {
        key: "plus:Library",
        feature: "Library",
        required: "plus",
        impressions: 0,
        dismisses: 0,
        upgrades: 0,
        events: [],
      },
    ]);

    const lines = csv.split("\n");
    expect(lines[0]).toBe(
      "feature,required_tier,prompts,dismisses,upgrade_clicks,no_action,conversion_rate,drop_off_rate",
    );
    // Quoted feature, conversion rate computed (2/10 = 0.2000)
    expect(lines[1]).toBe('"Circles, ""Pro""",pro,10,3,2,5,0.2000,0.3000');
    // Zero impressions → zero rates, no divide-by-zero
    expect(lines[2]).toBe("Library,plus,0,0,0,0,0.0000,0.0000");
  });
});