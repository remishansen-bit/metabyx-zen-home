import { createServerFn } from "@tanstack/react-start";
import { generateObject } from "ai";
import { z } from "zod";

const SuggestInput = z.object({
  whatIf: z.string().min(1).max(1000),
  frictions: z.array(z.string()).max(20).default([]),
  frictionNote: z.string().max(800).optional().default(""),
});

const PathSchema = z.object({
  id: z.enum(["action", "story", "symbolic", "prayer"]),
  title: z.string(),
  description: z.string(),
  firstStep: z.string(),
});

const SuggestOutputSchema = z.object({
  intro: z.string(),
  paths: z.array(PathSchema).min(3).max(4),
});

export const suggestPaths = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => SuggestInput.parse(input))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
    const gateway = createLovableAiGatewayProvider(key);

    const { object } = await generateObject({
      model: gateway("google/gemini-3-flash-preview"),
      system: [
        "You are METABYX, a calm, intelligent mindfulness companion.",
        "Phase 3 of the Guided Counterfactual Metabolism Protocol: the user has named a 'what if' branch and described how it lands in body and mind.",
        "Suggest 3 or 4 integration paths chosen from this fixed set, each used at most once:",
        "  - action: a small concrete real-world move",
        "  - story: re-author the meaning in language",
        "  - symbolic: an embodied or symbolic gesture",
        "  - prayer: stillness, reflection, or prayer",
        "Pick the paths that best fit THIS branch and friction — not all four by default. If the friction is body-heavy, lean toward symbolic / action. If the branch is meaning-loaded, lean toward story / prayer.",
        "For each path: a warm 'description' (1 short sentence, second person, references their branch or friction specifically — no generic platitudes) and a 'firstStep' (one concrete, doable-in-under-2-minutes action). Speak gently, in second person. Avoid clichés like 'take a deep breath' unless truly fitting.",
        "'intro' is one short sentence acknowledging what they shared, before the paths.",
      ].join("\n"),
      prompt: [
        `Branch (what-if thought): ${data.whatIf}`,
        data.frictions.length
          ? `Friction noticed: ${data.frictions.join(", ")}`
          : "Friction noticed: (none specified)",
        data.frictionNote ? `Additional note: ${data.frictionNote}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      schema: SuggestOutputSchema,
    });

    return object;
  });