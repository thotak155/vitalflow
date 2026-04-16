import type { NavSection } from "@vitalflow/ui/layout";

import type { Surface } from "../lib/roles.js";

import { adminNav } from "./admin.js";
import { patientNav } from "./patient.js";
import { providerNav } from "./provider.js";

export function navFor(surface: Surface): readonly NavSection[] {
  switch (surface) {
    case "admin":
      return adminNav;
    case "patient":
      return patientNav;
    case "provider":
    default:
      return providerNav;
  }
}

export { adminNav, patientNav, providerNav };
