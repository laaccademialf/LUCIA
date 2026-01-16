import React from "react";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";

const COLORS = ["#6366f1", "#22d3ee", "#f59e42", "#f43f5e", "#10b981", "#eab308", "#a21caf", "#64748b"];

export function PieByCategory({ data }) {
  // data: масив об'єктів з полем category
  const summary = Object.entries(
    data.reduce((acc, a) => {
      acc[a.category] = (acc[a.category] || 0) + 1;
      return acc;
    }, {})
  ).map(([name, value]) => ({ name, value }));

  if (!summary.length) return null;

  return (
    <div style={{ width: "100%", height: 260 }}>
      <h3 style={{ color: '#fff', marginBottom: 8 }}>Розподіл за категоріями</h3>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={summary}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            outerRadius={80}
            fill="#6366f1"
            label
          >
            {summary.map((entry, idx) => (
              <Cell key={`cell-${idx}`} fill={COLORS[idx % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
