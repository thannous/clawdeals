import React from "react";
import { ChevronRight } from "lucide-react";

export interface Column<Row = any> {
  key: string;
  label: string;
  /** Keeps the header readable by screen readers without showing it (e.g. a selection column). */
  srOnlyLabel?: boolean;
  className?: string;
  cell?: (row: Row) => React.ReactNode;
}

interface Props<Row = any> {
  columns: Column<Row>[];
  rows: Row[];
  getRowKey: (row: Row) => string;
  onRowClick?: (row: Row) => void;
  /** Accessible name of the per-row open button; defaults to "Open". */
  rowActionLabel?: (row: Row) => string;
}

/**
 * Rows stay clickable with the mouse, but keyboard and screen-reader users open a row
 * through its own button: a row with role="button" cannot contain the copy buttons and
 * checkboxes that console cells render.
 */
export default function ConsoleTable<Row = any>({ columns, rows, getRowKey, onRowClick, rowActionLabel }: Props<Row>) {
  return (
    // `relative` keeps the visually hidden header labels inside the scroll area on small screens.
    <div className="relative bg-surface border border-border overflow-hidden overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="bg-bg/60 border-b border-border">
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={`text-xs font-mono font-bold text-subtle uppercase tracking-wider px-3 py-2 text-left ${col.className || ""}`}
              >
                {col.srOnlyLabel ? <span className="sr-only">{col.label}</span> : col.label}
              </th>
            ))}
            {onRowClick ? (
              <th scope="col" className="w-10 px-2 py-2">
                <span className="sr-only">Open</span>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={getRowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={`border-b border-border/50 hover:bg-surface-alt/50 transition-colors ${onRowClick ? "cursor-pointer" : ""}`}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`text-xs font-mono text-text px-3 py-2.5 whitespace-nowrap ${col.className || ""}`}
                >
                  {col.cell ? col.cell(row) : (row as any)[col.key]}
                </td>
              ))}
              {onRowClick ? (
                <td className="px-2 py-1 text-right">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onRowClick(row);
                    }}
                    aria-label={rowActionLabel ? rowActionLabel(row) : "Open"}
                    className="inline-flex h-8 w-8 items-center justify-center text-muted hover:text-text"
                  >
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
