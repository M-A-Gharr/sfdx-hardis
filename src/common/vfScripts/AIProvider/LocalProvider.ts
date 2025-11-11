import { AiProvider } from "./AiProvider.js";

export class LocalProvider implements AiProvider {
  name = "Local";

  async generateOverviewPurpose(pageName: string, content: string) {
    // For testing only: tries to extract the first comment as overview
    const commentMatch = content.match(/<!--([\s\S]*?)-->/);
    return {
      overview: commentMatch?.[1].trim() ?? "No overview found",
      purpose: commentMatch?.[1].trim() ?? "No purpose found",
    };
  }
}
