import * as React from "react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../primitives/table.js";
import { cn } from "../utils/cn.js";

import { EmptyState } from "./empty-state.js";
import { ErrorState } from "./error-state.js";
import { LoadingState, Skeleton } from "./loading-state.js";

export interface DataTableColumn<Row> {
  /** Unique id used as the React key and the aria-labelled-by source. */
  id: string;
  /** Header text (or node). */
  header: React.ReactNode;
  /** Cell renderer. Receives the full row. */
  cell: (row: Row, index: number) => React.ReactNode;
  /** Optional Tailwind classnames for header + cell. */
  className?: string;
  /** Right-align common for numeric / currency columns. */
  align?: "left" | "right" | "center";
  /** Fixed width (Tailwind utility). */
  width?: string;
}

export interface DataTableProps<Row> {
  data: readonly Row[];
  columns: readonly DataTableColumn<Row>[];
  rowKey: (row: Row, index: number) => string;
  state?: "idle" | "loading" | "empty" | "error";
  emptyTitle?: React.ReactNode;
  emptyDescription?: React.ReactNode;
  errorTitle?: React.ReactNode;
  errorDescription?: React.ReactNode;
  errorAction?: React.ReactNode;
  onRowClick?: (row: Row) => void;
  caption?: React.ReactNode;
  className?: string;
}

/**
 * DataTable wires Table primitives to the standard list states (idle /
 * loading / empty / error) so every list surface in the app behaves the
 * same. Consumers define columns declaratively and never touch `<tr>` etc.
 */
export function DataTable<Row>({
  data,
  columns,
  rowKey,
  state = "idle",
  emptyTitle = "Nothing here yet",
  emptyDescription,
  errorTitle = "Something went wrong",
  errorDescription,
  errorAction,
  onRowClick,
  caption,
  className,
}: DataTableProps<Row>) {
  const alignClass = (align: DataTableColumn<Row>["align"]) =>
    align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";

  if (state === "loading") {
    return (
      <div className={cn("space-y-2", className)}>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <LoadingState className="py-6" />
      </div>
    );
  }

  if (state === "error") {
    return (
      <ErrorState
        className={className}
        title={errorTitle}
        description={errorDescription}
        action={errorAction}
      />
    );
  }

  if (state === "empty" || data.length === 0) {
    return (
      <EmptyState className={className} title={emptyTitle} description={emptyDescription} />
    );
  }

  return (
    <div className={cn("rounded-lg border border-border bg-background", className)}>
      <Table>
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <TableHeader>
          <TableRow>
            {columns.map((col) => (
              <TableHead
                key={col.id}
                className={cn(alignClass(col.align), col.width, col.className)}
              >
                {col.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row, i) => {
            const clickable = Boolean(onRowClick);
            return (
              <TableRow
                key={rowKey(row, i)}
                onClick={clickable ? () => onRowClick?.(row) : undefined}
                onKeyDown={
                  clickable
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onRowClick?.(row);
                        }
                      }
                    : undefined
                }
                tabIndex={clickable ? 0 : undefined}
                role={clickable ? "button" : undefined}
                className={clickable ? "cursor-pointer" : undefined}
              >
                {columns.map((col) => (
                  <TableCell
                    key={col.id}
                    className={cn(alignClass(col.align), col.width, col.className)}
                  >
                    {col.cell(row, i)}
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
