import fs from "fs";
import path from "path";
import { parseApexClassFile } from "./apexParser.js";

export interface VfProperty {
  name: string;
  type: string;
  visibility?: string;
  description?: string;
}

export interface VfMethod {
  name: string;
  type: string;
  parameters?: string;
  visibility?: string;
  description?: string;
}

export interface VfPageMetadata {
  name: string;
  controller: string;
  standardController?: string;
  customController?: string;
  extensions?: string[];
  properties: VfProperty[];
  methods: VfMethod[];
  forms?: number;
  inputs?: string[];
  buttons?: string[];
  pageBlocks?: { title: string; items: string[] }[];
  actionSupports?: { event: string; reRender?: string; action?: string; status?: string }[];
  outputPanels?: { id: string; layout?: string; contentPreview?: string }[];
  scripts?: { type: string; value: string }[];
  dependencies?: { objects: string[]; detailedfields: string[]; components: string[] };
  // --- AI enrichment fields (optional) ---
  overview?: string;
  purpose?: string;
  keyFunctions?: string[];
  interactions?: string[];
}

/**
 * Parses a Visualforce (.page) file and extracts core metadata
 */
export class VfParser {
  constructor() { }

  public parseVisualforcePage(filePath: string, apexDir = "force-app/main/default/classes"): VfPageMetadata {
    const content = fs.readFileSync(filePath, "utf8");
    const name = path.basename(filePath, ".page");

    // --- Controllers & Extensions ---
    const customControllerMatch = content.match(/controller\s*=\s*["']([\w.]+)["']/i);
    const standardControllerMatch = content.match(/standardController\s*=\s*["']([\w.]+)["']/i);
    const extensionsMatch = content.match(/extensions\s*=\s*["']([^"']+)["']/i);

    const controller = customControllerMatch?.[1] || standardControllerMatch?.[1] || "UnknownController";
    const extensions = extensionsMatch ? extensionsMatch[1].split(/\s*,\s*/) : [];

    // --- Apex class info ---
    let properties: VfProperty[] = [];
    let methods: VfMethod[] = [];
    const apexInfo = parseApexClassFile(apexDir, controller);
    if (apexInfo) {
      properties = apexInfo.properties.map(p => ({ name: p.name, type: p.type, description: p.description }));
      methods = apexInfo.methods.map(m => ({ name: m.name, type: m.type, parameters: m.parameters, description: m.description }));
    }

    // --- VF structure ---
    const forms = (content.match(/<apex:form\b/gi) || []).length;
    const inputs = Array.from(content.matchAll(/value\s*=\s*"\{!\s*([\w.]+)\s*\}"/g)).map(m => m[1]);
    const buttons = Array.from(content.matchAll(/action\s*=\s*"\{!\s*([\w.]+)\s*\}"/g)).map(m => m[1]);

    // --- PageBlocks ---
    const pageBlocks = Array.from(content.matchAll(/<apex:pageBlock[^>]*title="([^"]*)">([\s\S]*?)<\/apex:pageBlock>/gi)).map(m => ({
      title: m[1],
      items: Array.from(m[2].matchAll(/<apex:(input|output)\w*[^>]*>/g)).map(n => n[0]),
    }));

    // --- ActionSupports ---
    const actionSupports = Array.from(content.matchAll(/<apex:actionSupport[^>]*event="([^"]*)"[^>]*>/g)).map(m => ({
      event: m[1],
      reRender: m[0].match(/reRender="([^"]*)"/)?.[1],
      action: m[0].match(/action="([^"]*)"/)?.[1],
      status: m[0].match(/status="([^"]*)"/)?.[1],
    }));

    // --- OutputPanels ---
    const outputPanels = Array.from(content.matchAll(/<apex:outputPanel[^>]*id="([^"]*)"[^>]*>([\s\S]*?)<\/apex:outputPanel>/g)).map(m => ({
      id: m[1],
      layout: m[0].match(/layout="([^"]*)"/)?.[1],
      contentPreview: m[2].trim().slice(0, 60).replace(/\n/g, " "),
    }));

    // --- Scripts ---
    const scripts = Array.from(content.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)).map(m => ({
      type: "inline",
      value: m[1].trim().slice(0, 60),
    }));

    // --- Dependencies ---
    const dependencies = {
      objects: Array.from(content.matchAll(/\bfrom\s+(\w+)/gi)).map(m => m[1]),
      detailedfields: Array.from(content.matchAll(/\bselect\s+([\w.,\s]+)/gi)).flatMap(m => m[1].split(",").map(f => f.trim())),
      components: Array.from(content.matchAll(/<c:([\w-]+)/gi)).map(m => m[1]),
    };

    return {
      name,
      controller,
      standardController: standardControllerMatch?.[1],
      customController: customControllerMatch?.[1],
      extensions,
      properties,
      methods,
      forms,
      inputs,
      buttons,
      pageBlocks,
      actionSupports,
      outputPanels,
      scripts,
      dependencies,
    };
  }
}
