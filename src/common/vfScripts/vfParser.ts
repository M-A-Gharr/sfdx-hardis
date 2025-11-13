import * as fs from "fs-extra";
import * as path from "path";

export interface VFPageData {
  pageName: string;
  code: string;
  pageMeta: {
    apiVersion?: string;
    label?: string;
  };
  standardController?: string;
  customController?: string;
  extensions: string[];
  pageStructure: {
    forms: number;
    inputs: string[];
    buttons: string[];
  };
  pageBlocks: { title: string; items: string[] }[];
  actionSupports: { event: string; reRender?: string; action?: string; status?: string }[];
  outputPanels: { id?: string; layout?: string; contentPreview?: string }[];
  dependencies: {
    objects: string[];
    detailedfields: string[];
    components: string[];
  };
  scripts: { type: string; value: string }[];
}

export async function parseVFFile(filePath: string): Promise<VFPageData> {
  const code = await fs.readFile(filePath, "utf8");
  const pageName = path.basename(filePath, ".page");

  const pageMeta = {
    apiVersion: code.match(/apiVersion=["']([\d.]+)["']/)?.[1],
    label: code.match(/label=["']([^"']+)["']/)?.[1],
  };

  const standardController = code.match(/standardController=["']([^"']+)["']/)?.[1];
  const customController = code.match(/controller=["']([^"']+)["']/)?.[1];
  const extensions = Array.from(code.matchAll(/extensions=["']([^"']+)["']/g))
    .flatMap((m) => m[1].split(",").map((s) => s.trim()));

  const forms = (code.match(/<apex:form/gi) || []).length;
  const inputs = Array.from(code.matchAll(/value="\{!([^}]+)\}"/g)).map((m) => m[1]);
  const buttons = Array.from(code.matchAll(/action="\{!([^}]+)\}"/g)).map((m) => m[1]);

  const pageBlocks = Array.from(code.matchAll(/<apex:pageBlock[^>]*title=["']([^"']+)["'][^>]*>([\s\S]*?)<\/apex:pageBlock>/g)).map(
    (m) => ({
      title: m[1],
      items: Array.from(m[2].matchAll(/<apex:\w+/g)).map((x) => x[0].replace("<apex:", "")),
    })
  );

  const actionSupports = Array.from(code.matchAll(/<apex:actionSupport([^>]*)\/>/g)).map((m) => {
    const attrs = m[1];
    return {
      event: attrs.match(/event=["']([^"']+)["']/)?.[1] || "",
      reRender: attrs.match(/reRender=["']([^"']+)["']/)?.[1],
      action: attrs.match(/action=["']([^"']+)["']/)?.[1],
      status: attrs.match(/status=["']([^"']+)["']/)?.[1],
    };
  });

  const outputPanels = Array.from(code.matchAll(/<apex:outputPanel([^>]*)>([\s\S]*?)<\/apex:outputPanel>/g)).map((m) => ({
    id: m[1].match(/id=["']([^"']+)["']/)?.[1],
    layout: m[1].match(/layout=["']([^"']+)["']/)?.[1],
    contentPreview: m[2].trim().slice(0, 80),
  }));

  const dependencies = {
    objects: Array.from(code.matchAll(/\{![a-zA-Z_0-9]+\.[A-Z][a-zA-Z_0-9]+/g)).map((m) => m[0].split(".")[0].replace("{!", "")),
    detailedfields: Array.from(code.matchAll(/\{![a-zA-Z_0-9]+\.[a-zA-Z_0-9]+\}/g)).map((m) => m[0].replace("{!", "").replace("}", "")),
    components: Array.from(code.matchAll(/<c:([\w-]+)/g)).map((m) => m[1]),
  };

  const scripts = Array.from(code.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)).map((m) => ({
    type: "inline",
    value: m[1].slice(0, 100).trim(),
  }));

  return {
    pageName,
    code,
    pageMeta,
    standardController,
    customController,
    extensions,
    pageStructure: { forms, inputs, buttons },
    pageBlocks,
    actionSupports,
    outputPanels,
    dependencies,
    scripts,
  };
}
