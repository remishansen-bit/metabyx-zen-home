// Lightweight cleanup of filler words / hesitation markers from speech
// transcripts before passing them to downstream LLM analysis.

const NB_FILLERS = [
  "eh",
  "ehh",
  "ehm",
  "øh",
  "øhm",
  "hm",
  "hmm",
  "mm",
  "mmm",
  "altså",
  "liksom",
  "vel",
  "ikkesant",
  "ikke sant",
  "som sagt",
  "på en måte",
  "tja",
  "du vet",
];

const EN_FILLERS = [
  "uh",
  "uhh",
  "uhm",
  "um",
  "umm",
  "er",
  "err",
  "hm",
  "hmm",
  "like",
  "you know",
  "i mean",
  "sort of",
  "kind of",
  "basically",
];

/**
 * Trim hesitation tokens and collapse repeats. Conservative — only removes
 * standalone filler tokens, leaving meaningful words untouched.
 */
export function trimFillers(input: string, lang: "nb-NO" | "en-US" | string = "nb-NO"): string {
  if (!input) return "";
  const fillers = lang.toLowerCase().startsWith("nb") ? NB_FILLERS : EN_FILLERS;

  // sort longest-first so multiword phrases match before their words
  const sorted = [...fillers].sort((a, b) => b.length - a.length);

  let text = input;

  // Remove multiword fillers first (case-insensitive, word-boundary-ish)
  for (const f of sorted.filter((s) => s.includes(" "))) {
    const re = new RegExp(`(^|[\\s,.;:!?])${escapeRe(f)}(?=$|[\\s,.;:!?])`, "gi");
    text = text.replace(re, "$1");
  }

  // Then single-word fillers
  for (const f of sorted.filter((s) => !s.includes(" "))) {
    const re = new RegExp(`(^|[\\s,.;:!?])${escapeRe(f)}(?=$|[\\s,.;:!?])`, "gi");
    text = text.replace(re, "$1");
  }

  // Collapse repeated stutter like "jeg jeg jeg" → "jeg"
  text = text.replace(/\b(\w+)(?:[\s,]+\1\b){1,}/gi, "$1");

  // Tidy whitespace and orphan punctuation
  text = text.replace(/\s{2,}/g, " ").replace(/\s+([.,!?;:])/g, "$1").trim();

  return text;
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}