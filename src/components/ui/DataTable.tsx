"use client"

import { useState, useCallback, useMemo } from "react"
import { cn } from "@/lib/utils"
import { ArrowUp, ArrowDown, ChevronsUpDown } from "lucide-react"

export interface ColumnDef {
  key: string;
  label: string;
  group?: string;       // For color-coding column groups
  sortAccessor?: (item: any) => any;  // How to extract the sortable value
}

export interface SortEntry {
  key: string;
  direction: "asc" | "desc";
}

interface DataTableProps extends React.HTMLAttributes<HTMLDivElement> {
  columns: (string | ColumnDef)[];
  data: any[];
  keyExtractor: (item: any) => string;
  renderRow: (item: any) => React.ReactNode;
  groupColors?: Record<string, string>;          // group name -> header bg class
  groupBorderColors?: Record<string, string>;     // group name -> left-border class for cells
}

// Group header color classes matching the new Excel scheme
const DEFAULT_GROUP_COLORS: Record<string, string> = {
  agent:      "bg-slate-800 text-white",
  calls:      "bg-[#115E2E] text-white", // Solid Dark green
  texts:      "bg-[#5B2163] text-white", // Solid Dark purple
  production: "bg-amber-500 text-black", // Match MCM/gold
  leads:      "bg-[#99331A] text-white",  // Solid Dark red/orange
  eagent:     "bg-[#8B5A3C] text-white", // Warm brown
}

const DEFAULT_GROUP_BORDER_COLORS: Record<string, string> = {
  agent:      "",
  calls:      "border-l-2 border-l-emerald-600/50",
  texts:      "border-l-2 border-l-fuchsia-600/50",
  production: "border-l-2 border-l-amber-500/50",
  leads:      "border-l-2 border-l-rose-600/50",
  eagent:     "border-l-2 border-l-orange-500/50",
}

export function DataTable({ 
  className, columns, data, keyExtractor, renderRow, 
  groupColors = DEFAULT_GROUP_COLORS,
  groupBorderColors = DEFAULT_GROUP_BORDER_COLORS,
  ...props 
}: DataTableProps) {

  // Normalize: accept string[] or ColumnDef[] 
  const normalizedColumns: ColumnDef[] = useMemo(() => {
    return columns.map((col, i) => {
      if (typeof col === "string") {
        return { key: `col_${i}`, label: col };
      }
      return col;
    });
  }, [columns]);

  const [sorts, setSorts] = useState<SortEntry[]>([])

  const handleHeaderClick = useCallback((col: ColumnDef, event: React.MouseEvent) => {
    if (!col.sortAccessor) return; // Not sortable

    const isShift = event.shiftKey;

    setSorts(prev => {
      const existing = prev.findIndex(s => s.key === col.key);
      
      if (!isShift) {
        // Single-click: replace all sorts with this column
        if (existing >= 0) {
          const current = prev[existing];
          if (current.direction === "asc") return [{ key: col.key, direction: "desc" }];
          if (current.direction === "desc") return []; // Clear
        }
        return [{ key: col.key, direction: "asc" }];
      } else {
        // Shift+click: add to existing sorts or cycle
        if (existing >= 0) {
          const updated = [...prev];
          if (updated[existing].direction === "asc") {
            updated[existing] = { ...updated[existing], direction: "desc" };
          } else {
            updated.splice(existing, 1); // Remove from multi-sort
          }
          return updated;
        }
        return [...prev, { key: col.key, direction: "asc" }];
      }
    });
  }, []);

  // Apply sorting
  const sortedData = (() => {
    if (sorts.length === 0) return data;
    
    const colMap = new Map(normalizedColumns.map(c => [c.key, c]));
    
    return [...data].sort((a, b) => {
      for (const sort of sorts) {
        const col = colMap.get(sort.key);
        if (!col?.sortAccessor) continue;
        
        const valA = col.sortAccessor(a);
        const valB = col.sortAccessor(b);
        
        let cmp = 0;
        if (typeof valA === "string" && typeof valB === "string") {
          cmp = valA.localeCompare(valB);
        } else {
          cmp = (valA ?? 0) - (valB ?? 0);
        }
        
        if (cmp !== 0) return sort.direction === "asc" ? cmp : -cmp;
      }
      return 0;
    });
  })();

  // Build group spans for the super-header row
  const groupSpans: { group: string; span: number }[] = [];
  let lastGroup = "";
  for (const col of normalizedColumns) {
    const g = col.group || "";
    if (g === lastGroup && groupSpans.length > 0) {
      groupSpans[groupSpans.length - 1].span++;
    } else {
      groupSpans.push({ group: g, span: 1 });
      lastGroup = g;
    }
  }

  const GROUP_LABELS: Record<string, string> = {
    agent: "Agent Info",
    calls: "RC / Ricochet",
    texts: "Texts",
    production: "Production",
    leads: "Leads Pipeline",
    eagent: "eAgent/RICO",
  }

  // Determine the sort state for a column
  const getSortState = (key: string): { direction: "asc" | "desc" | null; priority: number | null } => {
    const idx = sorts.findIndex(s => s.key === key);
    if (idx < 0) return { direction: null, priority: null };
    return { direction: sorts[idx].direction, priority: sorts.length > 1 ? idx + 1 : null };
  }

  return (
    <div className={cn("w-full", className)} {...props}>
      {sorts.length > 0 && (
        <div className="flex items-center gap-2 mb-2 text-xs text-slate-500">
          <span>Sorted by:</span>
          {sorts.map((s, i) => {
            const col = normalizedColumns.find(c => c.key === s.key);
            return (
              <span key={s.key} className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                {i > 0 && <span className="text-slate-400 mr-1">then</span>}
                {col?.label}
                {s.direction === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                <button 
                  onClick={() => setSorts(prev => prev.filter(x => x.key !== s.key))}
                  className="ml-1 text-slate-400 hover:text-slate-900"
                >×</button>
              </span>
            );
          })}
          <button onClick={() => setSorts([])} className="text-slate-500 hover:text-slate-900 ml-2">Clear all</button>
          <span className="text-slate-400 ml-auto">Hold Shift + click to multi-sort</span>
        </div>
      )}

      {/* Top scrollbar (synced) */}
      <div 
        className="overflow-x-auto dsr-scrollbar"
        style={{ overflowY: "hidden" }}
        onScroll={(e) => {
          const next = e.currentTarget.nextElementSibling as HTMLElement;
          if (next) next.scrollLeft = e.currentTarget.scrollLeft;
        }}
      >
        <div ref={(el) => {
          if (!el) return;
          const obs = new ResizeObserver(() => {
            const table = el.parentElement?.nextElementSibling?.querySelector("table");
            if (table) el.style.width = table.scrollWidth + "px";
          });
          const table = el.parentElement?.nextElementSibling?.querySelector("table");
          if (table) { el.style.width = table.scrollWidth + "px"; obs.observe(table); }
        }} style={{ height: "1px" }} />
      </div>

      {/* Main table scroll area */}
      <div 
        className="overflow-x-auto dsr-scrollbar"
        onScroll={(e) => {
          const prev = e.currentTarget.previousElementSibling as HTMLElement;
          if (prev) prev.scrollLeft = e.currentTarget.scrollLeft;
        }}
      >
        <table className="w-full text-left border-collapse whitespace-nowrap">
          {/* Super-header row with group labels */}
          <thead>
            {normalizedColumns.some(c => c.group) && (
            <tr>
              {groupSpans.map((gs, idx) => (
                <th 
                  key={idx} 
                  colSpan={gs.span}
                  className={cn(
                    "py-0.5 px-1.5 text-[9px] uppercase tracking-widest font-bold text-center border-b border-slate-200",
                    gs.group ? groupColors[gs.group] || "" : "bg-slate-100 text-slate-500",
                    gs.group && idx > 0 ? groupBorderColors[gs.group] || "" : ""
                  )}
                >
                  <span>{GROUP_LABELS[gs.group] || ""}</span>
                </th>
              ))}
            </tr>
            )}
            {/* Column headers — data columns use fixed narrow widths */}
            <tr className="border-b border-slate-200 bg-white">
              {normalizedColumns.map((col, idx) => {
                const sortState = getSortState(col.key);
                const isSortable = !!col.sortAccessor;
                const isFirstOfGroup = idx === 0 || normalizedColumns[idx - 1].group !== col.group;
                const isDataCol = col.group && col.group !== "agent";
                
                return (
                  <th 
                    key={col.key} 
                    onClick={(e) => handleHeaderClick(col, e)}
                    className={cn(
                      "select-none",
                      isSortable && "cursor-pointer transition-colors",
                      isFirstOfGroup && col.group && idx > 0 ? groupBorderColors[col.group] || "" : "",
                      isDataCol ? "p-0 align-bottom" : "py-1 px-1.5"
                    )}
                    style={isDataCol ? { minWidth: "40px" } : undefined}
                  >
                    {isDataCol ? (
                      /* Angled header — fixed narrow cell, text positioned absolutely */
                      <div style={{ height: "105px", position: "relative", overflow: "visible" }}>
                        <span 
                          className={cn(
                            "absolute whitespace-nowrap text-[10px] uppercase tracking-wider font-semibold",
                            sortState.direction ? "text-blue-600" : "text-slate-500",
                            isSortable && "hover:text-slate-900"
                          )}
                          style={{ 
                            transform: "rotate(-55deg)", 
                            transformOrigin: "bottom left",
                            bottom: "4px",
                            left: "20px",
                          }}
                        >
                          {col.label}
                          {isSortable && sortState.direction === "asc" && " ↑"}
                          {isSortable && sortState.direction === "desc" && " ↓"}
                          {sortState.priority !== null && ` (${sortState.priority})`}
                        </span>
                      </div>
                    ) : (
                      /* Normal horizontal header for agent info columns */
                      <div className={cn(
                        "flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold",
                        sortState.direction ? "text-blue-600" : "text-slate-500",
                        isSortable && "hover:text-slate-900"
                      )}>
                        {col.label}
                        {isSortable && (
                          sortState.direction === "asc" ? <ArrowUp className="w-3 h-3" /> :
                          sortState.direction === "desc" ? <ArrowDown className="w-3 h-3" /> :
                          <ChevronsUpDown className="w-3 h-3 opacity-30" />
                        )}
                        {sortState.priority !== null && (
                          <span className="text-[9px] bg-blue-600 text-white rounded-full w-3.5 h-3.5 flex items-center justify-center">
                            {sortState.priority}
                          </span>
                        )}
                      </div>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {sortedData.length === 0 ? (
              <tr>
                <td colSpan={normalizedColumns.length} className="py-8 text-center text-slate-500">
                  No data available
                </td>
              </tr>
            ) : (
              sortedData.map((item) => (
                <tr key={keyExtractor(item)} className="hover:bg-slate-200 even:bg-slate-100 transition-colors">
                  {renderRow(item)}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
