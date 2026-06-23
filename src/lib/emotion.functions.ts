import { createServerFn } from "@tanstack/react-start";
import { generateObject } from "ai";
import { z } from "zod";

const EmotionInput = z.object({
  transcription: z.string().min(1).max(4000),
  previousContext: z.string().max(4000).optional().default(""),
});

const EmotionSchema = z.object({
  primaryEmotion: z.enum([
    "sadness",
    "anxiety",
    "anger",
    "guilt",
    "shame",
    "fear",
    "grief",
    "hope",
    "relief",
    "tenderness",
    "neutral",
  ]),
  intensity: z.enum(["low", "medium", "high"]),
  distress: z.object({
    cryingOrTears: z.boolean(),
    confidence: z.number().min(0).max(1),
  }),
  summary: z.string().min(1).max(220),
});

export type VoiceEmotion = z.infer<typeof EmotionSchema>;

export const analyzeVoiceEmotion = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => EmotionInput.parse(input))
  .handler(async ({ data }): Promise<VoiceEmotion> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
    const gateway = createLovableAiGatewayProvider(key);

    const { object } = await generateObject({
      model: gateway("openai/gpt-5-mini"),
      system: [
        "You are METABYX, a calm, attuned companion supporting someone through a contemplative mindfulness practice (the Guided Counterfactual Metabolism Protocol).",
        "You receive a fresh transcription of what the user just spoke aloud, plus optional context from earlier in the session.",
        "Read the words with care. Notice repetition, hesitation markers (\"…\", \"I don't know\", \"maybe\"), self-blame, longing, softening, or release. Notice if the language suggests tears or breaking down.",
        "Return a single best-fit primary emotion, an intensity, a gentle judgement on whether the person sounds tearful or in acute distress (with a 0-1 confidence), and one short sentence (max ~25 words) summarizing the emotional weather — supportive, never clinical, never diagnostic, no advice. Speak about the feeling, not the person.",
        "If the transcript is short or flat, lean toward 'neutral' / 'low' rather than over-reading. Never invent details that aren't in the text.",
      ].join("\n"),
      prompt: [
        data.previousContext
          ? `Earlier in this session:\n${data.previousContext}`
          : "Earlier in this session: (no prior context)",
        "",
        `Just spoken aloud:\n${data.transcription}`,
      ].join("\n"),
      schema: EmotionSchema,
    });

    return object;
  });