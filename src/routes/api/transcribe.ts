import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/transcribe")({
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

        let form: FormData;
        try {
          form = await request.formData();
        } catch {
          return Response.json(
            { error: "Forventet multipart/form-data med lydfil." },
            { status: 400 },
          );
        }

        const file = form.get("file");
        if (!(file instanceof File) || file.size === 0) {
          return Response.json(
            { error: "Ingen lydfil mottatt." },
            { status: 400 },
          );
        }
        if (file.size > 24 * 1024 * 1024) {
          return Response.json(
            { error: "Opptaket er for langt. Prøv et kortere opptak." },
            { status: 413 },
          );
        }

        const lang = (form.get("language") ?? "").toString().slice(0, 8);
        // OpenAI infers format from extension; derive from MIME type
        const ext =
          ({
            "audio/webm": "webm",
            "audio/mp4": "mp4",
            "audio/mpeg": "mp3",
            "audio/wav": "wav",
            "audio/ogg": "ogg",
          } as Record<string, string>)[file.type.split(";")[0]] ?? "webm";

        const upstream = new FormData();
        upstream.append("model", "openai/gpt-4o-mini-transcribe");
        upstream.append("file", file, `recording.${ext}`);
        // ISO-639-1 only; gateway rejects locale strings like "nb-NO"
        const iso = lang.toLowerCase().slice(0, 2);
        if (iso && /^[a-z]{2}$/.test(iso)) {
          upstream.append("language", iso);
        }

        const res = await fetch(
          "https://ai.gateway.lovable.dev/v1/audio/transcriptions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${key}`,
              "X-Lovable-AIG-SDK": "fetch",
            },
            body: upstream,
          },
        );

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          const msg =
            res.status === 402
              ? "AI-kreditter tomme. Legg til kreditter for å fortsette."
              : res.status === 429
                ? "For mange forespørsler — prøv igjen om et øyeblikk."
                : `Transkripsjon feilet (${res.status}).`;
          return Response.json(
            { error: msg, detail: text.slice(0, 400) },
            { status: res.status },
          );
        }

        const data = (await res.json().catch(() => ({}))) as { text?: string };
        return Response.json({ text: (data.text ?? "").trim() });
      },
    },
  },
});