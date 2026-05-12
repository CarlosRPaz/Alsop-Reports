"use client"

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"

interface LineConfig {
  key: string;
  name?: string;
  color: string;
}

interface TrendChartProps {
  title: string
  data: any[]
  dataKey?: string
  xAxisKey?: string
  color?: string
  lines?: LineConfig[]
}

export function TrendChart({ title, data, dataKey, xAxisKey = "date", color = "#3b82f6", lines }: TrendChartProps) {
  const chartLines = lines || (dataKey ? [{ key: dataKey, color: color }] : []);

  return (
    <Card className="w-full h-full flex flex-col min-h-[300px]">
      <CardHeader className="pb-2">
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
            <XAxis 
              dataKey={xAxisKey} 
              stroke="#64748b" 
              fontSize={12} 
              tickLine={false} 
              axisLine={false} 
              dy={10}
            />
            <YAxis 
              stroke="#64748b" 
              fontSize={12} 
              tickLine={false} 
              axisLine={false} 
              tickFormatter={(value) => `${value}`}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: '#ffffff', 
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                color: '#0f172a'
              }} 
            />
            {lines && <Legend wrapperStyle={{ paddingTop: '20px' }} />}
            {chartLines.map((line) => (
              <Line 
                key={line.key}
                name={line.name || line.key}
                type="monotone" 
                dataKey={line.key} 
                stroke={line.color} 
                strokeWidth={3} 
                dot={{ r: 4, strokeWidth: 2 }} 
                activeDot={{ r: 6, strokeWidth: 0 }} 
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
