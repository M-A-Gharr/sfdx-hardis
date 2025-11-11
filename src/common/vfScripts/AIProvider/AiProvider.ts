export interface AiProviderResult {
  overview: string;
  purpose: string;
  keyFunctions?: string[];
  interactions?: string[];
}

export interface MemberDescriptionResult {
  properties: Record<string, string>;
  methods: Record<string, string>;
}

/**
 * Optional enrichment result for key functions and user interactions
 * detected or inferred from Visualforce controller logic or markup.
 */
export interface KeyFunctionsInteractionsResult {
  keyFunctions: string[];
  interactions: string[];
}

export interface AiProvider {
  name: string;

  // Generate overview/purpose for a Visualforce page
  generateOverviewPurpose(pageName: string, content: string): Promise<AiProviderResult>;

  // Generate descriptions for properties & methods
  // Accepts arrays of property/method names
  generateMemberDescriptions?(
    pageName: string,
    properties: string[],
    methods: string[]
  ): Promise<MemberDescriptionResult>;

  /**
   * Generate AI-based key functions & user interactions for a VF page.
   * Optional — for providers that support richer context awareness.
   */
  generateKeyFunctionsAndInteractions?(
    pageName: string,
    controllerContent?: string
  ): Promise<KeyFunctionsInteractionsResult>;
}
