import { createServerFn } from "@tanstack/react-start";
import { generateText, Output } from "ai";
import { z } from "zod";

const RefineInput = z.object({
  rawText: z.string().min(1).max(2000),
});

const BranchSchema = z.object({
  title: z.string(),
  detail: z.string(),
  category: z.enum(["mind", "body", "relationship", "work", "spirit"]),
});

const RefineOutputSchema = z.object({
  summary: z.string(),
  branches: z.array(BranchSchema).min(1).max(5),
});

export const refineBranches = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => RefineInput.parse(input))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
    const gateway = createLovableAiGatewayProvider(key);

    const { experimental_output } = await generateText({
      model: gateway("google/gemini-3-flash-preview"),
      system:
        "You are METABYX, a calm mindfulness coach. Users describe 'open branches' — unresolved energies, thoughts, or commitments occupying their mind. Distill the user's raw text into 1–5 concrete, gentle branches. Each branch is a single concern phrased in second person ('Reach out to your sister'). Keep titles short (2-5 words). The summary is one warm sentence acknowledging what surfaced.",
      prompt: data.rawText,
      experimental_output: Output.object({ schema: RefineOutputSchema }),
    });

    return experimental_output;
  });