import React from "react";

export interface Column {
  key: string;
  label: string;
  className?: string;
}

interface Props {
  columns: Column[];
  rows: any[];
  getRowKey: (row: any) => string;
  onRowClick?: (row: any) => void;
  renderCell?: (row: any, col: Column) => React.ReactNode;
}

export default function ConsoleTable({ columns, rows, getRowKey, onRowClick, renderCell }: Props) {
  const handleRowKeyDown = (event: React.KeyboardEvent<HTMLTableRowElement>, row: any) => {
    if (!onRowClick) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onRowClick(row);
    }
  };

  return (
    <div className="bg-surface border border-border overflow-hidden overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="bg-bg/60 border-b border-border">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`text-xs font-mono font-bold text-subtle uppercase tracking-wider px-3 py-2 text-left ${col.className || ""}`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={getRowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={onRowClick ? (event) => handleRowKeyDown(event, row) : undefined}
              role={onRowClick ? "button" : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              className={`border-b border-border/50 hover:bg-surface-alt/50 transition-colors ${onRowClick ? "cursor-pointer" : ""}`}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`text-xs font-mono text-text px-3 py-2.5 whitespace-nowrap ${col.className || ""}`}
                >
                  {renderCell ? renderCell(row, col) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
