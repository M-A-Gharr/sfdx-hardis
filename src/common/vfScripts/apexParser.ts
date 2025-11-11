import fs from "fs";
import path from "path";

export interface ApexProperty {
  name: string;
  type: string;
  visibility: string;
  modifiers?: string[];
  description?: string;
}

export interface ApexMethod {
  name: string;
  type: string;
  visibility: string;
  parameters?: string;
  signature?: string;
  modifiers?: string[];
  description?: string;
  body?: string;
}

export interface ApexClassInfo {
  name: string;
  properties: ApexProperty[];
  methods: ApexMethod[];
  innerClasses: ApexClassInfo[];
}

/**
 * Reads and parses an Apex class file (.cls or .cps)
 */
export function parseApexClassFile(apexDir: string, className: string): ApexClassInfo | null {
  const possibleFiles = [
    path.join(apexDir, `${className}.cls`),
    path.join(apexDir, `${className}.cps`),
  ];

  const filePath = possibleFiles.find((f) => fs.existsSync(f));
  if (!filePath) return null;

  const content = fs.readFileSync(filePath, "utf8");
  return parseApexClassContent(content, className);
}

/**
 * Parses Apex class content and extracts properties, methods, inner classes
 */
export function parseApexClassContent(content: string, className: string): ApexClassInfo {
  const info: ApexClassInfo = { name: className, properties: [], methods: [], innerClasses: [] };

  // --- Properties (with Javadoc comments) ---
  const propRegex = /(\/\*\*[\s\S]*?\*\/)?\s*(public|private|protected|global)\s+([\w<>]+)\s+(\w+)\s*\{\s*get;\s*set;\s*\}/g;
  let match;
  while ((match = propRegex.exec(content)) !== null) {
    const docComment = match[1]?.replace(/\/\*\*|\*\//g, "").replace(/^\s*\*\s?/gm, "").trim();
    info.properties.push({
      visibility: match[2],
      type: match[3],
      name: match[4],
      modifiers: [],
      description: docComment || `Property ${match[4]} of type ${match[3]}`,
    });
  }

  // --- Methods ---
  const methodRegex = /(\/\*\*[\s\S]*?\*\/)?\s*(public|private|protected|global)\s+([\w<>]+)\s+(\w+)\s*\(([^)]*)\)\s*\{/g;
  while ((match = methodRegex.exec(content)) !== null) {
    const docComment = match[1]?.replace(/\/\*\*|\*\//g, "").replace(/^\s*\*\s?/gm, "").trim();
    const modifiers: string[] = [];
    const preMethodText = content.slice(0, match.index);
    if (preMethodText.includes("static")) modifiers.push("static");
    if (preMethodText.includes("final")) modifiers.push("final");

    info.methods.push({
      name: match[4],
      type: match[3],
      visibility: match[2],
      parameters: match[5]?.trim() || "",
      modifiers,
      description: docComment || `Method ${match[4]} returning ${match[3]}`,
    });
  }

  // --- Inner classes ---
  const innerRegex = /class\s+([\w_]+)\s*\{([\s\S]*?)\}/g;
  while ((match = innerRegex.exec(content)) !== null) {
    const innerParsed = parseApexClassContent(match[2], match[1]);
    info.innerClasses.push(innerParsed);
  }

  return info;
}
