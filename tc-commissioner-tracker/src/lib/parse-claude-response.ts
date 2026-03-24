/**
 * Parse a Claude API response that used the "{" prefill technique.
 * Handles markdown fence stripping and JSON recovery.
 */
export function parseClaudeResponse(rawText: string, prefill: string = "{"): Record<string, unknown> {
  let jsonText = (prefill + rawText).trim();

  // Strip markdown fences if present
  const fenceMatch = jsonText.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/);
  if (fenceMatch) {
    jsonText = fenceMatch[1];
  }

  return JSON.parse(jsonText);
}
