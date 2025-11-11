import { AiProvider } from "./AiProvider.js";
import {
  VfProperty,
  VfMethod,
  OverviewPurpose,
  MemberDescriptions,
  VfPageMetadata,
} from "../utils/types.js";
import { CacheManager, generateHash } from "../utils/cacheManager.js";
import { safeAiCall } from "./AiSafeWrapper.js";

export interface AiOverviewResult {
  overview: string;
  purpose: string;
  keyFunctions: string[];
  interactions: string[];
}

export class AiManager {
  private providers: AiProvider[];
  private cache: CacheManager;

  constructor(providers: AiProvider[], cacheManager: CacheManager) {
    this.providers = providers;
    this.cache = cacheManager;
  }

  public get hasMemberGenerator(): boolean {
    return this.providers.some(p => typeof p.generateMemberDescriptions === "function");
  }

  /**
   * Generate high-level overview & purpose for a given page or component.
   */
  public async generateOverviewPurpose(pageName: string, content: string): Promise<OverviewPurpose> {
    const cacheKey = generateHash(`overview_${pageName}`);

    return safeAiCall(
      this.cache,
      cacheKey,
      async () => {
        for (const provider of this.providers) {
          try {
            const result = await provider.generateOverviewPurpose(pageName, content);
            if (result && (result.overview || result.purpose)) {
              // Ensure keyFunctions & interactions exist
              return {
                overview: result.overview || "",
                purpose: result.purpose || "",
                keyFunctions: (result as any).keyFunctions || [],
                interactions: (result as any).interactions || [],
              };
            }
          } catch (err) {
            console.warn(`⚠️ [${provider.name}] failed to generate overview for ${pageName}:`, err);
          }
        }

        const local = this.providers.find(p => p.name === "Local");
        if (local) {
          const result = await local.generateOverviewPurpose(pageName, content);
          return {
            overview: result.overview || "",
            purpose: result.purpose || "",
            keyFunctions: (result as any).keyFunctions || [],
            interactions: (result as any).interactions || [],
          };
        }

        return { overview: "No overview available.", purpose: "No purpose available.", keyFunctions: [], interactions: [] };
      },
      { overview: "No overview available.", purpose: "No purpose available.", keyFunctions: [], interactions: [] }
    );
  }

  /**
   * Enrich VfProperty & VfMethod arrays with AI-generated descriptions.
   */
  public async enrichMembersWithDescriptions(
    pageName: string,
    properties: VfProperty[],
    methods: VfMethod[]
  ): Promise<MemberDescriptions> {
    const cacheKey = generateHash(`members_${pageName}`);

    return safeAiCall(
      this.cache,
      cacheKey,
      async () => {
        for (const provider of this.providers) {
          if (!provider.generateMemberDescriptions) continue;

          try {
            const result = await provider.generateMemberDescriptions(
              pageName,
              properties.map(p => p.name),
              methods.map(m => m.name)
            );

            if (result) {
              properties.forEach(p => {
                p.descriptionAI = result.properties[p.name] || `Property ${p.name} of type ${p.type}.`;
              });
              methods.forEach(m => {
                m.descriptionAI = result.methods[m.name] || `Method ${m.name} returns ${m.type} and takes (${m.parameters || ""}).`;
              });
              this.cache.set(cacheKey, result);
              this.cache.save();
              return result;
            }
          } catch (err) {
            console.warn(`⚠️ [${provider.name}] failed to generate member descriptions:`, err);
          }
        }

        // fallback
        const fallback: MemberDescriptions = {
          properties: Object.fromEntries(properties.map(p => [p.name, `Property ${p.name} of type ${p.type}.`])),
          methods: Object.fromEntries(methods.map(m => [m.name, `Method ${m.name} returns ${m.type} and takes (${m.parameters || ""}).`])),
        };
        return fallback;
      },
      { properties: {}, methods: {} }
    );
  }

  /**
   * Enrich full VF page metadata — overview, members, and optionally key functions/interactions.
   */
  public async enrichVfPageMetadata(pageMeta: VfPageMetadata): Promise<VfPageMetadata> {
    const cacheKey = generateHash(`vfmeta_${pageMeta.name}`);

    return safeAiCall(
      this.cache,
      cacheKey,
      async () => {
        // Step 1: Enrich overview & purpose
        const overviewPurpose = await this.generateOverviewPurpose(pageMeta.name, pageMeta.overview || "");

        // Step 2: Enrich members (props & methods)
        const memberDescriptions = await this.enrichMembersWithDescriptions(
          pageMeta.name,
          pageMeta.properties,
          pageMeta.methods
        );

        // Step 3: Ask AI for key functions & interactions (optional, if provider supports it)
        let keyFunctions: string[] = [];
        let interactions: string[] = [];

        for (const provider of this.providers) {
          if (typeof provider.generateKeyFunctionsAndInteractions === "function") {
            try {
              const result = await provider.generateKeyFunctionsAndInteractions(pageMeta.name, pageMeta.controller);
              keyFunctions = result.keyFunctions || [];
              interactions = result.interactions || [];
              break;
            } catch (err) {
              console.warn(`⚠️ [${provider.name}] failed to generate key functions/interactions:`, err);
            }
          }
        }

        const enriched: VfPageMetadata = {
          ...pageMeta,
          overview: overviewPurpose.overview,
          purpose: overviewPurpose.purpose,
          properties: pageMeta.properties.map(p => ({
            ...p,
            descriptionAI: memberDescriptions.properties[p.name],
          })),
          methods: pageMeta.methods.map(m => ({
            ...m,
            descriptionAI: memberDescriptions.methods[m.name],
          })),
          keyFunctions,
          interactions,
        };

        this.cache.set(cacheKey, enriched);
        this.cache.save();

        return enriched;
      },
      pageMeta
    );
  }
}
