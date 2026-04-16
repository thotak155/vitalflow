import { setup } from "xstate";

/**
 * Thin wrapper over xstate v5 `setup` that tags every machine with VitalFlow
 * concerns (tenantId, actor role, audit emitter). New workflows should be
 * defined in `./definitions/` and re-exported from the package root.
 */
export interface VitalFlowContext {
  tenantId: string;
  actorId: string;
  correlationId: string;
}

export function createWorkflow<TEvents extends { type: string }>(definition: {
  id: string;
  initial: string;
  states: Record<string, unknown>;
  /** Initial context for the machine. Leave default to require it per-run. */
  context?: VitalFlowContext;
}) {
  const initialContext: VitalFlowContext = definition.context ?? {
    tenantId: "",
    actorId: "",
    correlationId: "",
  };
  return setup({
    types: {} as { context: VitalFlowContext; events: TEvents },
  }).createMachine({
    id: definition.id,
    initial: definition.initial,
    context: initialContext,
    states: definition.states as never,
  });
}
