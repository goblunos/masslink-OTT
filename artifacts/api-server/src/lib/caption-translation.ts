import OpenAI from "openai";

const MAX_TRANSLATION_CHARS = 4_000;
const DEFAULT_MODEL = "gpt-5-mini";

let client: OpenAI | null = null;

function getClient(): OpenAI {
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!baseURL || !apiKey) {
    throw new Error("English caption translation is not configured.");
  }
  client ??= new OpenAI({
    apiKey,
    baseURL,
    maxRetries: 1,
    timeout: 15_000,
  });
  return client;
}

export function isEnglishLanguage(language: string | null | undefined): boolean {
  const normalized = (language ?? "").trim().toLowerCase().split(/[-_]/, 1)[0];
  return normalized === "en" || normalized === "eng";
}

export async function translateCaptionToEnglish(
  text: string,
  sourceLanguage: string | null | undefined,
  signal?: AbortSignal,
): Promise<string> {
  const sourceText = text.trim();
  if (!sourceText) throw new Error("Caption text is empty.");
  if (sourceText.length > MAX_TRANSLATION_CHARS) {
    throw new Error("Caption text exceeded the translation limit.");
  }
  // English captions are returned as-is, avoiding an unnecessary paid call and
  // preserving the provider's punctuation and casing.
  if (isEnglishLanguage(sourceLanguage)) return sourceText;

  const response = await getClient().chat.completions.create(
    {
      model: process.env.CAPTION_TRANSLATION_MODEL ?? DEFAULT_MODEL,
      reasoning_effort: "minimal",
      max_completion_tokens: 384,
      response_format: { type: "json_object" },
      messages: [
      {
        role: "system",
        content:
          "Translate broadcast captions to natural English. Return only JSON with an englishText string. " +
          "Do not summarize, explain, transliterate, or add words. If the source is already English, preserve it exactly.",
      },
      {
        role: "user",
        content: JSON.stringify({ sourceLanguage: sourceLanguage ?? "unknown", text: sourceText }),
      },
      ],
    },
    { signal },
  );
  const content = response.choices[0]?.message?.content?.trim();
  if (!content) throw new Error("English caption translation returned no text.");
  let translated: unknown;
  try {
    translated = JSON.parse(content);
  } catch {
    throw new Error("English caption translation returned invalid data.");
  }
  const englishText =
    translated !== null &&
    typeof translated === "object" &&
    typeof (translated as { englishText?: unknown }).englishText === "string"
      ? (translated as { englishText: string }).englishText.trim()
      : "";
  if (!englishText) throw new Error("English caption translation returned no text.");
  return englishText;
}