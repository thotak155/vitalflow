export * from "./services.js";

// SOAP service — re-export the class + deps + error. Helpers with ambiguous
// names (resolveModel, sanitizeSegmentIds, ...) stay importable via the
// deep path `@vitalflow/ai/scribe/soap-draft-service`.
export {
  SoapDraftServiceImpl,
  SoapGenerationError,
  type SoapDraftServiceDeps,
} from "./soap-draft-service.js";

export {
  CodeSuggestionServiceImpl,
  CodeSuggestionGenerationError,
  type CodeSuggestionServiceDeps,
} from "./code-suggestion-service.js";
