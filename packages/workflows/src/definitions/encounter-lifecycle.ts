import { createWorkflow } from "../state-machine.js";

type EncounterEvent =
  | { type: "ARRIVE" }
  | { type: "START" }
  | { type: "FINISH" }
  | { type: "CANCEL" };

export const encounterLifecycle = createWorkflow<EncounterEvent>({
  id: "encounter-lifecycle",
  initial: "planned",
  states: {
    planned: { on: { ARRIVE: "arrived", CANCEL: "cancelled" } },
    arrived: { on: { START: "inProgress", CANCEL: "cancelled" } },
    inProgress: { on: { FINISH: "finished", CANCEL: "cancelled" } },
    finished: { type: "final" },
    cancelled: { type: "final" },
  },
});
