import { Button, FormField, Input } from "@vitalflow/ui";

import { addChargeLine } from "./actions.js";
import { DiagnosisPicker } from "./DiagnosisPicker.js";
import type { EncounterDiagnosis } from "./getChargeCaptureContext.js";

/**
 * Inline "Add charge line" form. Wrapped in a <details> so it's collapsed by
 * default — keeps the card quiet once the clinician has captured what they
 * need.
 */
export function AddChargeLineForm({
  encounterId,
  patientId,
  encounterDate,
  encounterDiagnoses,
}: {
  encounterId: string;
  patientId: string;
  encounterDate: string;
  encounterDiagnoses: readonly EncounterDiagnosis[];
}) {
  return (
    <details className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <summary className="cursor-pointer text-sm font-semibold text-slate-800">
        + Add charge line
      </summary>
      <form action={addChargeLine} className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
        <input type="hidden" name="encounter_id" value={encounterId} />
        <input type="hidden" name="patient_id" value={patientId} />

        <FormField label="CPT code" htmlFor="cc-cpt" helper="5 digits, e.g. 99213">
          <Input
            id="cc-cpt"
            name="cpt_code"
            pattern="^\d{5}$"
            placeholder="99213"
            inputMode="numeric"
          />
        </FormField>

        <FormField
          label="HCPCS code (alt.)"
          htmlFor="cc-hcpcs"
          helper="e.g. A0425 — use only if no CPT"
        >
          <Input id="cc-hcpcs" name="hcpcs_code" pattern="^[A-V]\d{4}$" placeholder="" />
        </FormField>

        <FormField
          label="Modifiers"
          htmlFor="cc-modifiers"
          helper="Comma-separated, max 4 (e.g. 25, 59)"
        >
          <Input id="cc-modifiers" name="modifiers" placeholder="25, LT" />
        </FormField>

        <FormField label="Units" htmlFor="cc-units">
          <Input id="cc-units" name="units" type="number" min={1} defaultValue={1} required />
        </FormField>

        <FormField label="Unit price (USD)" htmlFor="cc-price">
          <Input
            id="cc-price"
            name="unit_price"
            type="number"
            step="0.01"
            min={0}
            placeholder="125.00"
            required
          />
        </FormField>

        <FormField label="Service date" htmlFor="cc-date">
          <Input
            id="cc-date"
            name="service_date"
            type="date"
            defaultValue={encounterDate}
            required
          />
        </FormField>

        <div className="md:col-span-2">
          <DiagnosisPicker
            name="icd10_codes"
            inputId="cc-icd10"
            encounterDiagnoses={encounterDiagnoses}
          />
        </div>

        <FormField label="Notes (optional)" htmlFor="cc-notes" className="md:col-span-2">
          <Input id="cc-notes" name="notes" maxLength={2000} />
        </FormField>

        <div className="md:col-span-2">
          <Button type="submit" variant="default" size="sm">
            Add line
          </Button>
        </div>
      </form>
    </details>
  );
}
