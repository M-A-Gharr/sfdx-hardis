import { XMLParser } from 'fast-xml-parser';

export interface VfComponentUsage {
  name: string;
  namespace: string;
  attributes: Record<string, string>;
  //lineNumber?: number;
}

export interface VfFieldReference {
  expression: string;
  context: string;
  //lineNumber?: number;
  sObjectName?: string;
  fieldName?: string;
}

export interface VfParsedInfo {
  controllerName?: string;
  customControllerName?: string;
  extensionNames: string[];
  components: VfComponentUsage[];
  fieldReferences: VfFieldReference[];
  apexExpressions: string[];
  formCount: number;
  hasRemoteObjects: boolean;
  hasStaticResources: boolean;
  templateFragments: string[];
  apiVersion?: string;
  pageLabel?: string;
  inputBindings: string[];
  buttonActions: string[];
  pageBlocks: {
    title?: string;
    id?: string;
    components: VfComponentUsage[];
  }[];
  actionSupports: {
    event?: string;
    reRender?: string;
    action?: string;
    status?: string;
  }[];
  outputPanels: {
    id?: string;
    layout?: string;
    contentPreview?: string;
  }[];
  sObjectReferences: string[];
  detailedFieldReferences: string[];
  customComponents: string[];
  scripts: {
    type: 'Static Resource' | 'Inline Script' | 'External URL';
    value: string;
  }[];
}

/**
 * VfParser - refactored, modular, and type-safe Visualforce parser.
 *
 * Features:
 * - Robust XML parsing with fallback regex extraction
 * - Component detection and attribute extraction
 * - PageBlock stack to correctly attach child components
 * - Input bindings, button actions, actionSupport, outputPanel parsing
 * - Script extraction (inline, external src, apex:includeScript)
 * - Apex expression extraction with improved heuristics
 * - Field reference processing into sObject + field
 */

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
    const result = VfParser.createEmptyResult();

    try {
      const parsedData = VfParser.xmlParser.parse(vfContent);

      if (!parsedData || typeof parsedData !== 'object' || !parsedData['apex:page']) {
        // fallback
        VfParser._extractBasicVfInfo(vfContent, result);
        VfParser.extractApexExpressions(vfContent, result);
        VfParser.extractScriptTags(vfContent, result);
        VfParser.extractInputBindingsAndButtonActions(vfContent, result);
        VfParser.extractAjaxInteractions(vfContent, result);
        return result;
      }

      const pageTag = parsedData['apex:page'];

      // Basic page attributes
      VfParser.assignPageAttributesFromXml(pageTag, result, vfContent);

      // Pre-scan: template fragments & scripts (these are cheap and helpful)
      result.templateFragments = VfParser.extractTemplateFragments(vfContent);
      VfParser.extractScriptTags(vfContent, result);

      // Traverse the XML AST building structure
      VfParser.traverseNode(pageTag, result, 'apex:page');

      // Post-process collected results
      result.apexExpressions = VfParser.uniqueAndSortExpressions(result.apexExpressions);
      result.inputBindings = Array.from(new Set(result.inputBindings));
      result.buttonActions = Array.from(new Set(result.buttonActions));
      result.customComponents = Array.from(new Set(result.customComponents));
      result.sObjectReferences = Array.from(new Set(result.sObjectReferences));
      result.detailedFieldReferences = Array.from(new Set(result.detailedFieldReferences));
      VfParser.processFieldReferences(result);
    } catch (err: any) {
      // On any parse error fallback to regex-based extraction
      VfParser._extractBasicVfInfo(vfContent, result);
      VfParser.extractApexExpressions(vfContent, result);
      VfParser.extractScriptTags(vfContent, result);
      VfParser.extractInputBindingsAndButtonActions(vfContent, result);
      VfParser.extractAjaxInteractions(vfContent, result);
    }

    return result;
  }

  // Create a fresh result object with guaranteed arrays
  private static createEmptyResult(): VfParsedInfo {
    return {
      extensionNames: [],
      components: [],
      fieldReferences: [],
      apexExpressions: [],
      formCount: 0,
      hasRemoteObjects: false,
      hasStaticResources: false,
      templateFragments: [],
      apiVersion: undefined,
      pageLabel: undefined,
      inputBindings: [],
      buttonActions: [],
      pageBlocks: [],
      actionSupports: [],
      outputPanels: [],
      sObjectReferences: [],
      detailedFieldReferences: [],
      customComponents: [],
      scripts: [],
    };
  }

  // Assign simple page attributes when XML parsing succeeded
  private static assignPageAttributesFromXml(pageTag: any, result: VfParsedInfo, vfContent: string) {
    if (pageTag['@_standardController']) result.controllerName = pageTag['@_standardController'];
    if (pageTag['@_controller']) result.customControllerName = pageTag['@_controller'];
    if (pageTag['@_extensions']) result.extensionNames = String(pageTag['@_extensions']).split(',').map((s: string) => s.trim());
    if (pageTag['@_apiVersion']) result.apiVersion = String(pageTag['@_apiVersion']);
    if (pageTag['@_label']) result.pageLabel = String(pageTag['@_label']);

    // booleans and counts from raw content (reliable)
    result.formCount = (vfContent.match(/<apex:form\b/gi) || []).length;
    result.hasRemoteObjects = vfContent.includes('apex:remoteObjectModel') || vfContent.includes('Visualforce.remoting');
    result.hasStaticResources = vfContent.includes('$Resource.') || vfContent.includes('<apex:stylesheet') || vfContent.includes('<apex:includeScript');
  }

  /**
   * traverseNode
   * - Walks the parsed XML object (fast-xml-parser output)
   * - Uses a stack to maintain current active pageBlock (so pageBlock components are attached properly)
   */
  private static traverseNode(root: any, result: VfParsedInfo, rootContext = 'unknown') {
    const pageBlockStack: Array<{ title?: string; id?: string; components: VfComponentUsage[] }> = [];

    const traverse = (node: any, context: string, parentComponent?: VfComponentUsage, path: string[] = []) => {
      if (node == null || typeof node !== 'object') return;

      for (const key of Object.keys(node)) {
        const value = node[key];
        const newContext = key.startsWith('@_') ? `${context}.${key.substring(2)}` : `${context}.${key}`;
        const currentPath = [...path, key];
        let currentComponentForChildren: VfComponentUsage | undefined;

        // If this is a component-like node (namespace:name)
        if (key.includes(':') && key !== '#text') {
          const [namespace, name] = key.split(':', 2);
          if (namespace && name) {
            const attributes = VfParser.parseAttributes(value, namespace, name, result);

            // Build component descriptor
            const componentUsage: VfComponentUsage = {
              namespace,
              name,
              attributes,
            };

            result.components.push(componentUsage);

            if (namespace === 'c') {
              result.customComponents.push(name);
            }

            // Track as current component for children
            currentComponentForChildren = componentUsage;

            // Special handling for few component types
            if (namespace === 'apex' && name === 'form') {
              result.formCount++;
            } else if (namespace === 'apex' && name === 'pageBlock') {
              const pageBlock = {
                title: attributes.title,
                id: attributes.id,
                components: [] as VfComponentUsage[],
              };
              result.pageBlocks.push(pageBlock);
              pageBlockStack.push(pageBlock);

              // Recurse children with this pageBlock as context and component parent
              traverse(value, newContext, componentUsage, currentPath);

              // Pop the pageBlock after children processed
              pageBlockStack.pop();
              // Continue to next sibling (we already traversed the children)
              continue;
            } else if (namespace === 'apex' && name === 'actionSupport') {
              result.actionSupports.push({
                event: attributes.event,
                reRender: attributes.reRender,
                action: attributes.action,
                status: attributes.status,
              });
            } else if (namespace === 'apex' && name === 'outputPanel') {
              result.outputPanels.push({
                id: attributes.id,
                layout: attributes.layout,
                contentPreview: VfParser.extractContentPreview(value),
              });
            }

            // If we are currently inside a pageBlock, attach this component to the active block
            if (pageBlockStack.length > 0) {
              const currentBlock = pageBlockStack[pageBlockStack.length - 1];
              currentBlock.components.push(componentUsage);
            }
          }
        }

        // If there's textual content, scan for expressions
        if (key === '#text' && typeof value === 'string' && value.trim().length > 0) {
          VfParser.extractApexExpressions(value, result, context);
        }

        // Recurse into children (arrays or object)
        if (value != null && typeof value === 'object') {
          if (Array.isArray(value)) {
            for (const item of value) {
              traverse(item, newContext, (key.includes(':') && key !== '#text') ? currentComponentForChildren : parentComponent, currentPath);
            }
          } else {
            traverse(value, newContext, (key.includes(':') && key !== '#text') ? currentComponentForChildren : parentComponent, currentPath);
          }
        }
      }
    };

    traverse(root, rootContext, undefined, []);
  }

  // Parse attributes of a node, extract apex expressions where applicable, manage input/button bindings
  private static parseAttributes(valueNode: any, namespace: string, name: string, result: VfParsedInfo): Record<string, string> {
    const attributes: Record<string, string> = {};

    if (valueNode && typeof valueNode === 'object') {
      for (const attrKey of Object.keys(valueNode)) {
        // attribute keys in fast-xml-parser with ignoreAttributes=false are direct keys (not necessarily starting with '@_')
        // but when using attributeNamePrefix='' and ignoreAttributes=false, parser uses attribute keys as '@_attr'
        if (attrKey.startsWith('@_')) {
          const attrName = attrKey.substring(2);
          const attrValue = String(valueNode[attrKey]);
          attributes[attrName] = attrValue;
          VfParser.extractApexExpressions(attrValue, result, `${namespace}:${name}.${attrName}`);

          // Special-case attribute semantics
          if (attrName === 'value' && (name.startsWith('input') || name.startsWith('select'))) {
            VfParser.extractInputBindings(attrValue, result);
          }
          if (attrName === 'action' && (name.includes('commandButton') || name.includes('commandLink') || name === 'button')) {
            VfParser.extractButtonActions(attrValue, result);
          }
          if (attrName === 'rendered') {
            // capture conditions used for rendering
            VfParser.extractApexExpressions(attrValue, result, `${namespace}:${name}.${attrName}`);
          }
        } else {
          // Some parser outputs may expose attributes differently; treat non-object primitive-like entries as attributes
          const val = valueNode[attrKey];
          if (typeof val !== 'object' && !attrKey.includes(':') && !attrKey.startsWith('#')) {
            const attrName = attrKey;
            const attrValue = String(val);
            attributes[attrName] = attrValue;
            VfParser.extractApexExpressions(attrValue, result, `${namespace}:${name}.${attrName}`);

            if (attrName === 'value' && (name.startsWith('input') || name.startsWith('select'))) {
              VfParser.extractInputBindings(attrValue, result);
            }
            if (attrName === 'action' && (name.includes('commandButton') || name.includes('commandLink') || name === 'button')) {
              VfParser.extractButtonActions(attrValue, result);
            }
            if (attrName === 'rendered') {
              VfParser.extractApexExpressions(attrValue, result, `${namespace}:${name}.${attrName}`);
            }
          }
        }
      }
    }

    return attributes;
  }

  // Improved detection for apex expressions and classification
  private static extractApexExpressions(text: string, result: VfParsedInfo, context: string = 'unknown'): void {
    if (!text || typeof text !== 'string') return;
    const expressionRegex = /\{!\s*([^}]+?)\s*\}/g;
    let match: RegExpExecArray | null;

    while ((match = expressionRegex.exec(text)) !== null) {
      const exprContent = match[1].trim();

      // Heuristics
      const isFunction = /\w+\s*\(/.test(exprContent); // e.g. IF(, someFunc(
      const isProperty = /[A-Za-z0-9_]+\.[A-Za-z0-9_.]+/.test(exprContent); // e.g. account.Name
      const isBooleanExpression = /\b(?:AND|OR|NOT|&&|\|\||==|!=|>|<)\b/i.test(exprContent);

      if (isFunction || isBooleanExpression) {
        result.apexExpressions.push(exprContent);
      } else if (isProperty) {
        result.apexExpressions.push(exprContent);
      } else {
        // Treat as simple field/variable
        result.fieldReferences.push({
          expression: exprContent,
          context,
        });
      }
    }
  }

  // extract input bindings like value="{!acct.Name}"
  private static extractInputBindings(attrValue: string, result: VfParsedInfo): void {
    if (!attrValue) return;
    result.inputBindings ??= [];
    const m = attrValue.match(/\{!\s*([^}]+?)\s*\}/);
    if (m && m[1]) {
      const binding = m[1].trim();
      if (binding.length > 0 && !result.inputBindings.includes(binding)) {
        result.inputBindings.push(binding);
      }
    }
  }

  // extract button actions like action="{!save}"
  private static extractButtonActions(attrValue: string, result: VfParsedInfo): void {
    if (!attrValue) return;
    result.buttonActions ??= [];
    const m = attrValue.match(/\{!\s*([^}]+?)\s*\}/);
    if (m && m[1]) {
      const action = m[1].trim();
      if (action.length > 0 && !result.buttonActions.includes(action)) {
        result.buttonActions.push(action);
      }
    }
  }

  // Basic content preview for outputPanel
  private static extractContentPreview(nodeValue: any): string | undefined {
    // prefer text node
    if (nodeValue && typeof nodeValue === 'object') {
      if (typeof nodeValue['#text'] === 'string') {
        const txt = nodeValue['#text'].trim();
        return txt.length > 100 ? txt.substring(0, 100) + '...' : txt;
      }
      // fallback: stringify small children
      try {
        const s = JSON.stringify(nodeValue).slice(0, 120);
        return s.length === 120 ? s + '...' : s;
      } catch {
        return undefined;
      }
    }
    return undefined;
  }

  // Script extraction: inline, external <script src>, and <apex:includeScript>
  private static extractScriptTags(vfContent: string, result: VfParsedInfo): void {
    // Inline or script with src
    const scriptRegex = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
    let m: RegExpExecArray | null;
    while ((m = scriptRegex.exec(vfContent)) !== null) {
      const attrs = m[1] || '';
      const body = m[2] || '';
      const srcMatch = attrs.match(/src\s*=\s*"(.*?)"/i) || attrs.match(/src\s*=\s*'(.*?)'/i);

      if (srcMatch && srcMatch[1]) {
        result.scripts.push({ type: 'External URL', value: srcMatch[1] });
      } else if (body && body.trim().length > 0) {
        // store snippet
        const snippet = body.trim().substring(0, 200) + (body.trim().length > 200 ? '...' : '');
        result.scripts.push({ type: 'Inline Script', value: snippet });
      }
    }

    // apex:includeScript
    const includeScriptRegex = /<apex:includeScript\s+[^>]*value\s*=\s*"(.*?)"[^>]*\/?>/gi;
    while ((m = includeScriptRegex.exec(vfContent)) !== null) {
      if (m[1]) {
        result.scripts.push({ type: 'Static Resource', value: m[1] });
      }
    }

    // Ensure unique script entries
    result.scripts = Array.from(new Set(result.scripts.map(s => JSON.stringify(s)))).map(s => JSON.parse(s));
  }

  // Template fragments: composition, insert, define...
  private static extractTemplateFragments(vfContent: string): string[] {
    const fragments: string[] = [];
    const patterns = [
      { regex: /<apex:composition\s+[^>]*template\s*=\s*"([^"]+)"/gi, label: 'Template' },
      { regex: /<apex:insert\s+[^>]*name\s*=\s*"([^"]+)"/gi, label: 'Insert Point' },
      { regex: /<apex:define\s+[^>]*name\s*=\s*"([^"]+)"/gi, label: 'Content Definition' },
      { regex: /<apex:composition\s+[^>]*define\s*=\s*"([^"]+)"/gi, label: 'Composition Definition' }
    ];

    for (const p of patterns) {
      let m: RegExpExecArray | null;
      while ((m = p.regex.exec(vfContent)) !== null) {
        if (m[1]) fragments.push(`${p.label}: ${m[1]}`);
      }
    }

    return Array.from(new Set(fragments));
  }

  // Basic fallback info extraction using lightweight regexes
  public static _extractBasicVfInfo(vfContent: string, result: VfParsedInfo): void {
    const controllerMatch = vfContent.match(/standardController\s*=\s*"([^"]*)"/i);
    if (controllerMatch) result.controllerName = controllerMatch[1];

    const extensionsMatch = vfContent.match(/extensions\s*=\s*"([^"]*)"/i);
    if (extensionsMatch) result.extensionNames = extensionsMatch[1].split(',').map(s => s.trim());

    const componentRegex = /<([a-zA-Z0-9_-]+):([a-zA-Z0-9_-]+)/g;
    let compMatch: RegExpExecArray | null;
    const seen = new Set<string>();
    while ((compMatch = componentRegex.exec(vfContent)) !== null) {
      const ns = compMatch[1], nm = compMatch[2];
      const key = `${ns}:${nm}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.components.push({ namespace: ns, name: nm, attributes: {} });
        if (ns === 'c') result.customComponents.push(nm);
      }
    }
  }

  // simplifiedParse for DocBuilderVf and other light uses
  public static simplifiedParse(content: string): VfParsedInfo {
    const result = VfParser.createEmptyResult();
    VfParser._extractBasicVfInfo(content, result);
    VfParser.extractApexExpressions(content, result);
    result.formCount = (content.match(/<apex:form\b/gi) || []).length;
    result.hasRemoteObjects = content.includes('apex:remoteObjectModel') || content.includes('Visualforce.remoting');
    result.hasStaticResources = content.includes('$Resource.') || content.includes('<apex:stylesheet') || content.includes('<apex:includeScript');
    result.templateFragments = VfParser.extractTemplateFragments(content);
    VfParser.extractScriptTags(content, result);
    VfParser.extractInputBindingsAndButtonActions(content, result);
    VfParser.extractAjaxInteractions(content, result);
    VfParser.processFieldReferences(result);
    return result;
  }

  // parse input bindings and button actions using regex fallback
  private static extractInputBindingsAndButtonActions(vfContent: string, result: VfParsedInfo): void {
    result.inputBindings ??= [];
    result.buttonActions ??= [];

    const inputRegex = /(?:<apex:(?:inputText|inputField|selectList)\b[^>]*\bvalue\s*=\s*"\{!([^}]+)\}"[^>]*>)/gi;
    const buttonActionRegex = /(?:<apex:(?:commandButton|commandLink|button)\b[^>]*\baction\s*=\s*"\{!([^}]+)\}"[^>]*>)/gi;

    let m: RegExpExecArray | null;
    while ((m = inputRegex.exec(vfContent)) !== null) {
      if (m[1]) {
        const b = m[1].trim();
        if (b && !result.inputBindings.includes(b)) result.inputBindings.push(b);
      }
    }
    while ((m = buttonActionRegex.exec(vfContent)) !== null) {
      if (m[1]) {
        const a = m[1].trim();
        if (a && !result.buttonActions.includes(a)) result.buttonActions.push(a);
      }
    }

    result.inputBindings = Array.from(new Set(result.inputBindings));
    result.buttonActions = Array.from(new Set(result.buttonActions));
  }

  // fallback extraction of actionSupport and outputPanel via regex
  private static extractAjaxInteractions(vfContent: string, result: VfParsedInfo): void {
    const actionSupportRegex = /<apex:actionSupport\b([^>]*)\/?>/gi;
    const outputPanelRegex = /<apex:outputPanel\b([^>]*)>([\s\S]*?)<\/apex:outputPanel>/gi;
    let m: RegExpExecArray | null;

    while ((m = actionSupportRegex.exec(vfContent)) !== null) {
      const attrs = m[1] || '';
      const event = VfParser.extractAttrValue(attrs, 'event');
      const reRender = VfParser.extractAttrValue(attrs, 'reRender');
      const action = VfParser.extractAttrValue(attrs, 'action');
      const status = VfParser.extractAttrValue(attrs, 'status');
      result.actionSupports.push({ event, reRender, action, status });
    }

    while ((m = outputPanelRegex.exec(vfContent)) !== null) {
      const attrs = m[1] || '';
      const body = m[2] || '';
      const id = VfParser.extractAttrValue(attrs, 'id');
      const layout = VfParser.extractAttrValue(attrs, 'layout');
      const contentPreview = body.trim() ? (body.trim().substring(0, 100) + (body.trim().length > 100 ? '...' : '')) : undefined;
      result.outputPanels.push({ id, layout, contentPreview });
    }
  }

  // small helper to extract attribute value from HTML-like string
  private static extractAttrValue(attrsString: string, name: string): string | undefined {
    const m = attrsString.match(new RegExp(`${name}\\s*=\\s*"(.*?)"`, 'i')) || attrsString.match(new RegExp(`${name}\\s*=\\s*'(.*?)'`, 'i'));
    return m ? m[1] : undefined;
  }

  // Improve expression uniqueness & sort by "complexity"
  private static uniqueAndSortExpressions(arr: string[]): string[] {
    const unique = Array.from(new Set(arr));
    return unique.sort((a, b) => {
      const aC = a.includes('(') ? 2 : a.includes('.') ? 1 : 0;
      const bC = b.includes('(') ? 2 : b.includes('.') ? 1 : 0;
      return bC - aC;
    });
  }

  // Build sObject and detailed field lists from fieldReferences
  private static processFieldReferences(result: VfParsedInfo): void {
    const sObjects = new Set<string>();
    const detailed = new Set<string>();

    if (result.controllerName && !result.controllerName.includes('.')) {
      sObjects.add(result.controllerName);
    }

    for (const ref of result.fieldReferences) {
      const parts = ref.expression.split('.');
      if (parts.length >= 2) {
        sObjects.add(parts[0]);
        detailed.add(ref.expression);
        ref.sObjectName = parts[0];
        ref.fieldName = parts.slice(1).join('.');
      } else if (parts.length === 1 && result.controllerName && !result.controllerName.includes('.')) {
        detailed.add(`${result.controllerName}.${ref.expression}`);
        ref.sObjectName = result.controllerName;
        ref.fieldName = ref.expression;
      }
    }

    result.sObjectReferences = Array.from(sObjects);
    result.detailedFieldReferences = Array.from(detailed);
  }
}
