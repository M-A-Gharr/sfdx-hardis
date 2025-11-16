import { XMLParser } from 'fast-xml-parser';

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

export class VfParser {
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
      const parsedData = VfParser.xmlParser.parse(vfContent);

      if (!parsedData || !parsedData['apex:page']) {
        return result;
      }

      const pageTag = parsedData['apex:page'];

      // Extract controller and extension names
      if (pageTag.standardController) {
        result.controllerName = pageTag.standardController;
      }
      if (pageTag.extensions) {
        result.extensionNames = pageTag.extensions.split(',').map((ext: string) => ext.trim());
      }

      // Check for forms
      result.hasForms = vfContent.includes('<apex:form');

      // Check for remote objects
      result.hasRemoteObjects = vfContent.includes('apex:remoteObjectModel') ||
        vfContent.includes('Visualforce.remoting');

      // Check for static resources
      result.hasStaticResources = vfContent.includes('$Resource.') ||
        vfContent.includes('apex:stylesheet') ||
        vfContent.includes('apex:includeScript');

      // Extract template fragments
      result.templateFragments = this.extractTemplateFragments(vfContent);

      // Helper to traverse nodes and extract info
      const traverse = (node: any) => {
        if (typeof node !== 'object' || node === null) return;

        for (const key in node) {
          if (!Object.prototype.hasOwnProperty.call(node, key)) continue;

          const value = node[key];

          // Identify VF components (excluding apex:page and text nodes)
          if (key.includes(':') && key !== 'apex:page' && key !== '#text') {
            const [namespace, name] = key.split(':');
            if (namespace && name) {
              const attributes: Record<string, string> = {};

              // Extract attributes
              for (const attrKey in value) {
                if (attrKey.startsWith('@_')) {
                  attributes[attrKey.substring(2)] = value[attrKey];
                } else if (typeof value[attrKey] !== 'object' && !attrKey.includes(':')) {
                  attributes[attrKey] = value[attrKey];
                }
              }

              result.components.push({
                namespace,
                name,
                attributes,
              });
            }
          }

          // Process text content for Apex expressions
          if (key === '#text' && typeof value === 'string') {
            this.extractApexExpressions(value, result);
          }

          // Process attribute values for Apex expressions
          if (typeof value === 'string') {
            this.extractApexExpressions(value, result);
          }

          // Recursively traverse
          if (typeof value === 'object' && value !== null) {
            if (Array.isArray(value)) {
              for (const item of value) {
                traverse(item);
              }
            } else {
              traverse(value);
            }
          }
        }
      };

      traverse(pageTag);

      // Filter unique apex expressions and sort by complexity
      result.apexExpressions = Array.from(new Set(result.apexExpressions))
        .sort((a, b) => {
          // Sort by complexity (method calls first, then properties)
          const aComplexity = a.includes('(') ? 2 : a.includes('.') ? 1 : 0;
          const bComplexity = b.includes('(') ? 2 : b.includes('.') ? 1 : 0;
          return bComplexity - aComplexity;
        });

      // Sort components by frequency for better analysis
      result.components.sort((a, b) => {
        const aCount = result.components.filter(c => c.name === a.name).length;
        const bCount = result.components.filter(c => c.name === b.name).length;
        return bCount - aCount;
      });

    } catch (error) {
      console.warn('VF Parser: Error parsing Visualforce content, using fallback extraction');
      this.fallbackParse(vfContent, result);
    }

    return result;
  }

  private static extractApexExpressions(text: string, result: VfParsedInfo): void {
    const expressionRegex = /\{!([^}]+)\}/g;
    let match;

    while ((match = expressionRegex.exec(text)) !== null) {
      const exprContent = match[1].trim();

      // Enhanced classification of expressions
      if (exprContent.includes('(') && exprContent.includes(')')) {
        // Method call
        result.apexExpressions.push(exprContent);
      } else if (exprContent.includes('.')) {
        // Complex property access
        result.apexExpressions.push(exprContent);
      } else {
        // Simple property or variable
        result.fieldReferences.push({
          expression: exprContent,
          context: 'unknown'
        });
      }
    }
  }

  private static extractTemplateFragments(vfContent: string): string[] {
    const fragments: string[] = [];
    const patterns = [
      { regex: /<apex:composition\s+template="([^"]+)"/g, label: 'Template' },
      { regex: /<apex:insert\s+name="([^"]+)"/g, label: 'Insert Point' },
      { regex: /<apex:define\s+name="([^"]+)"/g, label: 'Content Definition' },
      { regex: /<apex:composition\s+define="([^"]+)"/g, label: 'Composition Definition' }
    ];

    for (const { regex, label } of patterns) {
      const matches = vfContent.match(regex);
      if (matches) {
        fragments.push(`${label}: ${matches.join(', ')}`);
      }
    }

    return fragments;
  }

  private static fallbackParse(vfContent: string, result: VfParsedInfo): void {
    // Fallback parsing using regex for malformed XML
    const controllerMatch = vfContent.match(/standardController\s*=\s*"([^"]*)"/);
    if (controllerMatch) {
      result.controllerName = controllerMatch[1];
    }

    const extensionsMatch = vfContent.match(/extensions\s*=\s*"([^"]*)"/);
    if (extensionsMatch) {
      result.extensionNames = extensionsMatch[1].split(',').map(ext => ext.trim());
    }

    // Extract components using regex
    const componentRegex = /<([a-z]+):([a-zA-Z]+)/g;
    let compMatch;
    while ((compMatch = componentRegex.exec(vfContent)) !== null) {
      result.components.push({
        namespace: compMatch[1],
        name: compMatch[2],
        attributes: {}
      });
    }

    // Extract expressions
    this.extractApexExpressions(vfContent, result);
  }
}
