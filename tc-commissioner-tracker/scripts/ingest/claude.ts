/** The real `Llm`: streamed Claude requests that answer by calling a tool. */
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { Llm, LlmRequest, ResponseTool } from "./extraction";

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
  /** Input tokens billed at the normal rate. */
  inputTokens: number;
  /** Input tokens written to the cache (billed at 1.25x the normal rate). */
  cacheWriteTokens: number;
  /** Input tokens read from the cache (billed at a small fraction of the normal rate). */
  cacheReadTokens: number;
  outputTokens: number;
}

/** List prices in dollars per million tokens, for the cost estimate in the logs. Checked 2026-11. */
const PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.1 },
};

/** Rough cost of the usage at list prices, or undefined for a model without a known price. */
export function estimateCost(usage: Usage, model: string): number | undefined {
  const price = PRICES[model];
  if (!price) return undefined;
  const dollars =
    usage.inputTokens * price.input +
    usage.cacheWriteTokens * price.input * 1.25 +
    usage.cacheReadTokens * price.cacheRead +
    usage.outputTokens * price.output;
  return dollars / 1_000_000;
}

export function describeUsage(usage: Usage, model: string): string {
  const cost = estimateCost(usage, model);
  return (
    `Model usage: ${usage.requests} requests; input ${usage.inputTokens} tokens, ${usage.cacheWriteTokens} written to cache, ` +
    `${usage.cacheReadTokens} read from cache; output ${usage.outputTokens} tokens` +
    (cost === undefined ? "." : ` (about $${cost.toFixed(2)} at list prices).`)
  );
}

/** The API's form of a response tool: plain JSON Schema, not strict, so no grammar size limit applies. */
export function toolDefinition(tool: ResponseTool): Anthropic.Tool {
  const schema = { ...(z.toJSONSchema(tool.schema) as Record<string, unknown>) };
  delete schema.$schema;
  return { name: tool.name, description: tool.description, input_schema: schema as Anthropic.Tool.InputSchema };
}

/** Most extra attempts when the model's answer does not match the tool's schema. */
const MAX_RETRIES = 2;

/**
 * Build an `Llm` backed by the Claude API.
 *
 * Every request about one PDF starts with the same tools, system prompt and
 * PDF, with a cache breakpoint on the PDF; only the instructions after it
 * differ. The first request writes that prefix to the cache and the others
 * read it at a small fraction of the price. (Structured output was used
 * before, but each schema changes the prefix, so nothing was ever read back.)
 */
export function createClaudeLlm(options: { model?: string; client?: Anthropic; log?: (line: string) => void } = {}): {
  llm: Llm;
  usage: Usage;
  model: string;
} {
  const model = options.model ?? resolveModel();
  const client = options.client ?? new Anthropic({ apiKey: cleanKey(process.env.ANTHROPIC_API_KEY), maxRetries: 4 });
  const log = options.log ?? ((line: string) => console.log(line));
  const usage: Usage = { requests: 0, inputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0, outputTokens: 0 };

  const llm = async <T>(request: LlmRequest<T>): Promise<T> => {
    const tools = request.toolset.map(toolDefinition);
    const messages: Anthropic.MessageParam[] = [
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
    ];

    for (let attempt = 0; ; attempt++) {
      const started = Date.now();
      const message = await callApi(() =>
        client.messages
          .stream({ model, max_tokens: 64000, system: request.system, tools, output_config: { effort: "high" }, messages })
          .finalMessage(),
      );

      const u = message.usage;
      usage.requests += 1;
      usage.inputTokens += u.input_tokens;
      usage.cacheWriteTokens += u.cache_creation_input_tokens ?? 0;
      usage.cacheReadTokens += u.cache_read_input_tokens ?? 0;
      usage.outputTokens += u.output_tokens;
      const input = u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
      log(
        `    ${request.task}: ${Math.round((Date.now() - started) / 1000)}s, ${input} input tokens (${u.cache_read_input_tokens ?? 0} from cache), ${u.output_tokens} output tokens`,
      );

      if (message.stop_reason === "refusal") throw new Error(`The model declined the "${request.task}" request.`);
      if (message.stop_reason === "max_tokens") throw new Error(`The "${request.task}" response was cut off at the output limit.`);

      const calls = message.content.filter((block): block is Anthropic.ToolUseBlock => block.type === "tool_use");
      const call = calls.find((block) => block.name === request.tool.name);
      const parsed = call ? request.tool.schema.safeParse(call.input) : undefined;
      if (parsed?.success) return parsed.data;

      const problem = parsed ? describeIssues(parsed.error) : `the response did not call ${request.tool.name}`;
      if (attempt >= MAX_RETRIES) throw new Error(`The "${request.task}" response did not match the expected format: ${problem}`);
      log(`    ${request.task}: asking again (${problem.split("\n")[0]})`);

      // Continue the same conversation, so the retry reads the cached prefix too.
      messages.push({ role: "assistant", content: message.content as Anthropic.ContentBlockParam[] });
      messages.push({
        role: "user",
        content:
          calls.length === 0
            ? [{ type: "text", text: `Answer by calling ${request.tool.name}.` }]
            : calls.map((block) => ({
                type: "tool_result" as const,
                tool_use_id: block.id,
                is_error: true,
                content:
                  block === call
                    ? `The input does not match the tool's schema:\n${problem}\nCall ${request.tool.name} again with the complete, corrected input.`
                    : `Not used for this request. Call ${request.tool.name}.`,
              })),
      });
    }
  };

  return { llm, usage, model };
}

function describeIssues(error: z.ZodError): string {
  const lines = error.issues.slice(0, 10).map((issue) => `- ${issue.path.join(".") || "(top level)"}: ${issue.message}`);
  if (error.issues.length > 10) lines.push(`- and ${error.issues.length - 10} more`);
  return lines.join("\n");
}

/** Confirm the API accepts the response tools, with one small, cheap request that needs no PDF. */
export async function checkTools(toolset: ResponseTool[], options: { model?: string; client?: Anthropic } = {}): Promise<string> {
  const model = options.model ?? resolveModel();
  const client = options.client ?? new Anthropic({ apiKey: cleanKey(process.env.ANTHROPIC_API_KEY), maxRetries: 2 });
  const target = toolset.find((t) => t.name === "submit_review") ?? toolset[0];
  const message = await callApi(() =>
    client.messages
      .stream({
        model,
        max_tokens: 4000,
        tools: toolset.map(toolDefinition),
        output_config: { effort: "low" },
        messages: [{ role: "user", content: `This is a format check. Call ${target.name} with the smallest valid input.` }],
      })
      .finalMessage(),
  );
  const call = message.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === target.name);
  const valid = call ? target.schema.safeParse(call.input).success : false;
  const outcome = !call ? "was not called" : valid ? "returned a valid answer" : "returned an answer that does not match its schema";
  return `${toolset.length} tools accepted (${message.usage.input_tokens} input, ${message.usage.output_tokens} output tokens); ${target.name} ${outcome}.`;
}

/** Send a request, turning a bad key or an empty credit balance into a message that says what to do. */
async function callApi<T>(send: () => Promise<T>): Promise<T> {
  try {
    return await send();
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      const notes = describeAnthropicKey(process.env.ANTHROPIC_API_KEY);
      throw new Error(`Anthropic rejected ANTHROPIC_API_KEY (${error.message}).\nAbout the configured key:\n${notes.map((n) => `  - ${n}`).join("\n")}`);
    }
    if (error instanceof Anthropic.BadRequestError && /credit balance/i.test(error.message)) {
      throw new Error("The Anthropic account is out of credit. Add credit under Billing in the Anthropic Console, then run the workflow again.");
    }
    throw error;
  }
}
