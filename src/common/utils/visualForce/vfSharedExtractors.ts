import crypto from "crypto";
import * as fs from "fs-extra";
import * as path from "path";
import { glob } from "glob";
import { GLOB_IGNORE_PATTERNS } from "../projectUtils.js";
import { XMLParser } from "fast-xml-parser";
import { ApexParser, ApexParsedInfo } from "./apexParser.js";

export interface VfComponentUsage {
  name: string;
  namespace: string;
  attributes: Record<string, string>;
  lineNumber?: number;
}

export interface VfFieldReference {
  expression: string;
  context: string;
  lineNumber?: number;
}

export interface VfParsedInfo {
  controllerName?: string;
  extensionNames: string[];
  components: VfComponentUsage[];
  fieldReferences: VfFieldReference[];
  apexExpressions: string[];
  hasForms: boolean;
  hasRemoteObjects: boolean;
  hasStaticResources: boolean;
  templateFragments: string[];
}

export interface VfDocGenerationResult {
  markdownContent: string;
  shortDescription: string;
  name: string;
  outputPath: string;
  impactedObjects?: string[];
}

/** Shared class to handle VF parsing & extraction (used by parsers and doc builders) */
export class VfSharedExtractor {
  private static xmlParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    allowBooleanAttributes: true,
    alwaysCreateTextNode: false,
    processEntities: true,
    stopNodes: ["*.script", "*.style"],
    preserveOrder: false,
    trimValues: true,
  });

  /** Parse VF content into structured info */
  public static async parse(vfContent: string): Promise<VfParsedInfo> {
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

    try {
      const parsedData = VfSharedExtractor.xmlParser.parse(vfContent);
      const pageTag = parsedData['apex:page'] || {};

      result.controllerName = pageTag.standardController;
      result.extensionNames = pageTag.extensions?.split(',').map((ext: string) => ext.trim()) || [];

      result.hasForms = vfContent.includes('<apex:form');
      result.hasRemoteObjects = vfContent.includes('apex:remoteObjectModel') || vfContent.includes('Visualforce.remoting');
      result.hasStaticResources = vfContent.includes('$Resource.') || vfContent.includes('apex:stylesheet') || vfContent.includes('apex:includeScript');

      result.templateFragments = this.extractTemplateFragments(vfContent);
      this.traverseNodes(pageTag, result);

      // Remove duplicates and sort expressions
      result.apexExpressions = Array.from(new Set(result.apexExpressions))
        .sort((a, b) => {
          const aComplex = a.includes('(') ? 2 : a.includes('.') ? 1 : 0;
          const bComplex = b.includes('(') ? 2 : b.includes('.') ? 1 : 0;
          return bComplex - aComplex;
        });

      // Sort components by frequency
      result.components.sort((a, b) => {
        const aCount = result.components.filter(c => c.name === a.name).length;
        const bCount = result.components.filter(c => c.name === b.name).length;
        return bCount - aCount;
      });
    } catch {
      console.warn("VF Shared Extractor: Parsing failed, using fallback.");
      this.fallbackParse(vfContent, result);
    }

    return result;
  }

  private static traverseNodes(node: any, result: VfParsedInfo) {
    if (!node || typeof node !== "object") return;

    for (const key in node) {
      if (!Object.prototype.hasOwnProperty.call(node, key)) continue;
      const value = node[key];

      // VF components
      if (key.includes(":") && key !== "apex:page" && key !== "#text") {
        const [namespace, name] = key.split(":");
        if (namespace && name) {
          const attrs: Record<string, string> = {};
          for (const attrKey in value) {
            if (attrKey.startsWith("@_")) attrs[attrKey.slice(2)] = value[attrKey];
            else if (typeof value[attrKey] !== "object" && !attrKey.includes(":")) attrs[attrKey] = value[attrKey];
          }
          result.components.push({ namespace, name, attributes: attrs });
        }
      }

      // Extract apex expressions
      if (typeof value === "string") this.extractApexExpressions(value, result);
      if (typeof value === "object") {
        if (Array.isArray(value)) value.forEach(item => this.traverseNodes(item, result));
        else this.traverseNodes(value, result);
      }
    }
  }

  private static extractApexExpressions(text: string, result: VfParsedInfo) {
    const regex = /\{!([^}]+)\}/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      const expr = match[1].trim();
      if (expr.includes("(") || expr.includes(".")) result.apexExpressions.push(expr);
      else result.fieldReferences.push({ expression: expr, context: "unknown" });
    }
  }

  private static extractTemplateFragments(content: string): string[] {
    const fragments: string[] = [];
    const patterns = [
      { regex: /<apex:composition\s+template="([^"]+)"/g, label: 'Template' },
      { regex: /<apex:insert\s+name="([^"]+)"/g, label: 'Insert Point' },
      { regex: /<apex:define\s+name="([^"]+)"/g, label: 'Content Definition' },
      { regex: /<apex:composition\s+define="([^"]+)"/g, label: 'Composition Definition' }
    ];
    for (const { regex, label } of patterns) {
      const matches = content.match(regex);
      if (matches) fragments.push(`${label}: ${matches.join(', ')}`);
    }
    return fragments;
  }

  /** Fallback parse for malformed XML */
  private static fallbackParse(content: string, result: VfParsedInfo) {
    const controller = content.match(/standardController\s*=\s*"([^"]*)"/)?.[1];
    const extensions = content.match(/extensions\s*=\s*"([^"]*)"/)?.[1]?.split(',').map(e => e.trim()) || [];
    result.controllerName = controller;
    result.extensionNames = extensions;

    const compRegex = /<([a-z]+):([a-zA-Z]+)/g;
    let match;
    while ((match = compRegex.exec(content)) !== null) {
      result.components.push({ namespace: match[1], name: match[2], attributes: {} });
    }

    this.extractApexExpressions(content, result);
  }

  /** Compute hash for caching */
  public static computeHash(content: string): string {
    return crypto.createHash("md5").update(content).digest("hex");
  }

  /** Resolve Apex files given a className */
  public static async findApexClassFile(className: string, projectRoot: string): Promise<string | undefined> {
    const files = await glob(`**/${className}.cls`, { cwd: projectRoot, ignore: GLOB_IGNORE_PATTERNS });
    return files.length > 0 ? path.join(projectRoot, files[0]) : undefined;
  }

  /** Parse Apex classes related to VF page */
  public static async parseApexControllers(controllerNames: string[], projectRoot: string, maxToParse = 10): Promise<Map<string, ApexParsedInfo>> {
    const apexMap = new Map<string, ApexParsedInfo>();
    for (const className of controllerNames.slice(0, maxToParse)) {
      const filePath = await this.findApexClassFile(className, projectRoot);
      if (filePath && await fs.pathExists(filePath)) {
        const content = await fs.readFile(filePath, 'utf-8');
        const parsed = await ApexParser.parse(content, className);
        apexMap.set(className, parsed);
      }
    }
    return apexMap;
  }
}
