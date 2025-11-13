import crypto from "crypto";
import { PromptTemplate } from "../aiProvider/promptTemplates.js";
import { DocBuilderRoot } from "./docBuilderRoot.js";
import { getCache, setCache } from "../cache/index.js";

export class DocBuilderVf extends DocBuilderRoot {

  public docType = "Visualforce";
  public promptKey: PromptTemplate = "PROMPT_DESCRIBE_VF";
  public placeholder = "<!-- VF description -->";

  private _sourceHash: string | null = null;

  constructor(
    public metadataName: string,
    public source: string,
    public markdownFile: string,
    public variables: Record<string, any> = {}
  ) {
    super(metadataName, source, markdownFile, variables);
  }

  /** Compute a hash of the VF source to detect changes */
  public get sourceHash(): string {
    if (!this._sourceHash) {
      this._sourceHash = crypto
        .createHash("md5")
        .update(this.source || "")
        .digest("hex");
    }
    return this._sourceHash;
  }

  /** Build initial markdown lines (before AI description) */
  public async buildInitialMarkdownLines(): Promise<string[]> {
    return [
      `## ${this.metadataName}`,
      '',
      '<!-- VF description -->',
      '',
      '## Visualforce Source',
      '```xml',
      this.source,
      '```',
      '',
    ];
  }

  /** Main function to generate the AI description with caching */
  public async completeDocWithAiDescription(): Promise<string> {
    const cacheKey = `vf-${this.metadataName}-${this.sourceHash}`;

    try {
      // 1️⃣ Check cache first
      const cached = await getCache(cacheKey, null);
      if (cached) {
        this.markdownDoc = cached;
        return this.markdownDoc; // Use cached markdown as-is
      }

      // 2️⃣ Call AI if no cache
      this.markdownDoc = await super.completeDocWithAiDescription();

      // 3️⃣ Save AI result to cache
      await setCache(cacheKey, this.markdownDoc);

      return this.markdownDoc;

    } catch (err: any) {
      console.warn(`AI generation failed for VF page ${this.metadataName}:`, err.message);

      // 4️⃣ Fallback: use cache if exists
      const cached = await getCache(cacheKey, null);
      if (cached) {
        this.markdownDoc = cached;
        return this.markdownDoc;
      }

      // 5️⃣ Final fallback: initial markdown skeleton
      const lines = await this.buildInitialMarkdownLines();
      this.markdownDoc = lines.join("\n");
      return this.markdownDoc;
    }
  }

  /** Build the index table for navigation */
  public static buildIndexTable(prefix: string, vfDescriptions: any[], filterObject: string | null = null) {
    const filtered = filterObject ? vfDescriptions.filter(vf => vf.impactedObjects?.includes(filterObject)) : vfDescriptions;
    if (filtered.length === 0) return [];

    const lines: string[] = [];
    lines.push(...[
      filterObject ? "## Related Visualforce Pages" : "## Visualforce Pages",
      "",
      "| Visualforce Page |",
      "| :---- |"
    ]);
    for (const vf of filtered) {
      const pageCell = `[${vf.name}](${prefix}${vf.name}.md)`;
      lines.push(`| ${pageCell} |`);
    }
    lines.push("");
    return lines;
  }
}
