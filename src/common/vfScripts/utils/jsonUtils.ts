/**
 * Safely extracts and parses JSON from an AI response.
 * Handles markdown code fences, trailing commas, and malformed text gracefully.
 */
export function extractJson<T>(text: string, fallback: T): T {
  if (!text) return fallback;

  // Clean markdown formatting (```json ... ```)
  const cleaned = text
    .replace(/```(?:json)?/gi, "")
    .replace(/```/g, "")
    .trim();

  // Extract first JSON object
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return fallback;

  try {
    return JSON.parse(jsonMatch[0]) as T;
  } catch {
    // Attempt recovery from minor JSON issues
    const sanitized = jsonMatch[0]
      .replace(/,\s*}/g, "}")
      .replace(/,\s*]/g, "]")
      .replace(/[\r\n]/g, " ");
    try {
      return JSON.parse(sanitized) as T;
    } catch {
      return fallback;
    }
  }
}
