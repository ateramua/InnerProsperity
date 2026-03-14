"use client";

import React from "react";

const Section = ({ title, items, color }) => (
  <div style={{ marginBottom: 30 }}>
    <h2 style={{ color }}>{title}</h2>
    <ul>
      {items.map((item, i) => (
        <li key={i} style={{ marginBottom: 6 }}>
          {item}
        </li>
      ))}
    </ul>
  </div>
);

export default function StatusPage() {
  const completed = [
    "Electron desktop app foundation",
    "Menu bar (File, Edit, Budget, View, Help)",
    "Preload IPC bridge",
    "React UI with Next.js",
    "SQLite database schema",
    "Seed data for categories",
    "Budget Engine (4 SoulFunds rules)",
    "Budget dashboard UI",
    "Category groups with expand/collapse",
    "Budget summary cards",
    "Month navigation",
    "Assign and Spend buttons",
    "IPC communication handlers",
    "Credit Card Planner UI"
  ];

  const inProgress = [
    "Database IPC handler testing",
    "Connecting UI to real database",
    "Credit card planner integration",
    "Credit card account database connections"
  ];

  const tomorrow = [
    "Test database connection",
    "Verify categories load from DB",
    "Remove mock data fallback",
    "Integrate Credit Card Planner",
    "Connect Assign/Spend to database",
    "Start Forecasting Engine",
    "Create ForecastView.jsx"
  ];

  const future = [
    "2-week cashflow forecast",
    "1-month projections",
    "Multi-year wealth forecasting",
    "What-if scenario modeling",
    "Browser extension",
    "Mobile companion app"
  ];

  return (
    <div
      style={{
        padding: 40,
        background: "#111",
        color: "#eee",
        minHeight: "100vh",
        fontFamily: "sans-serif"
      }}
    >
      <h1 style={{ marginBottom: 30 }}>📊 Project Status</h1>

      <Section
        title="✅ Completed"
        items={completed}
        color="#00d084"
      />

      <Section
        title="🚧 In Progress"
        items={inProgress}
        color="#ffb020"
      />

      <Section
        title="📋 Tomorrow"
        items={tomorrow}
        color="#4dabf7"
      />

      <Section
        title="🚀 Future Features"
        items={future}
        color="#b197fc"
      />
    </div>
  );
}