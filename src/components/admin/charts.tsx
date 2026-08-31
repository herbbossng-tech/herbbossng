'use client';

import { Line, LineChart, Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

export function OrdersLineChart({ data }: { data: { date: string; orders: number; revenue: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#0f3d2e15" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#0f3d2e60" />
        <YAxis tick={{ fontSize: 11 }} stroke="#0f3d2e60" />
        <Tooltip />
        <Line type="monotone" dataKey="orders" stroke="#0f3d2e" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function RevenueBarChart({ data }: { data: { name: string; revenue: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#0f3d2e15" />
        <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="#0f3d2e60" />
        <YAxis tick={{ fontSize: 11 }} stroke="#0f3d2e60" />
        <Tooltip />
        <Bar dataKey="revenue" fill="#b6862c" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
