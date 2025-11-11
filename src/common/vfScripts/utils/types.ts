export interface VfProperty {
  name: string;
  type: string;
  descriptionAI?: string;
}

export interface VfMethod {
  name: string;
  type: string;
  parameters?: string;
  descriptionAI?: string;
}

export interface OverviewPurpose {
  overview: string;
  purpose: string;
  keyFunctions?: string[];
  interactions?: string[];
}

export interface MemberDescriptions {
  properties: Record<string, string>;
  methods: Record<string, string>;
}

export interface VfPageMetadata {
  name: string;
  controller: string;
  overview: string;
  purpose: string;
  apiVersion?: string;
  label?: string;
  description?: string;
  standardController?: string;
  customController?: string;
  extensions?: string[];
  properties: VfProperty[];
  methods: VfMethod[];
  pageStructure?: {
    forms: number;
    inputs: string[];
    buttons: string[];
  };
  pageBlocks?: {
    title: string;
    items: string[];
  }[];
  actionSupports?: {
    event: string;
    reRender?: string;
    action?: string;
    status?: string;
  }[];
  outputPanels?: {
    id: string;
    layout?: string;
    contentPreview?: string;
  }[];
  scripts?: {
    type: string;
    value: string;
  }[];
  dependencies?: {
    objects: string[];
    detailedfields: string[];
    components: string[];
  };
  keyFunctions?: string[];
  interactions?: string[];
}
