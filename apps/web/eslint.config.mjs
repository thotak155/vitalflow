import nextConfig from "@vitalflow/config/eslint/nextjs.js";

export default [
  ...nextConfig,
  { ignores: [".next/**", "node_modules/**", "dist/**"] },
];
