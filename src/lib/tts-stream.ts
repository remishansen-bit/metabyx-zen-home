/**
 * Stream a TTS voice-over from `/api/tts` (SSE deltas, base64 PCM 16-bit @ 24kHz)
 * and play it progressively through Web Audio. Returns a controller so the
 * caller can stop playback (which also aborts the upstream fetch).
 *
 * The Gateway forwards OpenAI-format SSE events:
 *   data: { "type": "speech.audio.delta", "audio": "<base64>" }
 *   data: { "type": "speech.audio.done", ... }
 */
export type TtsController = {
  done: Promise<void>;
  stop: () => void;
};

export function streamTts(text: string, opts?: { voice?: string }): TtsController {
  const controller = new AbortController();
  let stopped = false;

  const done = (async () => {
    const ctx = new AudioContext({ sampleRate: 24000 });
    if (ctx.state === "suspended") {
      await ctx.resume().catch(() => {});
    }
    let playhead = 0;
    let pending = new Uint8Array(0);

    const playChunk = (incoming: Uint8Array) => {
      const bytes = new Uint8Array(pending.length + incoming.length);
      bytes.set(pending);
      bytes.set(incoming, pending.length);
      const usable = bytes.length - (bytes.length % 2);
      pending = bytes.slice(usable);
      if (usable === 0) return;
      const samples = new Int16Array(bytes.buffer, 0, usable / 2);
      const floats = Float32Array.from(samples, (s) => s / 32768);
      const buffer = ctx.createBuffer(1, floats.length, 24000);
      buffer.copyToChannel(floats, 0);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);
      if (playhead === 0) playhead = ctx.currentTime + 0.05;
      else playhead = Math.max(playhead, ctx.currentTime);
      src.start(playhead);
      playhead += buffer.duration;
    };

    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice: opts?.voice }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        throw new Error(`TTS failed: ${res.status}`);
      }

      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      while (!stopped) {
        const { value, done: rdone } = await reader.read();
        if (rdone) break;
        buf += value;
        // Split on SSE event boundary (blank line)
        let idx: number;
        while ((idx = buf.indexOf("\n\n")) !== -1) {
          const raw = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          for (const line of raw.split("\n")) {
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;
            try {
              const evt = JSON.parse(payload) as {
                type?: string;
                audio?: string;
              };
              if (evt.type !== "speech.audio.delta" || !evt.audio) continue;
              const bin = atob(evt.audio);
              const arr = new Uint8Array(bin.length);
              for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
              playChunk(arr);
            } catch {
              /* ignore malformed event */
            }
          }
        }
      }
    } finally {
      // Let scheduled audio play out before closing on natural completion.
      const tail = Math.max(0, playhead - ctx.currentTime + 0.1);
      window.setTimeout(() => ctx.close().catch(() => {}), tail * 1000);
    }
  })();

  return {
    done,
    stop: () => {
      stopped = true;
      controller.abort();
    },
  };
}