import type { ChargeRollupStatus, EncounterId } from "@vitalflow/types";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@vitalflow/ui";

import type { AppSession } from "../../../../../lib/session.js";
import { AddChargeLineForm } from "./AddChargeLineForm.js";
import { ChargeLineTable } from "./ChargeLineTable.js";
import { postAllCharges } from "./actions.js";
import { getChargeCaptureContext } from "./getChargeCaptureContext.js";
import { formatMoney, RollupBanner } from "./shared.js";

/**
 * Charge capture card. Slots between the AI review card and the Documents
 * card on the encounter workspace. Renders null for users without any
 * billing / charge permissions.
 */
export async function ChargeCaptureCard({
  encounterId,
  patientId,
  encounterDate,
  session,
}: {
  encounterId: string;
  patientId: string;
  encounterDate: string;
  session: AppSession;
}) {
  const ctx = await getChargeCaptureContext(encounterId as EncounterId, session);
  if (!ctx.permissions.canView) return null;

  // Aggregate view (no service round-trip — local computation over fetched lines).
  const nonVoided = ctx.lines.filter((l) => l.status !== "voided");
  const totalMinor = nonVoided.reduce((sum, l) => sum + l.totalMinor, 0);
  const currency = ctx.lines[0]?.currency ?? "USD";
  const rollupStatus = computeRollup(ctx.lines);

  const draftCount = ctx.lines.filter((l) => l.status === "draft").length;

  return (
    <Card id="charge-capture" data-testid="charge-capture">
      <CardHeader>
        <CardTitle className="text-base">Charge capture</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <RollupBanner status={rollupStatus} totalMinor={totalMinor} currency={currency} />

        {ctx.encounterReadOnly ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
            Encounter is cancelled or no-show — new charges cannot be posted.
          </div>
        ) : null}

        <ChargeLineTable
          encounterId={encounterId}
          lines={ctx.lines}
          encounterDiagnoses={ctx.encounterDiagnoses}
          canCapture={ctx.permissions.canCapture}
          canVoid={ctx.permissions.canVoid}
          readOnly={ctx.encounterReadOnly}
        />

        {ctx.permissions.canCapture && !ctx.encounterReadOnly ? (
          <div className="flex flex-col gap-3 border-t border-slate-200 pt-3 md:flex-row md:items-start md:justify-between">
            <div className="flex-1">
              <AddChargeLineForm
                encounterId={encounterId}
                patientId={patientId}
                encounterDate={encounterDate}
                encounterDiagnoses={ctx.encounterDiagnoses}
              />
            </div>
            {draftCount > 0 ? (
              <form action={postAllCharges}>
                <input type="hidden" name="encounter_id" value={encounterId} />
                <Button type="submit" variant="default" size="sm">
                  Post all drafts ({draftCount})
                </Button>
              </form>
            ) : null}
          </div>
        ) : null}

        {rollupStatus === "ready_for_claim" ? (
          <div className="rounded border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-900">
            All charges posted — total{" "}
            <span className="font-mono">{formatMoney(totalMinor, currency)}</span>. Claim creation
            ships in the next billing slice.
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function computeRollup(lines: readonly { status: string }[]): ChargeRollupStatus {
  if (lines.length === 0) return "empty";
  const nonVoided = lines.filter((l) => l.status !== "voided");
  if (nonVoided.length === 0) return "voided";
  if (nonVoided.some((l) => l.status === "draft")) return "draft";
  if (nonVoided.some((l) => l.status === "billed")) return "on_claim";
  if (nonVoided.every((l) => l.status === "posted")) return "ready_for_claim";
  return "draft";
}
