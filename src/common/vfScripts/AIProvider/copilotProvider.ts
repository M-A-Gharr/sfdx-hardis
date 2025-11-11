import { AiProvider, AiProviderResult } from "./AiProvider.js";

export class CopilotProvider implements AiProvider {
  name = "Copilot";

  private apiKey: string;

  constructor() {
    this.apiKey = process.env.COPILOT_API_KEY || "";
  }

  async generateOverviewPurpose(pageName: string, _content: string): Promise<AiProviderResult> {
    // reference _content to avoid unused parameter diagnostic
    void _content;
    if (!this.apiKey) return { overview: '', purpose: '' };

    try {
      // Replace this with actual Copilot API integration
      // Simulating AI generation with structured JSON
      const simulatedResponse = `
      {
        "overview": "AI-generated overview (Copilot) for ${pageName}",
        "purpose": "AI-generated purpose (Copilot) for ${pageName}"
      }
      `;
      const parsed = JSON.parse(simulatedResponse);

      return {
        overview: parsed.overview,
        purpose: parsed.purpose,
      };
    } catch (err) {
      throw new Error(`Copilot API failed: ${(err as Error).message}`);
    }
  }
}
