import { beforeEach, describe, expect, it, vi } from "vitest";

const { createCompletion } = vi.hoisted(() => ({
  createCompletion: vi.fn(),
}));

vi.mock("openai", () => ({
  default: class MockOpenAI {
    chat = { completions: { create: createCompletion } };
  },
}));

import { translateCaptionToEnglish } from "./caption-translation";

describe("caption translation", () => {
  beforeEach(() => {
    delete process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
    delete process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    createCompletion.mockReset();
  });

  it("returns an explicit error instead of silently displaying source text", async () => {
    await expect(translateCaptionToEnglish("Bonjour", "fr")).rejects.toThrow(
      "English caption translation is not configured.",
    );
  });

  it("preserves captions detected as English without a translation call", async () => {
    await expect(translateCaptionToEnglish("Hello, world!", "eng")).resolves.toBe(
      "Hello, world!",
    );
    expect(createCompletion).not.toHaveBeenCalled();
  });

  it("translates non-English captions and returns only the English text", async () => {
    process.env.AI_INTEGRATIONS_OPENAI_BASE_URL = "https://ai.example.test/v1";
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY = "test-key";
    createCompletion.mockResolvedValue({
      choices: [{ message: { content: '{"englishText":"Good evening, everyone."}' } }],
    });

    await expect(
      translateCaptionToEnglish("Buenas noches a todos.", "es"),
    ).resolves.toBe("Good evening, everyone.");
    expect(createCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-5-mini",
        reasoning_effort: "minimal",
        max_completion_tokens: 384,
        response_format: { type: "json_object" },
      }),
      { signal: undefined },
    );
  });

});