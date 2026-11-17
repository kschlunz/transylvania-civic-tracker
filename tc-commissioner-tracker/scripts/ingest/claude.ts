/** The real `Llm`: one streamed, schema-constrained Claude request per task. */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { Llm } from "./extraction";

export const DEFAULT_MODEL = "claude-opus-5-5";

export function resolveModel(): string {
  return process.env.TRACKER_MODEL?.trim() || DEFAULT_MODEL;
}

/**
 * Explain why Anthropic might reject the key, without revealing it
 * (workflow logs are public).
 */
export function describeAnthropicKey(raw: string | undefined): string[] {
  if (!raw) return ["ANTHROPIC_API_KEY is empty."];
  const notes: string[] = [];
  if (raw !== raw.trim()) notes.push("The key had spaces or line breaks around it (now trimmed).");
  if (/^["']|["']$/.test(raw.trim())) notes.push("The key was wrapped in quotes (now removed).");
  const key = cleanKey(raw) ?? "";
  if (key.startsWith("sk-ant-api")) notes.push(`The key looks like an Anthropic API key (${key.length} characters), so it has most likely been revoked, mistyped, or belongs to an organization without API access.`);
  else if (key.startsWith("sk-ant-admin")) notes.push("The key is an Admin API key. Use a regular API key (sk-ant-api...).");
  else if (key.startsWith("sk-ant-oat") || key.startsWith("sk-ant-ort")) notes.push("The key is an OAuth token, not an API key. Create an API key in the Anthropic Console.");
  else if (key.startsWith("sk-")) notes.push(`The key starts with "sk-" but not "sk-ant-": it is probably a key for a different AI provider (${key.length} characters).`);
  else notes.push(`The key does not look like an Anthropic API key, which starts with "sk-ant-api" (${key.length} characters).`);
  return notes;
}

function cleanKey(value: string | undefined): string | undefined {
  const v = value?.trim().replace(/^["']|["']$/g, "").trim();
  return v || undefined;
}

export interface Usage {
  requests: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
}

/**
 * Build an `Llm` backed by the Claude API. The PDF goes first and is cached,
 * so the review and revise passes over the same minutes reuse it.
 */
export function createClaudeLlm(options: { model?: string; client?: Anthropic; log?: (line: string) => void } = {}): {
  llm: Llm;
  usage: Usage;
  model: string;
} {
  const model = options.model ?? resolveModel();
  const client = options.client ?? new Anthropic({ apiKey: cleanKey(process.env.ANTHROPIC_API_KEY), maxRetries: 4 });
  const log = options.log ?? ((line: string) => console.log(line));
  const usage: Usage = { requests: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };

  const llm: Llm = async (request) => {
    const started = Date.now();
    const message = await requestWithKeyHelp(() =>
      client.messages
      .stream({
        model,
        max_tokens: 64000,
        system: request.system,
        output_config: { effort: "high", format: zodOutputFormat(request.schema) },
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: { type: "base64", media_type: "application/pdf", data: request.pdf.toString("base64") },
                cache_control: { type: "ephemeral" },
              },
              { type: "text", text: request.instructions },
            ],
          },
        ],
      })
      .finalMessage(),
    );

    usage.requests += 1;
    usage.inputTokens += message.usage.input_tokens + (message.usage.cache_creation_input_tokens ?? 0);
    usage.cachedInputTokens += message.usage.cache_read_input_tokens ?? 0;
    usage.outputTokens += message.usage.output_tokens;
    log(`    ${request.task}: ${Math.round((Date.now() - started) / 1000)}s, ${message.usage.output_tokens} output tokens`);

    if (message.stop_reason === "refusal") throw new Error(`The model declined the "${request.task}" request.`);
    if (message.stop_reason === "max_tokens") throw new Error(`The "${request.task}" response was cut off at the output limit.`);

    const text = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`The "${request.task}" response was not valid JSON.`);
    }
    return request.schema.parse(json);
  };

  return { llm, usage, model };
}

async function requestWithKeyHelp<T>(send: () => Promise<T>): Promise<T> {
  try {
    return await send();
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      const notes = describeAnthropicKey(process.env.ANTHROPIC_API_KEY);
      throw new Error(`Anthropic rejected ANTHROPIC_API_KEY (${error.message}).\nAbout the configured key:\n${notes.map((n) => `  - ${n}`).join("\n")}`);
    }
    throw error;
  }
}
