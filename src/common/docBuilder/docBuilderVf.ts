import fs from "fs-extra";
import path from "path";
import Handlebars from "handlebars";
import { PromptTemplate } from "../aiProvider/promptTemplates.js";
import { VfParser, VfPageMetadata } from "../vfScripts/vfParser.js";
import { parseApexClassFile } from "../vfScripts/apexParser.js";
import { DocBuilderRoot } from "./docBuilderRoot.js";
import promptDescribeVf from "../aiProvider/promptTemplates/PROMPT_DESCRIBE_VF.js";

export class DocBuilderVf extends DocBuilderRoot {
  public docType = "Vf";
  public placeholder = "<!-- VF description -->";
  public promptKey: PromptTemplate = "PROMPT_DESCRIBE_VF";
  public xmlRootKey = "";
  public docsSection = "vf";

  private vfParser: VfParser;
  private template: Handlebars.TemplateDelegate;

  constructor(templatePath: string) {
    super("", "", "", {});
    this.vfParser = new VfParser();

    if (!fs.existsSync(templatePath)) {
      throw new Error(`Visualforce template not found: ${templatePath}`);
    }
    const templateContent = fs.readFileSync(templatePath, "utf-8");
    this.template = Handlebars.compile(templateContent, { noEscape: true });
    Handlebars.registerHelper("join", (arr: string[], sep: string) => arr?.join(sep));
  }

  /** Generate Markdown for a VF page, optional AI enrichment */
  public async buildInitialMarkdown(filePath: string, apexDir: string, aiProvider?: any): Promise<string> {
    const pageMetadata: VfPageMetadata = this.vfParser.parseVisualforcePage(filePath, apexDir);
    this.metadataName = pageMetadata.name;
    this.additionalVariables = { VF_PATH: filePath };

    // --- Extract Apex controller code for AI ---
    let apexCode = "";
    if (pageMetadata.controller && pageMetadata.controller !== "UnknownController") {
      const apexInfo = parseApexClassFile(apexDir, pageMetadata.controller);
      if (apexInfo) {
        apexCode = apexInfo.methods.map(m => `// ${m.name}(${m.parameters}) : ${m.type}`).join("\n");
      }
    }

    // --- Optional AI enrichment ---
    if (aiProvider) {
      try {
        const vfCode = await fs.readFile(filePath, "utf-8");
        const aiResult = await aiProvider.generateDescription({
          promptTemplate: promptDescribeVf,
          variables: { VF_NAME: pageMetadata.name, VF_CODE: vfCode, VF_CONTROLLER: apexCode }
        });

        if (aiResult) {
          pageMetadata.overview = aiResult.overview;
          pageMetadata.purpose = aiResult.purpose;
          pageMetadata.keyFunctions = aiResult.keyFunctions || [];
          pageMetadata.interactions = aiResult.interactions || [];
          pageMetadata.properties = aiResult.properties || pageMetadata.properties;
          pageMetadata.methods = aiResult.methods || pageMetadata.methods;
        }
      } catch (err: any) {
        console.warn(`⚠️ AI enrichment failed for ${pageMetadata.name}: ${err.message}`);
      }
    }

    return this.buildMarkdown(pageMetadata);
  }

  /** Build Markdown from template + metadata */
  private buildMarkdown(metadata: VfPageMetadata): string {
    let mdContent = this.template(metadata);

    if (!mdContent.includes("keyFunctions") && metadata.keyFunctions?.length) {
      mdContent += "\n\n## Key Functions\n" + metadata.keyFunctions.map(k => `- ${k}`).join("\n");
    }
    if (!mdContent.includes("interactions") && metadata.interactions?.length) {
      mdContent += "\n\n## Interactions\n" + metadata.interactions.map(i => `- ${i}`).join("\n");
    }

    return mdContent;
  }

  /** Utility to build an index page for all VF pages */
  public static async buildIndex(pages: VfPageMetadata[], outputRoot: string, footer: string) {
    const indexFile = path.join(outputRoot, "vf", "index.md");
    const lines = ["# Visualforce Pages\n"];
    for (const page of pages) {
      lines.push(`- [${page.name}](./${page.name}.md): ${page.overview || ""}`);
    }
    fs.ensureDirSync(path.join(outputRoot, "vf"));
    fs.writeFileSync(indexFile, lines.join("\n") + `\n\n${footer}`, "utf-8");
  }

  public parsePage(filePath: string, apexDir?: string): VfPageMetadata {
    return this.vfParser.parseVisualforcePage(filePath, apexDir);
  }
}
