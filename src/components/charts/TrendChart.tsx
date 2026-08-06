"use client"

import { useEffect, useState } from "react"
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, LabelList } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"

interface LineConfig {
  key: string;
  name?: string;
  color: string;
  formatter?: (value: number) => string;
}

interface TrendChartProps {
  title: string
  data: any[]
  dataKey?: string
  xAxisKey?: string
  color?: string
  lines?: LineConfig[]
  yAxisFormatter?: (value: number) => string
}

export function TrendChart({ title, data, dataKey, xAxisKey = "date", color = "#3b82f6", lines, yAxisFormatter }: TrendChartProps) {
  const chartLines = lines || (dataKey ? [{ key: dataKey, color: color }] : []);
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  // Default Y-axis formatter: abbreviate large numbers
  const defaultYFormatter = (value: number) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
    return `${value}`;
  };

  const yFormatter = yAxisFormatter || defaultYFormatter;

  // Custom label renderer - show value above each dot
  const renderLabel = (props: any, line: LineConfig) => {
    const { x, y, value } = props;
    if (value === undefined || value === null || value === 0) return null;
    const formatted = line.formatter ? line.formatter(value) : (
      value >= 1000000 ? `${(value / 1000000).toFixed(1)}M` :
      value >= 1000 ? `${(value / 1000).toFixed(0)}K` :
      Math.round(value).toLocaleString()
    );
    return (
      <text
        x={x}
        y={y - 12}
        fill={line.color}
        fontSize={10}
        fontWeight={700}
        textAnchor="middle"
        fontFamily="ui-monospace, monospace"
      >
        {formatted}
      </text>
    );
  };

  return (
    <Card className="w-full h-full flex flex-col min-h-[300px]">
      <CardHeader className="pb-2">
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 relative">
        {isMounted ? (
          <div className="absolute inset-x-2 top-0 bottom-2">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <LineChart data={data} margin={{ top: 20, right: 15, left: 10, bottom: 50 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis 
                  dataKey={xAxisKey} 
                  stroke="#64748b" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false} 
                  interval={0}
                  angle={-45}
                  textAnchor="end"
                  height={60}
                />
                <YAxis 
                  stroke="#64748b" 
                  fontSize={11} 
                  tickLine={false} 
                  axisLine={false}
                  width={55}
                  tickFormatter={yFormatter}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#ffffff', 
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    color: '#0f172a',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                  }}
                  formatter={(value: any, name: any) => {
                    const line = chartLines.find(l => (l.name || l.key) === name);
                    if (line?.formatter) return [line.formatter(Number(value)), name];
                    const num = Number(value);
                    return [num >= 1000 ? Math.round(num).toLocaleString() : num, name];
                  }}
                />
                {chartLines.map((line) => (
                  <Line 
                    key={line.key}
                    name={line.name || line.key}
                    type="monotone" 
                    dataKey={line.key} 
                    stroke={line.color} 
                    strokeWidth={2.5} 
                    dot={{ r: 4, strokeWidth: 2, fill: '#fff' }} 
                    activeDot={{ r: 6, strokeWidth: 0, fill: line.color }} 
                  >
                    <LabelList
                      dataKey={line.key}
                      content={(props: any) => renderLabel(props, line)}
                    />
                  </Line>
                ))}
              </LineChart>
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
