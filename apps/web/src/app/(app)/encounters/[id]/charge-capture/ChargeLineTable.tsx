import type { ChargeLine } from "@vitalflow/types";
import {
  Button,
  FormField,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from "@vitalflow/ui";

import { deleteChargeLine, updateChargeLine, voidChargeLine } from "./actions.js";
import type { EncounterDiagnosis } from "./getChargeCaptureContext.js";
import { ChargeStatusBadge, formatMoney } from "./shared.js";

/**
 * Table of all ChargeLines for the encounter. Draft rows are inline-editable
 * via per-row <form> elements; posted / billed / voided rows are read-only
 * and show Void / info affordances where appropriate.
 */
export function ChargeLineTable({
  encounterId,
  lines,
  encounterDiagnoses,
  canCapture,
  canVoid,
  readOnly,
}: {
  encounterId: string;
  lines: readonly ChargeLine[];
  encounterDiagnoses: readonly EncounterDiagnosis[];
  canCapture: boolean;
  canVoid: boolean;
  readOnly: boolean;
}) {
  if (lines.length === 0) {
    return (
      <p className="py-4 text-sm italic text-slate-500">No charges captured for this visit yet.</p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Code</TableHead>
          <TableHead>Modifiers</TableHead>
          <TableHead>Units</TableHead>
          <TableHead className="text-right">Unit price</TableHead>
          <TableHead className="text-right">Total</TableHead>
          <TableHead>ICD-10</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="w-36 text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {lines.map((l) =>
          l.status === "draft" && canCapture && !readOnly ? (
            <DraftRow
              key={l.id}
              encounterId={encounterId}
              line={l}
              encounterDiagnoses={encounterDiagnoses}
            />
          ) : (
            <ReadOnlyRow
              key={l.id}
              encounterId={encounterId}
              line={l}
              canVoid={canVoid && !readOnly}
            />
          ),
        )}
      </TableBody>
    </Table>
  );
}

// ---------------------------------------------------------------------------
// Draft row — inline edit form
// ---------------------------------------------------------------------------

function DraftRow({
  encounterId,
  line,
  encounterDiagnoses,
}: {
  encounterId: string;
  line: ChargeLine;
  encounterDiagnoses: readonly EncounterDiagnosis[];
}) {
  const formId = `edit-${line.id}`;
  const deleteId = `del-${line.id}`;
  const code = line.cptCode ?? line.hcpcsCode ?? "";
  return (
    <TableRow>
      {/* Edit form wraps the whole row via form attribute on inputs */}
      <TableCell className="font-mono">
        <form action={updateChargeLine} id={formId}>
          <input type="hidden" name="encounter_id" value={encounterId} />
          <input type="hidden" name="charge_id" value={line.id} />
          <Input
            name="cpt_code"
            defaultValue={line.cptCode ?? ""}
            placeholder="CPT"
            className="w-20"
            form={formId}
          />
          <Input
            name="hcpcs_code"
            defaultValue={line.hcpcsCode ?? ""}
            placeholder="HCPCS"
            className="mt-1 w-20"
            form={formId}
          />
        </form>
      </TableCell>
      <TableCell>
        <Input
          name="modifiers"
          defaultValue={line.modifiers.join(", ")}
          placeholder="25, LT"
          className="w-24"
          form={formId}
        />
      </TableCell>
      <TableCell>
        <Input
          type="number"
          name="units"
          defaultValue={line.units}
          min={1}
          className="w-16"
          form={formId}
        />
      </TableCell>
      <TableCell className="text-right">
        <Input
          type="number"
          step="0.01"
          name="unit_price"
          defaultValue={(line.unitPriceMinor / 100).toFixed(2)}
          className="w-24 text-right font-mono"
          form={formId}
        />
        <Input type="hidden" name="service_date" defaultValue={line.serviceDate} form={formId} />
      </TableCell>
      <TableCell className="text-right font-mono tabular-nums">
        {formatMoney(line.totalMinor, line.currency)}
      </TableCell>
      <TableCell>
        <Input
          name="icd10_codes"
          defaultValue={line.icd10Codes.join(", ")}
          placeholder={encounterDiagnoses.map((d) => d.code).join(", ") || "J02.9"}
          className="w-32 font-mono text-[11px]"
          form={formId}
        />
      </TableCell>
      <TableCell>
        <ChargeStatusBadge status={line.status} />
      </TableCell>
      <TableCell>
        <div className="flex justify-end gap-1">
          <Button type="submit" variant="outline" size="sm" form={formId}>
            Save
          </Button>
          <form action={deleteChargeLine} id={deleteId}>
            <input type="hidden" name="encounter_id" value={encounterId} />
            <input type="hidden" name="charge_id" value={line.id} />
            <Button type="submit" variant="ghost" size="sm" form={deleteId}>
              Delete
            </Button>
          </form>
        </div>
        <div className="sr-only">code {code}</div>
      </TableCell>
    </TableRow>
  );
}

// ---------------------------------------------------------------------------
// Read-only row — posted / billed / voided
// ---------------------------------------------------------------------------

function ReadOnlyRow({
  encounterId,
  line,
  canVoid,
}: {
  encounterId: string;
  line: ChargeLine;
  canVoid: boolean;
}) {
  return (
    <TableRow data-status={line.status}>
      <TableCell className="font-mono">
        {line.cptCode ?? line.hcpcsCode ?? <span className="italic text-slate-500">—</span>}
      </TableCell>
      <TableCell className="font-mono text-xs">
        {line.modifiers.length > 0 ? (
          line.modifiers.join(", ")
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </TableCell>
      <TableCell>{line.units}</TableCell>
      <TableCell className="text-right font-mono tabular-nums">
        {formatMoney(line.unitPriceMinor, line.currency)}
      </TableCell>
      <TableCell className="text-right font-mono tabular-nums">
        {formatMoney(line.totalMinor, line.currency)}
      </TableCell>
      <TableCell className="font-mono text-[11px]">
        {line.icd10Codes.length > 0 ? (
          line.icd10Codes.join(", ")
        ) : (
          <span className="italic text-slate-400">none</span>
        )}
      </TableCell>
      <TableCell>
        <ChargeStatusBadge status={line.status} />
      </TableCell>
      <TableCell>
        {canVoid && line.status === "posted" ? (
          <details>
            <summary className="cursor-pointer text-right text-xs text-slate-600 underline">
              Void…
            </summary>
            <form action={voidChargeLine} className="mt-2 space-y-1">
              <input type="hidden" name="encounter_id" value={encounterId} />
              <input type="hidden" name="charge_id" value={line.id} />
              <FormField
                label="Void reason"
                htmlFor={`void-${line.id}`}
                helper="At least 5 characters"
              >
                <Textarea
                  id={`void-${line.id}`}
                  name="reason"
                  rows={2}
                  required
                  minLength={5}
                  maxLength={500}
                />
              </FormField>
              <Button type="submit" variant="destructive" size="sm">
                Void charge
              </Button>
            </form>
          </details>
        ) : null}
      </TableCell>
    </TableRow>
  );
}
