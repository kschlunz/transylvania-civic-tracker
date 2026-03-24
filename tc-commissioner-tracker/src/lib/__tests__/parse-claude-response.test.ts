import { describe, it, expect } from "vitest";
import { parseClaudeResponse } from "../parse-claude-response";

describe("parseClaudeResponse", () => {
  it("parses clean JSON after prefill", () => {
    const raw = '"id": "2026-02-09", "type": "regular"}';
    const result = parseClaudeResponse(raw);
    expect(result).toEqual({ id: "2026-02-09", type: "regular" });
  });

  it("strips ```json fences", () => {
    const raw = '```json\n{"id": "2026-02-09"}\n```';
    const result = parseClaudeResponse(raw, "");
    expect(result).toEqual({ id: "2026-02-09" });
  });

  it("strips bare ``` fences", () => {
    const raw = '```\n{"id": "test"}\n```';
    const result = parseClaudeResponse(raw, "");
    expect(result).toEqual({ id: "test" });
  });

  it("handles trailing whitespace and newlines", () => {
    const raw = '"id": "test"}\n\n  ';
    const result = parseClaudeResponse(raw);
    expect(result).toEqual({ id: "test" });
  });

  it("handles prefill with fences wrapping partial JSON", () => {
    // Claude returns fenced JSON that already includes the opening brace
    const raw = '```json\n{"id": "test", "date": "2026-01-01"}\n```';
    const result = parseClaudeResponse(raw, "");
    expect(result).toEqual({ id: "test", date: "2026-01-01" });
  });

  it("throws SyntaxError on malformed JSON", () => {
    expect(() => parseClaudeResponse("not json at all")).toThrow(SyntaxError);
  });

  it("throws on empty string input", () => {
    expect(() => parseClaudeResponse("")).toThrow();
  });

  it("parses nested objects correctly", () => {
    const raw = '"votes": [{"desc": "Budget", "result": "5-0"}], "tldr": "test"}';
    const result = parseClaudeResponse(raw);
    expect(result.votes).toEqual([{ desc: "Budget", result: "5-0" }]);
    expect(result.tldr).toBe("test");
  });

  it("works with array prefill", () => {
    const raw = '{"id": "thread-1"}, {"id": "thread-2"}]';
    const result = parseClaudeResponse(raw, "[");
    expect(result).toEqual([{ id: "thread-1" }, { id: "thread-2" }]);
  });
});
