import { PromptTemplateDefinition } from "./types.js";

const template: PromptTemplateDefinition = {
  variables: [
    {
      name: "VF_NAME",
      description: "The name of the Visualforce page to describe.",
      example: "MyCustomVFPage"
    },
    {
      name: "VF_CODE",
      description: "The markup code of the Visualforce page.",
      example: "<apex:page>...</apex:page>"
    },
    {
      name: "VF_CONTROLLER",
      description: "The Apex controller class associated with the Visualforce page, if any.",
      example: "MyCustomVFPageController"
    },
    {
      name: "PROPERTIES",
      description: "List of properties extracted from the Apex controller or Visualforce page.",
      example: "[{name:'prop1', type:'String', description:'Property description'}]"
    },
    {
      name: "METHODS",
      description: "List of methods extracted from the Apex controller or Visualforce page.",
      example: "[{name:'doSomething', type:'void', parameters:'String param', description:'Method description'}]"
    },
    {
      name: "PAGE_BLOCKS",
      description: "Blocks or sections in the VF page with titles and items.",
      example: "[{title:'Block 1', items:['field1','field2']}]"
    },
    {
      name: "FORMS",
      description: "Number of <apex:form> tags in the page.",
      example: "1"
    },
    {
      name: "INPUTS",
      description: "List of input fields in the VF page.",
      example: "['input1','input2']"
    },
    {
      name: "BUTTONS",
      description: "List of action buttons in the VF page.",
      example: "['save','cancel']"
    },
    {
      name: "OUTPUT_PANELS",
      description: "List of output panels in the VF page with layout and content preview.",
      example: "[{id:'panel1', layout:'full', contentPreview:'some text'}]"
    },
    {
      name: "SCRIPTS",
      description: "Scripts used in the VF page.",
      example: "[{type:'JS', value:'alert()'}]"
    },
    {
      name: "DEPENDENCIES",
      description: "Objects, fields, or components the page depends on.",
      example: "{objects:['Account'], detailedfields:['Account.Name'], components:['customCmp']}"
    },
    {
      name: "OVERVIEW",
      description: "A brief description of what the VF page does (AI or human).",
      example: "Displays account information for admins."
    },
    {
      name: "PURPOSE",
      description: "The main purpose of the VF page (AI or human).",
      example: "To allow admins to manage accounts."
    },
    {
      name: "KEY_FUNCTIONS",
      description: "Key functions or features of the VF page (AI or human).",
      example: "['Save account', 'Validate inputs']"
    },
    {
      name: "INTERACTIONS",
      description: "Interactions or dependencies with other components or objects (AI or human).",
      example: "['Calls AccountController.getAccounts', 'Updates Contact object']"
    }
  ],
  text: {
    "en": `You are a skilled Salesforce developer. Your task is to describe the Visualforce page "{{VF_NAME}}" in clear English, focusing on technical details that other developers or admins need to know.

### Overview
- {{OVERVIEW}}
- Purpose: {{PURPOSE}}

### Properties
{{#each PROPERTIES}}
- {{name}} ({{type}}): {{description}}
{{/each}}

### Methods
{{#each METHODS}}
- {{name}}({{parameters}}): {{description}}
{{/each}}

### Page Structure
- Forms: {{FORMS}}
- Inputs: {{INPUTS}}
- Buttons: {{BUTTONS}}
- Page Blocks:
{{#each PAGE_BLOCKS}}
  - {{title}}: {{items}}
{{/each}}
- Output Panels:
{{#each OUTPUT_PANELS}}
  - {{id}} (layout: {{layout}}): {{contentPreview}}
{{/each}}
- Scripts:
{{#each SCRIPTS}}
  - {{type}}: {{value}}
{{/each}}

### Dependencies
- Objects: {{DEPENDENCIES.objects}}
- Fields: {{DEPENDENCIES.detailedfields}}
- Components: {{DEPENDENCIES.components}}

### Key Functions
{{#each KEY_FUNCTIONS}}
- {{this}}
{{/each}}

### Interactions
{{#each INTERACTIONS}}
- {{this}}
{{/each}}

### Reference Data
- Visualforce Markup:
\`\`\`
{{VF_CODE}}
\`\`\`

- Apex Controller:
\`\`\`
{{VF_CONTROLLER}}
\`\`\`
`
  },
};

export default template;
