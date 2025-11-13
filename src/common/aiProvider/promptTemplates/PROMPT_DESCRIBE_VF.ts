import { PromptTemplateDefinition } from "./types.js";

const template: PromptTemplateDefinition = {
  variables: [
    {
      name: "PAGE_NAME",
      description: "The name of the Salesforce Visualforce Page to describe.",
      example: "Account_Custom_View"
    },
    {
      name: "VF_CONTENT",
      description: "The full XML and Visualforce markup of the page.",
      example: "<apex:page standardController='Account'>...</apex:page>"
    }
  ],
  text: {
    "en": `You are a Salesforce developer and documentation specialist. Your goal is to summarize the content and behavior of the Salesforce Visualforce page "{{PAGE_NAME}}" in plain English, providing a detailed explanation suitable for both technical and business users. {{VARIABLE_OUTPUT_FORMAT_MARKDOWN_DOC}}

### Instructions:

1. **Overview**
   - Summarize the page’s role in the system and its general purpose.

2. **Purpose**
   - Describe what business or technical need this Visualforce page fulfills.

3. **Key Functions**
   - List the main features or components (e.g., apex:form, apex:pageBlock, apex:repeat, JavaScript interactions).

4. **Interactions**
   - Explain how this page interacts with its controller, extensions, or other Salesforce objects.

5. **Properties and Methods**
   - List and describe any key properties, variables, and controller methods used within this page.

6. {{VARIABLE_FORMATTING_REQUIREMENTS}}

### Reference Data:

- The Visualforce markup for page "{{PAGE_NAME}}" is:
{{VF_CONTENT}}

{{VARIABLE_ADDITIONAL_INSTRUCTIONS}}
`,
  },
};

export default template;
