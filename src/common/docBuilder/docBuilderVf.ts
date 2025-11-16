import crypto from "crypto";
import * as fs from 'fs-extra';
import * as path from 'path';
import { glob } from 'glob';
import { GLOB_IGNORE_PATTERNS } from '../../common/utils/projectUtils.js';
import { PromptTemplate } from "../aiProvider/promptTemplates.js";
import { DocBuilderRoot } from "./docBuilderRoot.js";
import { getCache, setCache } from "../cache/index.js";
import { VfParser, VfParsedInfo } from "../utils/visualForce/vfParser.js";
import { ApexParser, ApexParsedInfo } from "../utils/visualForce/apexParser.js";

export interface VfDocGenerationResult {
  markdownContent: string;
  shortDescription: string;
  name: string;
  outputPath: string;
  impactedObjects?: string[];
}

export interface VfPerformanceMetrics {
  componentCount: number;
  apexExpressionCount: number;
  estimatedRenderComplexity: 'low' | 'medium' | 'high';
  largeDataTables: boolean;
  recommendations: string[];
}

export interface VfBestPractices {
  usesViewState: boolean;
  hasJavaScriptRemoting: boolean;
  usesApexActionFunctions: boolean;
  usesCompositionTemplates: boolean;
  recommendations: string[];
}

export interface VfSecurityAnalysis {
  potentialSoqlInjection: boolean;
  potentialXss: boolean;
  unescapedOutput: boolean;
  recommendations: string[];
}

export interface VfDocBuilderConfig {
  enableSecurityAnalysis?: boolean;
  enablePerformanceMetrics?: boolean;
  enableBestPractices?: boolean;
  enableCrossReferences?: boolean;
  maxApexClassesToParse?: number;
}

export class DocBuilderVf extends DocBuilderRoot {
  public docType = "Visualforce";
  public promptKey: PromptTemplate = "PROMPT_DESCRIBE_VF";
  public placeholder = "<!-- VF description -->";
  private _sourceHash: string | null = null;

  private vfRawContent: string;
  private projectRoot: string;
  private config: VfDocBuilderConfig;

  private vfParsedInfo: VfParsedInfo | undefined;
  private apexParsedInfoMap: Map<string, ApexParsedInfo> = new Map();
  private parserFallbackMarkdown: string = '';

  constructor(
    public metadataName: string,
    public vfFilePath: string,
    outputMarkdownRoot: string,
    projectRoot: string,
    config: VfDocBuilderConfig = {}
  ) {
    // We don't have source or variables ready yet, call super with placeholders
    super(metadataName, vfFilePath, path.join(outputMarkdownRoot, "vf", `${metadataName}.md`), {});
    this.projectRoot = projectRoot;
    this.vfRawContent = '';
    this.config = {
      enableSecurityAnalysis: true,
      enablePerformanceMetrics: true,
      enableBestPractices: true,
      enableCrossReferences: true,
      maxApexClassesToParse: 10,
      ...config
    };
  }

  /** Compute a hash of the VF source to detect changes */
  public get sourceHash(): string {
    if (!this._sourceHash) {
      this._sourceHash = crypto
        .createHash("md5")
        .update(this.vfRawContent || "")
        .digest("hex");
    }
    return this._sourceHash;
  }

  /**
   * Main method to build the Visualforce documentation for this page.
   */
  public async build(): Promise<VfDocGenerationResult> {
    const mdFilePath = this.outputFile;
    const pageName = this.metadataName;

    // 1. Load Raw VF Content
    this.vfRawContent = await fs.readFile(this.metadataXml, "utf-8");
    this.metadataXml = this.vfRawContent;

    // 2. Parse Visualforce Page (with size optimization)
    this.vfParsedInfo = await this.parseVfContentWithOptimization(this.vfRawContent);

    // 3. Parse Apex Controllers/Extensions
    await this.parseAndFormatApexControllers();

    // 4. Generate Parser-only Fallback Markdown
    this.parserFallbackMarkdown = this.generateParserOnlyMarkdown();

    // 5. Prepare Variables for AI Prompt
    this.additionalVariables = this.preparePromptVariables();

    // 6. Attempt AI Generation with Caching and Fallback
    const finalMdContent = await this.completeDocWithAiDescription();

    // 7. Extract shortDescription from AI output (or fallback)
    const shortDescription = this.extractShortDescription(finalMdContent);

    // 8. Write the markdown file
    await fs.ensureDir(path.dirname(mdFilePath));
    await fs.writeFile(mdFilePath, finalMdContent, "utf-8");

    return {
      markdownContent: finalMdContent,
      shortDescription: shortDescription,
      name: pageName,
      outputPath: mdFilePath,
    };
  }

  /** Parse VF content with optimization for large files */
  private async parseVfContentWithOptimization(content: string): Promise<VfParsedInfo> {
    if (content.length > 100000) { // 100KB threshold
      console.warn(`Large Visualforce page detected (${content.length} bytes), using simplified parsing`);
      return this.simplifiedParse(content);
    }
    return VfParser.parse(content);
  }

  /** Simplified parsing for very large Visualforce pages */
  private async simplifiedParse(content: string): Promise<VfParsedInfo> {
    const result: VfParsedInfo = {
      extensionNames: [],
      components: [],
      fieldReferences: [],
      apexExpressions: [],
      hasForms: false,
      hasRemoteObjects: false,
      hasStaticResources: false,
      templateFragments: [],
    };
    VfParser._extractBasicVfInfo(content, result); // Call the new shared method
    VfParser['extractApexExpressions'](content, result); // Also extract expressions
    return result;
  }

  /** Helper to find Apex class file */
  private async findApexClassFile(className: string): Promise<string | undefined> {
    const apexFiles = await glob(`**/${className}.cls`, {
      cwd: this.projectRoot,
      ignore: GLOB_IGNORE_PATTERNS
    });
    if (apexFiles.length > 0) {
      return path.join(this.projectRoot, apexFiles[0]);
    }
    return undefined;
  }

  /** Parses related Apex controllers/extensions with limits */
  private async parseAndFormatApexControllers(): Promise<void> {
    if (!this.vfParsedInfo) return;

    const controllerNamesToParse = [
      ...(this.vfParsedInfo.controllerName ? [this.vfParsedInfo.controllerName] : []),
      ...this.vfParsedInfo.extensionNames
    ].slice(0, this.config.maxApexClassesToParse);

    for (const controllerName of controllerNamesToParse) {
      const apexFilePath = await this.findApexClassFile(controllerName);
      if (apexFilePath && await fs.pathExists(apexFilePath)) {
        try {
          const apexContent = await fs.readFile(apexFilePath, 'utf-8');
          const parsedInfo = await ApexParser.parse(apexContent, controllerName);
          this.apexParsedInfoMap.set(controllerName, parsedInfo);
        } catch (err: any) {
          console.warn(`Failed to parse Apex class ${controllerName}:`, err);
        }
      }
    }
  }

  /** Enhanced cache key including dependent file hashes */
  public async getEnhancedCacheKey(): Promise<string> {
    const dependentHashes = await this.getDependentFileHashes();
    return `vf-${this.metadataName}-${this.sourceHash}-${dependentHashes.join('-')}`;
  }

  /** Get hashes of dependent Apex files for cache invalidation */
  private async getDependentFileHashes(): Promise<string[]> {
    const hashes: string[] = [];

    for (const [className] of this.apexParsedInfoMap) {
      const apexFile = await this.findApexClassFile(className);
      if (apexFile) {
        try {
          const content = await fs.readFile(apexFile, 'utf-8');
          const hash = crypto.createHash('md5').update(content).digest('hex');
          hashes.push(hash);
        } catch (error) {
          console.warn(`Could not read dependent file ${apexFile} for cache key`);
        }
      }
    }

    return hashes;
  }

  /** Generates a simple markdown description from parser data */
  private generateParserOnlyMarkdown(): string {
    const sections: string[] = [
      this.generateHeaderSection(),
      this.generateControllerSection(),
      this.generateComponentsSection(),
      this.generateApexSection(),
      this.generateAnalysisSections()
    ].filter(section => section.length > 0);

    return sections.join('\n\n');
  }

  private generateHeaderSection(): string {
    return `## ${this.metadataName}\n\n---\n**Automated Parser Summary (AI generation failed or not available)**\n---\n`;
  }

  private generateControllerSection(): string {
    if (!this.vfParsedInfo) return '';

    const lines: string[] = [];
    lines.push(`**Standard Controller:** ${this.vfParsedInfo.controllerName ? `\`${this.vfParsedInfo.controllerName}\`` : 'N/A'}`);
    lines.push(`**Extensions:** ${this.vfParsedInfo.extensionNames.length > 0 ? this.vfParsedInfo.extensionNames.map(ext => `\`${ext}\``).join(', ') : 'N/A'}`);
    return lines.join('\n');
  }

  private generateComponentsSection(): string {
    if (!this.vfParsedInfo || this.vfParsedInfo.components.length === 0) return '';

    const lines: string[] = ['### Identified Visualforce Components'];
    for (const comp of this.vfParsedInfo.components.slice(0, 20)) { // Limit for large pages
      lines.push(`- \`<${comp.namespace}:${comp.name}>\` (Attributes: \`${Object.keys(comp.attributes).join(', ')}\`)`);
    }
    if (this.vfParsedInfo.components.length > 20) {
      lines.push(`- *... and ${this.vfParsedInfo.components.length - 20} more components*`);
    }
    return lines.join('\n');
  }

  private generateApexSection(): string {
    if (this.apexParsedInfoMap.size === 0) return '';

    const lines: string[] = ['### Related Apex Code Details'];
    for (const [controllerName, apexInfo] of this.apexParsedInfoMap) {
      lines.push(`#### ${controllerName}`);
      lines.push(ApexParser.formatForPrompt(apexInfo.methods, apexInfo.properties, apexInfo.className, apexInfo.javaDoc));
      lines.push('');
    }
    return lines.join('\n');
  }

  private generateAnalysisSections(): string {
    const sections: string[] = [];

    if (this.config.enablePerformanceMetrics) {
      const metrics = this.calculatePerformanceMetrics();
      if (metrics.recommendations.length > 0) {
        sections.push(this.formatPerformanceMetrics(metrics));
      }
    }

    if (this.config.enableSecurityAnalysis) {
      const security = this.analyzeSecurityConcerns();
      if (security.recommendations.length > 0) {
        sections.push(this.formatSecurityAnalysis(security));
      }
    }

    if (this.config.enableBestPractices) {
      const practices = this.analyzeBestPractices();
      if (practices.recommendations.length > 0) {
        sections.push(this.formatBestPractices(practices));
      }
    }

    if (this.config.enableCrossReferences) {
      const crossRefs = this.generateCrossReferences();
      if (crossRefs.length > 0) {
        sections.push(crossRefs);
      }
    }

    return sections.join('\n\n');
  }

  /** Calculate performance metrics for the Visualforce page */
  private calculatePerformanceMetrics(): VfPerformanceMetrics {
    const componentCount = this.vfParsedInfo?.components.length || 0;
    const apexExpressionCount = this.vfParsedInfo?.apexExpressions.length || 0;

    const metrics: VfPerformanceMetrics = {
      componentCount,
      apexExpressionCount,
      estimatedRenderComplexity: 'low',
      largeDataTables: false,
      recommendations: []
    };

    // Analyze for performance concerns
    const rowsMatch = this.vfRawContent.match(/rows="(\d+)"/);
    if (rowsMatch && parseInt(rowsMatch[1]) > 50) {
      metrics.recommendations.push(`Large data table detected (rows="${rowsMatch[1]}"), consider pagination`);
    }

    if (componentCount > 50) {
      metrics.estimatedRenderComplexity = 'high';
      metrics.recommendations.push('High component count may impact page performance');
    } else if (componentCount > 20) {
      metrics.estimatedRenderComplexity = 'medium';
    }

    if (apexExpressionCount > 30) {
      metrics.recommendations.push('High number of Apex expressions may impact ViewState size');
    }

    if (this.vfRawContent.includes('apex:repeat') && componentCount > 10) {
      metrics.recommendations.push('Consider using apex:pageBlockTable instead of apex:repeat for better performance');
    }

    return metrics;
  }

  private formatPerformanceMetrics(metrics: VfPerformanceMetrics): string {
    const lines: string[] = [
      '### Performance Analysis',
      `- **Component Count:** ${metrics.componentCount}`,
      `- **Apex Expressions:** ${metrics.apexExpressionCount}`,
      `- **Estimated Complexity:** ${metrics.estimatedRenderComplexity}`,
      `- **Large Data Tables:** ${metrics.largeDataTables ? 'Yes' : 'No'}`,
    ];

    if (metrics.recommendations.length > 0) {
      lines.push('', '**Recommendations:**');
      metrics.recommendations.forEach(rec => lines.push(`- ${rec}`));
    }

    return lines.join('\n');
  }

  /** Analyze security concerns in the Visualforce page */
  private analyzeSecurityConcerns(): VfSecurityAnalysis {
    const analysis: VfSecurityAnalysis = {
      potentialSoqlInjection: false,
      potentialXss: false,
      unescapedOutput: false,
      recommendations: []
    };

    // Check for potential SOQL injection
    if (this.vfRawContent.includes('{!$CurrentPage.parameters}') &&
      this.vfRawContent.includes('Database.query')) {
      analysis.potentialSoqlInjection = true;
      analysis.recommendations.push('Potential SOQL injection vulnerability - user input used in dynamic SOQL');
    }

    // Check for XSS vulnerabilities
    if (this.vfRawContent.includes('{!') &&
      this.vfRawContent.includes('escape') === false) {
      analysis.potentialXss = true;
      analysis.recommendations.push('Unescaped dynamic content may be vulnerable to XSS');
    }

    // Check for unescaped output
    if (this.vfRawContent.includes('{!') &&
      !this.vfRawContent.includes('HTMLENCODE') &&
      !this.vfRawContent.includes('JSENCODE') &&
      !this.vfRawContent.includes('URLENCODE')) {
      analysis.unescapedOutput = true;
      analysis.recommendations.push('Consider using HTMLENCODE, JSENCODE, or URLENCODE for dynamic content');
    }

    return analysis;
  }

  private formatSecurityAnalysis(analysis: VfSecurityAnalysis): string {
    const lines: string[] = [
      '### Security Analysis',
      `- **Potential SOQL Injection:** ${analysis.potentialSoqlInjection ? '⚠️ Yes' : '✅ No'}`,
      `- **Potential XSS:** ${analysis.potentialXss ? '⚠️ Yes' : '✅ No'}`,
      `- **Unescaped Output:** ${analysis.unescapedOutput ? '⚠️ Yes' : '✅ No'}`,
    ];

    if (analysis.recommendations.length > 0) {
      lines.push('', '**Recommendations:**');
      analysis.recommendations.forEach(rec => lines.push(`- ${rec}`));
    }

    return lines.join('\n');
  }

  /** Analyze Visualforce best practices */
  private analyzeBestPractices(): VfBestPractices {
    const practices: VfBestPractices = {
      usesViewState: this.vfRawContent.includes('apex:form'),
      hasJavaScriptRemoting: this.vfRawContent.includes('Visualforce.remoting'),
      usesApexActionFunctions: this.vfRawContent.includes('apex:actionFunction'),
      usesCompositionTemplates: this.vfRawContent.includes('apex:composition'),
      recommendations: []
    };

    // Generate recommendations
    if (practices.usesViewState && (this.vfParsedInfo?.components.length || 0) > 30) {
      practices.recommendations.push('Consider optimizing ViewState - page has many components');
    }

    if (this.vfRawContent.includes('apex:commandButton')) {
      const hasRerender = this.vfRawContent.includes('rerender="');
      if (!hasRerender) {
        practices.recommendations.push('Consider adding rerender attributes to command buttons for better UX');
      }
    }

    const inputTextCount = (this.vfRawContent.match(/apex:inputText/g) || []).length;
    const inputFieldCount = (this.vfRawContent.match(/apex:inputField/g) || []).length;
    if (inputTextCount > 0 && inputFieldCount === 0) {
      practices.recommendations.push('Consider using apex:inputField for standard object fields');
    }

    if (!practices.usesCompositionTemplates && (this.vfParsedInfo?.components.length || 0) > 10) {
      practices.recommendations.push('Consider using composition templates for reusable page layouts');
    }

    return practices;
  }

  private formatBestPractices(practices: VfBestPractices): string {
    const lines: string[] = [
      '### Best Practices Analysis',
      `- **Uses ViewState:** ${practices.usesViewState ? 'Yes' : 'No'}`,
      `- **Uses JavaScript Remoting:** ${practices.hasJavaScriptRemoting ? 'Yes' : 'No'}`,
      `- **Uses Action Functions:** ${practices.usesApexActionFunctions ? 'Yes' : 'No'}`,
      `- **Uses Composition Templates:** ${practices.usesCompositionTemplates ? 'Yes' : 'No'}`,
    ];

    if (practices.recommendations.length > 0) {
      lines.push('', '**Recommendations:**');
      practices.recommendations.forEach(rec => lines.push(`- ${rec}`));
    }

    return lines.join('\n');
  }

  /** Generate cross-references to related components */
  private generateCrossReferences(): string {
    const lines: string[] = ['## Cross-References', ''];
    let hasReferences = false;

    // Link to related Apex classes
    if (this.apexParsedInfoMap.size > 0) {
      lines.push('### Related Apex Classes');
      for (const [className] of this.apexParsedInfoMap) {
        lines.push(`- [${className}](../apex/${className}.md)`);
      }
      lines.push('');
      hasReferences = true;
    }

    // Link to related objects if standard controller is used
    if (this.vfParsedInfo?.controllerName) {
      lines.push('### Standard Objects');
      lines.push(`- [${this.vfParsedInfo.controllerName}](../objects/${this.vfParsedInfo.controllerName}.md)`);
      lines.push('');
      hasReferences = true;
    }

    // Detect template fragments
    const templateFragments = this.detectTemplateFragments();
    if (templateFragments.length > 0) {
      lines.push('### Template Usage');
      templateFragments.forEach(fragment => lines.push(`- ${fragment}`));
      hasReferences = true;
    }

    return hasReferences ? lines.join('\n') : '';
  }

  private detectTemplateFragments(): string[] {
    const fragments: string[] = [];
    const templatePatterns = [
      { pattern: /<apex:composition\s+template="([^"]+)"/, name: 'Uses template' },
      { pattern: /<apex:insert\s+name="([^"]+)"/, name: 'Defines insert point' },
      { pattern: /<apex:define\s+name="([^"]+)"/, name: 'Defines content' }
    ];

    for (const { pattern, name } of templatePatterns) {
      const matches = this.vfRawContent.match(new RegExp(pattern, 'g'));
      if (matches) {
        fragments.push(`${name}: ${matches.join(', ')}`);
      }
    }

    return fragments;
  }

  /** Prepares the variables object that will be sent to the AI prompt */
  private preparePromptVariables(): Record<string, any> {
    const allApexDetails: string[] = [];
    for (const apexInfo of this.apexParsedInfoMap.values()) {
      allApexDetails.push(ApexParser.formatForPrompt(
        apexInfo.methods,
        apexInfo.properties,
        apexInfo.className,
        apexInfo.javaDoc
      ));
    }
    const apexControllerInfo = allApexDetails.join('\n\n---\n\n');

    // Generate analysis summaries for AI context
    const performanceMetrics = this.calculatePerformanceMetrics();
    const securityAnalysis = this.analyzeSecurityConcerns();
    const bestPractices = this.analyzeBestPractices();

    return {
      VF_NAME: this.metadataName,
      VF_CODE: this.vfRawContent,
      RAW_VF_CODE: this.vfRawContent,
      VF_CONTROLLER: apexControllerInfo,
      VF_COMPONENTS_SUMMARY: this.vfParsedInfo && this.vfParsedInfo.components.length > 0
        ? `Uses components like ${this.vfParsedInfo.components.map(c => `<${c.namespace}:${c.name}>`).join(', ')}.`
        : 'No specific Visualforce components identified.',
      VF_ANALYSIS_SUMMARY: this.generateAnalysisSummary(performanceMetrics, securityAnalysis, bestPractices)
    };
  }

  private generateAnalysisSummary(performance: VfPerformanceMetrics, security: VfSecurityAnalysis, practices: VfBestPractices): string {
    const summaries: string[] = [];

    if (performance.estimatedRenderComplexity !== 'low') {
      summaries.push(`Performance: ${performance.estimatedRenderComplexity} complexity`);
    }

    if (security.potentialSoqlInjection || security.potentialXss) {
      summaries.push('Security: Potential concerns detected');
    }

    if (practices.recommendations.length > 0) {
      summaries.push('Best Practices: Improvement opportunities');
    }

    return summaries.length > 0 ? summaries.join('; ') : 'No significant issues detected';
  }

  /** Build initial markdown lines (before AI description is injected) */
  public async buildInitialMarkdownLines(): Promise<string[]> {
    return [
      `# ${this.metadataName}`,
      '',
      this.placeholder,
      '',
      '## Visualforce Source',
      '```xml',
      this.vfRawContent,
      '```',
      '',
    ];
  }

  /** Main function to generate the AI description with caching and parser fallback */
  public async completeDocWithAiDescription(): Promise<string> {
    const cacheKey = await this.getEnhancedCacheKey();
    let cachedAIResult: string | null = null;

    try {
      cachedAIResult = await getCache(cacheKey, null);

      if (cachedAIResult) {
        return this.injectDescriptionIntoSkeleton(cachedAIResult);
      }

      // If no cache, try AI
      const aiDescription = await super.completeDocWithAiDescription();
      await setCache(cacheKey, aiDescription);
      return this.injectDescriptionIntoSkeleton(aiDescription);
    } catch (err: any) {
      console.warn(`AI generation failed for VF page ${this.metadataName}:`, err.message);
      // Cache the fallback result so we don't keep retrying failed AI calls
      const fallbackResult = this.parserFallbackMarkdown;
      await setCache(cacheKey, fallbackResult); // Cache the fallback
      return this.injectDescriptionIntoSkeleton(fallbackResult);
    }
  }

  /** Helper to inject a description (AI or fallback) into the markdown skeleton */
  private async injectDescriptionIntoSkeleton(descriptionContent: string): Promise<string> {
    const lines = await this.buildInitialMarkdownLines();
    const placeholderIndex = lines.indexOf(this.placeholder);
    if (placeholderIndex >= 0) {
      lines[placeholderIndex] = descriptionContent;
    }
    return lines.join("\n");
  }

  /** Extracts the shortDescription from AI JSON output or returns a default */
  private extractShortDescription(fullMarkdownContent: string): string {
    let shortDescription = 'No description available.';
    try {
      const jsonOutputMatch = fullMarkdownContent.match(/\{[\s\S]*\}/);
      if (jsonOutputMatch) {
        const aiJson = JSON.parse(jsonOutputMatch[0]);
        shortDescription = aiJson.shortDescription || shortDescription;
      }
    } catch (jsonErr: any) {
      console.warn(`Failed to parse AI JSON for shortDescription for ${this.metadataName}: ${jsonErr.message}`);
      shortDescription = 'AI description could not be parsed, using parser fallback.';
    }
    return shortDescription;
  }

  /** Static method for building the index.md for all VF pages */
  public static buildIndexTable(
    outputRoot: string,
    vfDescriptions: VfDocGenerationResult[],
  ) {
    const filtered = vfDescriptions;

    if (filtered.length === 0) return [];

    const lines: string[] = [
      "## Visualforce Pages",
      "",
      "| Visualforce Page | Description |",
      "| :--------------- | :---------- |"
    ];

    for (const vf of filtered) {
      const relativePathToIndex = path.relative(path.join(outputRoot, 'vf'), vf.outputPath);
      const pageCell = `[${vf.name}](${relativePathToIndex})`;
      const descriptionCell = vf.shortDescription || 'No description available.'
      lines.push(`| ${pageCell} | ${descriptionCell} |`);
    }

    lines.push("");
    return lines;
  }
}
