import {
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@vitalflow/ui";

import type { RecentPaymentRow, Result } from "../../../../lib/billing-overview-context.js";

import { PanelEmpty, PanelError, PanelHeader } from "./kpi.js";
import { MoneyCell, RelativeTime } from "../shared.js";

export function RecentPaymentsPanel({
  data,
  from,
  to,
}: {
  data: Result<readonly RecentPaymentRow[]>;
  from: string;
  to: string;
}) {
  return (
    <Card>
      <PanelHeader
        title="Recent payments"
        subtitle={`${from} – ${to}`}
        action={<span className="italic text-slate-400">payments list ships in a follow-up</span>}
      />
      <CardContent className="p-0">
        {!data.ok ? (
          <div className="p-3">
            <PanelError reason={data.reason} />
          </div>
        ) : data.value.length === 0 ? (
          <PanelEmpty text="No payments received in this range." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Method</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Received</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.value.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="text-xs uppercase tracking-wide text-slate-700">
                    {p.method}
                  </TableCell>
                  <TableCell className="text-sm">
                    {p.patientName ?? p.payerName ?? (
                      <span className="italic text-slate-400">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <MoneyCell minor={p.amountMinor} currency={p.currency} />
                  </TableCell>
                  <TableCell className="text-xs text-slate-600">
                    <RelativeTime iso={p.receivedAt} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
