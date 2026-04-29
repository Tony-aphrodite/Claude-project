// Cheap language detection. franc returns ISO 639-3 codes; we map the
// handful we care about to ISO 639-1 for human-readable logging. We bias
// toward Spanish/English/Italian since those dominate DPM's traffic.

import { franc } from "franc-min";

const ISO3_TO_LABEL: Record<string, string> = {
  spa: "español",
  eng: "english",
  ita: "italiano",
  fra: "français",
  deu: "deutsch",
  por: "português",
  nld: "nederlands",
  rus: "русский",
};

export function detectLanguage(text: string): string | undefined {
  // franc needs ~30 chars for reliable detection; on short messages we
  // return undefined so the prompt instructs Claude to detect itself.
  if (text.trim().length < 30) return undefined;
  const code = franc(text, { only: Object.keys(ISO3_TO_LABEL) });
  if (code === "und") return undefined;
  return ISO3_TO_LABEL[code] ?? code;
}
