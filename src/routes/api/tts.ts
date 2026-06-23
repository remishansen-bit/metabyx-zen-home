import { createFileRoute } from "@tanstack/react-router";

/**
 * Streams a short voice-over for the Phase 5 recap.
 * Uses the Lovable AI Gateway TTS (SSE / PCM) so playback can start while
 * audio is still being generated. Client decodes deltas in an AudioContext.
 */
export const Route = createFileRoute("/api/tts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env.LOVABLE_API_KEY;
        if (!key) {
          return Response.json(
            { error: "Missing LOVABLE_API_KEY on server." },
            { status: 500 },
          );
        }

        let body: { text?: string; voice?: string };
        try {
          body = (await request.json()) as { text?: string; voice?: string };
        } catch {
          return Response.json({ error: "Expected JSON body." }, { status: 400 });
        }
        const text = (body.text ?? "").toString().slice(0, 1200).trim();
        if (!text) {
          return Response.json({ error: "Missing text." }, { status: 400 });
        }
        const voice = (body.voice ?? "sage").toString();

        let upstream: Response;
        try {
          upstream = await fetch(
            "https://ai.gateway.lovable.dev/v1/audio/speech",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${key}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "openai/gpt-4o-mini-tts",
                input: text,
                voice,
                instructions:
                  "Speak slowly, warmly, and softly — like a calm therapeutic guide closing a reflective session.",
                stream_format: "sse",
                response_format: "pcm",
              }),
              signal: request.signal,
            },
          );
        } catch (err) {
          if (request.signal.aborted) return new Response(null, { status: 499 });
          return Response.json(
            { error: err instanceof Error ? err.message : "TTS upstream failed" },
            { status: 502 },
          );
        }

        if (!upstream.ok || !upstream.body) {
          const detail = await upstream.text().catch(() => "");
          const msg =
            upstream.status === 402
              ? "AI credits empty. Add credits to continue."
              : upstream.status === 429
                ? "Too many requests — try again in a moment."
                : `Voice-over failed (${upstream.status}).`;
          return Response.json(
            { error: msg, detail: detail.slice(0, 400) },
            { status: upstream.status },
          );
        }

        return new Response(upstream.body, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
          },
        });
      },
    },
  },
});