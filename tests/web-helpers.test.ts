import { describe, expect, it } from "vitest";

import { falsifiable } from "@/lib/pipeline/helpers";
import { findUnmatchedNumbers, replaceMarkdownSection } from "@/lib/utils";

describe("web pipeline helpers", () => {
  it("detects falsifiable hypotheses", () => {
    expect(falsifiable("Higher transparency is associated with higher trust.")).toBe(true);
    expect(falsifiable("Participants using guided mobile learning will show significantly higher autonomy scores.")).toBe(true);
    expect(falsifiable("Transparency matters.")).toBe(false);
  });

  it("replaces a markdown section cleanly", () => {
    const original = "# Draft\n\n## Results\nOld body\n\n## Discussion\nOld discussion\n";
    const updated = replaceMarkdownSection(original, "Results", "New results body");
    expect(updated).toContain("## Results\nNew results body");
    expect(updated).toContain("## Discussion\nOld discussion");
  });

  it("flags unmatched numeric strings", () => {
    const unmatched = findUnmatchedNumbers("The effect was 0.25 and the p-value was 0.03.", new Set(["0.25"]));
    expect(unmatched).toEqual(["0.03"]);
  });
});
