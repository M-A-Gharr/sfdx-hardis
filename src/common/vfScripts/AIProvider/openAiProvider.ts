import { AiProvider, AiProviderResult, MemberDescriptionResult } from "./AiProvider.js";
import OpenAI from "openai";
import { extractJson } from "../utils/jsonUtils.js";

export class OpenAiProvider implements AiProvider {
  name = "OpenAI";
  private client: OpenAI;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY || "";
    if (!apiKey) throw new Error("OpenAI API key is missing in .env");
    this.client = new OpenAI({ apiKey });
  }

  async generateOverviewPurpose(pageName: string, content: string): Promise<AiProviderResult> {
    const prompt = `
You are a Salesforce Visualforce assistant.
Generate concise overview & purpose for page "${pageName}".
Return ONLY valid JSON matching this structure:
{
  "overview": string,
  "purpose": string,
  "keyFunctions": string[],
  "interactions": string[]
}

Page content (truncated to 4000 chars):
${content.substring(0, 4000)}
`;

    try {
      const completion = await this.client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a Salesforce documentation assistant." },
          { role: "user", content: prompt },
        ],
      });

      const responseText = completion.choices[0].message?.content || "";
      return extractJson<AiProviderResult>(responseText, { overview: "", purpose: "", keyFunctions: [], interactions: [], });
    } catch (err: any) {
      console.warn(`OpenAI overview generation failed: ${err.message}`);
      return { overview: "", purpose: "", keyFunctions: [], interactions: [] };
    }
  }

  async generateMemberDescriptions(pageName: string, properties: string[], methods: string[]): Promise<MemberDescriptionResult> {
    if (properties.length === 0 && methods.length === 0) {
      return { properties: {}, methods: {} };
    }

    const prompt = `
You are a Salesforce Visualforce assistant.
For page "${pageName}", generate short descriptions for each property and method.
Return ONLY valid JSON like this:
{
  "properties": { "propertyName": "description" },
  "methods": { "methodName": "description" }
}

Properties: ${properties.join(", ")}
Methods: ${methods.join(", ")}
`;

    try {
      const completion = await this.client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a Salesforce documentation assistant." },
          { role: "user", content: prompt },
        ],
      });

      const responseText = completion.choices[0].message?.content || "";
      return extractJson<MemberDescriptionResult>(responseText, { properties: {}, methods: {} });
    } catch (err: any) {
      console.warn(`OpenAI member description generation failed: ${err.message}`);
      return { properties: {}, methods: {} };
    }
  }
}
