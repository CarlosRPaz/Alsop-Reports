import React from "react";

/**
 * Formats a number or string for table display.
 * - Zero/falsy values are dimmed (text-slate-300)
 * - Values meeting/exceeding a daily goal are highlighted green
 * - Values meeting/exceeding a monthly goal are highlighted gold
 * - 'orange' mode: shows a soft orange background when value is zero/empty (manual input pending)
 * - Otherwise, default styling
 */
export function formatValue(
  value: string | number | null | undefined, 
  prefix = "", 
  suffix = "",
  goal?: { target_value: number } | null,
  highlightColor?: "green" | "gold" | "orange"
) {
  const isZero = 
    value === 0 || 
    value === "0" || 
    value === "0.00" || 
    value === "-" ||
    !value;

  // Format numbers with commas (e.g. 1000 → 1,000)
  const formatNum = (v: string | number): string => {
    if (typeof v === "number") return v.toLocaleString("en-US");
    const parsed = parseFloat(v);
    if (!isNaN(parsed) && isFinite(parsed) && String(parsed) === v.trim()) {
      return parsed.toLocaleString("en-US");
    }
    return v;
  };

  const displayVal = value !== null && value !== undefined ? `${prefix}${formatNum(value)}${suffix}` : "-";

  // Orange highlight for manual-input cells that haven't been submitted yet
  if (highlightColor === "orange" && isZero) {
    return <span className="bg-orange-100 text-orange-400 italic rounded px-1.5 -mx-1 font-normal">–</span>;
  }

  if (isZero) {
    return <span className="text-slate-300 font-normal">{displayVal}</span>;
  }

  // Goal highlighting (green for daily, gold for monthly)
  const effectiveColor = highlightColor || "green";
  if (goal && goal.target_value > 0) {
    const numericVal = typeof value === "number" ? value : parseFloat(String(value));
    if (!isNaN(numericVal) && numericVal >= goal.target_value) {
      const colorClass = effectiveColor === "gold"
        ? "bg-amber-500 text-black italic rounded px-1.5 -mx-1"
        : "bg-emerald-200 text-emerald-900 rounded px-1.5 -mx-1";
      return <span className={colorClass}>{displayVal}</span>;
    }
  }

  return <span>{displayVal}</span>;
}
