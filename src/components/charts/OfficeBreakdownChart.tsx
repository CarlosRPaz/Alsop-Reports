"use client"

import { useEffect, useState, useMemo } from "react"
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Cell, LabelList } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { Badge } from "@/components/ui/Badge"

// Leader = green, rest = blue gradient (matching AgencyMTDPacing.tsx)
const RANK_COLORS = ["#059669", "#2563eb", "#60a5fa", "#93c5fd", "#bfdbfe"]

// Abbreviate large numbers
function formatValue(value: number): string {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return Math.round(value).toLocaleString();
}

interface OfficeBreakdownChartProps {
  title: string
  data: any[]
  metricKey?: string
  metricName?: string
  color?: string
}

export function OfficeBreakdownChart({ title, data, metricKey, metricName, color = "#3b82f6" }: OfficeBreakdownChartProps) {
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  // Sort data descending by the selected metric so leader is first
  const sortedData = useMemo(() => {
    if (!metricKey) return data
    return [...data].sort((a, b) => (b[metricKey] || 0) - (a[metricKey] || 0))
  }, [data, metricKey])

  const activeKey = metricKey || "items";
  const activeName = metricName || metricKey || "Items";

  // Custom label renderer for bar tops
  const renderBarLabel = (props: any) => {
    const { x, y, width, value } = props;
    if (value === undefined || value === null || value === 0) return null;
    return (
      <text
        x={x + width / 2}
        y={y - 8}
        fill="#1e293b"
        fontSize={12}
        fontWeight={700}
        textAnchor="middle"
        fontFamily="ui-monospace, monospace"
      >
        {metricKey === "premium" ? `$${formatValue(value)}` : formatValue(value)}
      </text>
    );
  };

  return (
    <Card className="w-full h-full flex flex-col min-h-[300px]">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle>{title}</CardTitle>
        <Badge variant="outline" className="text-[10px] font-extrabold uppercase tracking-wider border-emerald-200 bg-emerald-50 text-emerald-700 shrink-0">
          MTD
        </Badge>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 relative">
        {isMounted ? (
          <div className="absolute inset-x-2 top-0 bottom-6">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sortedData} margin={{ top: 25, right: 10, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis 
                  dataKey="office" 
                  stroke="#64748b" 
                  fontSize={12} 
                  tickLine={false} 
                  axisLine={false} 
                  dy={10}
                />
                <YAxis 
                  stroke="#64748b" 
                  fontSize={11} 
                  tickLine={false} 
                  axisLine={false}
                  width={60}
                  tickFormatter={(value) => metricKey === "premium" ? `$${formatValue(value)}` : formatValue(value)}
                />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ 
                    backgroundColor: '#ffffff', 
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    color: '#0f172a',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)'
                  }}
                  formatter={(value: any) => {
                    const num = Number(value);
                    const formatted = metricKey === "premium" 
                      ? `$${Math.round(num).toLocaleString()}`
                      : Math.round(num).toLocaleString();
                    return [formatted, activeName];
                  }}
                />
                <Bar dataKey={activeKey} name={activeName} radius={[4, 4, 0, 0]}>
                  {sortedData.map((_, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={RANK_COLORS[Math.min(index, RANK_COLORS.length - 1)]} 
                    />
                  ))}
                  <LabelList
                    dataKey={activeKey}
                    content={renderBarLabel}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="w-full h-full min-h-[200px] flex items-center justify-center text-slate-400">
            Loading chart...
          </div>
        )}
      </CardContent>
    </Card>
  )
}
