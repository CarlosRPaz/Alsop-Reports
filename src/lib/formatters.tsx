import React from "react";

/**
 * Formats a number or string for table display.
 * - Zero/falsy values are dimmed (text-slate-300)
 * - Values meeting/exceeding a daily goal are highlighted green
 * - Values meeting/exceeding a monthly goal are highlighted gold
 * - Otherwise, default styling
 */
export function formatValue(
  value: string | number | null | undefined, 
  prefix = "", 
  suffix = "",
  goal?: { target_value: number } | null,
  highlightColor: "green" | "gold" = "green"
) {
  const isZero = 
    value === 0 || 
    value === "0" || 
    value === "0.00" || 
    value === "-" ||
    !value;

  const displayVal = value !== null && value !== undefined ? `${prefix}${value}${suffix}` : "-";

  if (isZero) {
    return <span className="text-slate-300 font-normal">{displayVal}</span>;
  }

  // Goal highlighting
  if (goal && goal.target_value > 0) {
    const numericVal = typeof value === "number" ? value : parseFloat(String(value));
    if (!isNaN(numericVal) && numericVal >= goal.target_value) {
      const colorClass = highlightColor === "gold"
        ? "bg-amber-500 text-black italic rounded px-1.5 -mx-1"
        : "bg-emerald-200 text-emerald-900 rounded px-1.5 -mx-1";
      return <span className={colorClass}>{displayVal}</span>;
    }
  }

  return <span>{displayVal}</span>;
}
