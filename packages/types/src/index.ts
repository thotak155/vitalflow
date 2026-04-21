export * from "./tenancy/index.js";
export * from "./clinical/index.js";
export * from "./erp/index.js";
export * from "./workflow/index.js";
export * from "./ai/index.js";
export type { Database, Json } from "./db/index.js";
export type {
  PublicSchema,
  TableName,
  ViewName,
  Row,
  Insert,
  Update,
  ViewRow,
  WithRelation,
  SupabaseSingleResult,
  SupabaseListResult,
  PublicEnum,
} from "./db/index.js";
