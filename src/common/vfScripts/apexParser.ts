import * as fs from "fs-extra";
import * as path from "path";

export interface ApexMetadata {
  name: string;
  properties: { name: string; type: string; visibility: string }[];
  methods: { name: string; type: string; parameters: string; visibility: string }[];
}

export async function parseApexFile(filePath: string): Promise<ApexMetadata> {
  const code = await fs.readFile(filePath, "utf8");
  const name = path.basename(filePath, ".cls");

  const properties = Array.from(code.matchAll(/(public|private|protected)\s+([\w<>]+)\s+(\w+)\s*\{/g)).map((m) => ({
    visibility: m[1],
    type: m[2],
    name: m[3],
  }));

  const methods = Array.from(code.matchAll(/(public|private|protected)\s+([\w<>]+)\s+(\w+)\s*\(([^)]*)\)/g)).map((m) => ({
    visibility: m[1],
    type: m[2],
    name: m[3],
    parameters: m[4],
  }));

  return { name, properties, methods };
}
