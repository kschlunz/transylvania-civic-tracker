import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { createClaudeLlm, estimateCost, toolDefinition } from "../claude";
import { responseTools, type ResponseTool } from "../extraction";
import { PDF } from "./helpers";

type Params = Record<string, unknown> & { messages: Anthropic.MessageParam[] };

/** A stand-in for the Anthropic client that replies from a queue and keeps a copy of each request. */
function fakeClient(replies: Partial<Anthropic.Message>[]) {
  const requests: Params[] = [];
  const client = {
    messages: {
      stream(params: Params) {
        requests.push(structuredClone(params));
        const reply = replies.shift();
        if (!reply) throw new Error("fakeClient: no reply queued");
        return {
          finalMessage: async () => ({
            stop_reason: "tool_use",
            usage: { input_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 1000, output_tokens: 50 },
            ...reply,
          }),
        };
      },
    },
  } as unknown as Anthropic;
  return { client, requests };
}

const call = (name: string, input: unknown, id = "toolu_1") => ({ content: [{ type: "tool_use", id, name, input }] }) as unknown as Partial<Anthropic.Message>;

const tools = responseTools();
const toolset = Object.values(tools) as ResponseTool[];
const request = (task: string, instructions: string) => ({ task, system: "System prompt.", pdf: PDF, instructions, tool: tools.review, toolset });

describe("createClaudeLlm", () => {
  it("sends the same tools, system prompt and cached PDF with every request", async () => {
    const { client, requests } = fakeClient([call("submit_review", { issues: [] }), call("submit_review", { issues: [] })]);
    const { llm, usage } = createClaudeLlm({ model: "claude-opus-5-5", client, log: () => {} });
    await llm(request("review", "First."));
    await llm(request("review", "Second."));

    const prefix = (p: Params) => JSON.stringify({ tools: p.tools, system: p.system, first: (p.messages[0].content as unknown[])[0] });
    expect(prefix(requests[0])).toBe(prefix(requests[1]));
    expect((requests[0].messages[0].content as { cache_control?: unknown }[])[0].cache_control).toEqual({ type: "ephemeral" });
    expect(JSON.stringify(requests[0].output_config)).not.toContain("format");
    expect((requests[0].tools as { name: string }[]).map((t) => t.name)).toEqual(["record_meeting", "record_people", "record_follow_ups", "submit_review"]);
    expect(usage).toMatchObject({ requests: 2, cacheReadTokens: 2000 });
  });

  it("asks again in the same conversation when the answer does not match the schema", async () => {
    const { client, requests } = fakeClient([
      call("submit_review", { issues: [{ severity: "fatal" }] }),
      call("submit_review", { issues: [{ severity: "error", where: "keyVotes[0]", problem: "Wrong mover.", evidence: "p. 2" }] }, "toolu_2"),
    ]);
    const { llm } = createClaudeLlm({ model: "m", client, log: () => {} });
    const review = await llm(request("review", "Check it."));

    expect(review.issues[0].problem).toBe("Wrong mover.");
    const retry = requests[1].messages;
    expect(retry.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(retry[2].content).toMatchObject([{ type: "tool_result", tool_use_id: "toolu_1", is_error: true }]);
  });

  it("gives up after two extra attempts", async () => {
    const text = { content: [{ type: "text", text: "Here is my review." }], stop_reason: "end_turn" } as unknown as Partial<Anthropic.Message>;
    const { client, requests } = fakeClient([text, text, text]);
    const { llm } = createClaudeLlm({ model: "m", client, log: () => {} });
    await expect(llm(request("review", "Check it."))).rejects.toThrow(/did not call submit_review/);
    expect(requests).toHaveLength(3);
  });

  it("explains an empty credit balance", async () => {
    const client = {
      messages: {
        stream() {
          // The body the API sent on 2026-11-17.
          const body = { type: "error", error: { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API." } };
          throw new Anthropic.BadRequestError(400, body, undefined, new Headers());
        },
      },
    } as unknown as Anthropic;
    const { llm } = createClaudeLlm({ model: "m", client, log: () => {} });
    await expect(llm(request("review", "Check it."))).rejects.toThrow(/out of credit/);
  });
});

describe("toolDefinition", () => {
  it("is plain JSON Schema with an object at the top", () => {
    const def = toolDefinition(tools.meeting);
    expect(def.input_schema.type).toBe("object");
    expect(def.input_schema).not.toHaveProperty("$schema");
    expect(JSON.stringify(def)).toBe(JSON.stringify(toolDefinition(tools.meeting)));
  });
});

describe("estimateCost", () => {
  it("prices cache writes at 1.25x and reads at the cache rate", () => {
    const usage = { requests: 1, inputTokens: 1_000_000, cacheWriteTokens: 1_000_000, cacheReadTokens: 1_000_000, outputTokens: 1_000_000 };
    expect(estimateCost(usage, "claude-opus-5-5")).toBeCloseTo(4 + 5 + 0.2 + 20);
    expect(estimateCost(usage, "unknown-model")).toBeUndefined();
  });
});
