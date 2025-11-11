---
title: PROMPT_DESCRIBE_VF
description: Prompt template for PROMPT_DESCRIBE_VF
---

# PROMPT_DESCRIBE_VF

## Variables
| Name | Description | Example |
| :------|:-------------|:---------|
| **VF_NAME** | The name of the Visualforce page to describe. | `MyCustomVFPage` |
| **VF_CODE** | The markup code of the Visualforce page. | `<apex:page>...</apex:page>` |
| **VF_CONTROLLER** | The Apex controller class associated with the Visualforce page, if any. | `MyCustomVFPageController` |
| **PROPERTIES** | List of properties extracted from the Apex controller or Visualforce page. | `[{name:'prop1', type:'String', description:'Property description'}]` |
| **METHODS** | List of methods extracted from the Apex controller or Visualforce page. | `[{name:'doSomething', type:'void', parameters:'String param', description:'Method description'}]` |
| **PAGE_BLOCKS** | Blocks or sections in the VF page with titles and items. | `[{title:'Block 1', items:['field1','field2']}]` |
| **FORMS** | Number of <apex:form> tags in the page. | `1` |
| **INPUTS** | List of input fields in the VF page. | `['input1','input2']` |
| **BUTTONS** | List of action buttons in the VF page. | `['save','cancel']` |
| **OUTPUT_PANELS** | List of output panels in the VF page with layout and content preview. | `[{id:'panel1', layout:'full', contentPreview:'some text'}]` |
| **SCRIPTS** | Scripts used in the VF page. | `[{type:'JS', value:'alert()'}]` |
| **DEPENDENCIES** | Objects, fields, or components the page depends on. | `{objects:['Account'], detailedfields:['Account.Name'], components:['customCmp']}` |
| **OVERVIEW** | A brief description of what the VF page does (AI or human). | `Displays account information for admins.` |
| **PURPOSE** | The main purpose of the VF page (AI or human). | `To allow admins to manage accounts.` |
| **KEY_FUNCTIONS** | Key functions or features of the VF page (AI or human). | `['Save account', 'Validate inputs']` |
| **INTERACTIONS** | Interactions or dependencies with other components or objects (AI or human). | `['Calls AccountController.getAccounts', 'Updates Contact object']` |

## Prompt

```
You are a skilled Salesforce developer. Your task is to describe the Visualforce page "{{VF_NAME}}" in clear English, focusing on technical details that other developers or admins need to know.

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
```
{{VF_CODE}}
```

- Apex Controller:
```
{{VF_CONTROLLER}}
```

```

## How to override

To define your own prompt text, you can define a local file **config/prompt-templates/PROMPT_DESCRIBE_VF.txt**

You can also use the command `sf hardis:doc:override-prompts` to automatically create all override template files at once.

If you do so, please don't forget to use the replacement variables :)
