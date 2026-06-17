"use client"

import { useEffect, useState } from "react"
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend, CartesianGrid } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"

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

  return (
    <Card className="w-full h-full flex flex-col min-h-[300px]">
      <CardHeader className="pb-2">
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 relative">
        {isMounted ? (
          <div className="absolute inset-x-6 top-0 bottom-6">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
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
                  fontSize={12} 
                  tickLine={false} 
                  axisLine={false} 
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
                />
                <Legend wrapperStyle={{ paddingTop: '20px' }} />
                {metricKey ? (
                  <Bar dataKey={metricKey} name={metricName || metricKey} fill={color} radius={[4, 4, 0, 0]} />
                ) : (
                  <>
                    <Bar dataKey="items" name="Items" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="premium" name="Premium ($)" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </>
                )}
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
