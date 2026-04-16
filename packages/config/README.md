# @vitalflow/config

Centralized build / lint / style configuration for the VitalFlow monorepo.

## Exports

| Path                                 | Purpose                                 |
| ------------------------------------ | --------------------------------------- |
| `./tsconfig/base.json`               | Strict TS defaults for every workspace  |
| `./tsconfig/nextjs.json`             | Next.js App Router apps                 |
| `./tsconfig/react-library.json`      | Shared React UI packages                |
| `./tsconfig/node.json`               | Node-only libraries / services          |
| `./eslint/base.js`                   | TS + import ordering baseline           |
| `./eslint/react.js`                  | React + a11y + hooks rules              |
| `./eslint/nextjs.js`                 | Next.js core-web-vitals                 |
| `./eslint/node.js`                   | Node-only services                      |
| `./tailwind/preset`                  | Shared design-token Tailwind preset     |

## Usage

```jsonc
// packages/ui/tsconfig.json
{ "extends": "@vitalflow/config/tsconfig/react-library.json" }
```

```js
// apps/provider-app/eslint.config.mjs
import next from "@vitalflow/config/eslint/nextjs.js";
export default next;
```
