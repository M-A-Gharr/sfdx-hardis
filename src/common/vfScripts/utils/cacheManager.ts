import fs from "fs-extra";
import path from "path";
import crypto from "crypto";

const CACHE_FILE = path.resolve(__dirname, "../cache/ai_cache.json");

interface CacheData {
  [key: string]: any;
}

/**
 * Utility function to hash a string (used for keys).
 */
export function generateHash(str: string): string {
  return crypto.createHash("sha256").update(str).digest("hex");
}

/**
 * Simple cache manager that reads/writes a JSON file on disk.
 * Used to store AI-generated data (overview, purpose, method descriptions, etc.)
 */
export class CacheManager {
  private cacheFile: string;
  private cache: CacheData = {};

  constructor(customPath?: string) {
    this.cacheFile = customPath || CACHE_FILE;

    if (fs.existsSync(this.cacheFile)) {
      this.cache = fs.readJsonSync(this.cacheFile);
    } else {
      fs.ensureFileSync(this.cacheFile);
      fs.writeJsonSync(this.cacheFile, {}, { spaces: 2 });
      this.cache = {};
    }
  }

  /** Retrieve a cached entry by key */
  public get(key: string): any | null {
    return this.cache[key] ?? null;
  }

  /** Store a cached entry */
  public set(key: string, value: any): void {
    this.cache[key] = value;
  }

  /** Save current cache state to disk */
  public save(): void {
    fs.writeJsonSync(this.cacheFile, this.cache, { spaces: 2 });
  }

  // --- Compatibility with your earlier functions ---

  public async getControllerProperties(controllerName: string) {
    return this.cache[controllerName]?.properties ?? null;
  }

  public async getControllerMethods(controllerName: string) {
    return this.cache[controllerName]?.methods ?? null;
  }

  public async setControllerProperties(controllerName: string, properties: any[]) {
    this.cache[controllerName] = this.cache[controllerName] || {};
    this.cache[controllerName].properties = properties;
    this.save();
  }

  public async setControllerMethods(controllerName: string, methods: any[]) {
    this.cache[controllerName] = this.cache[controllerName] || {};
    this.cache[controllerName].methods = methods;
    this.save();
  }
}