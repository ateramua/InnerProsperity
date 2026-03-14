// src/pages/mobile-investments.jsx
import React from "react";
import { useRouter } from "next/router";

export default function MobileInvestments() {
  const router = useRouter();
  
  return (
    <div style={{ 
      padding: "20px", 
      color: "white", 
      background: "#0f2e1c", 
      minHeight: "100vh",
      fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif"
    }}>
      <button 
        onClick={() => router.back()} 
        style={{ 
          fontSize: "24px", 
          background: "none", 
          border: "none", 
          color: "white",
          cursor: "pointer",
          marginBottom: "20px"
        }}
      >
        ← Back
      </button>
      <h1 style={{ fontSize: "28px", marginBottom: "20px" }}>📊 Investments</h1>
      <p style={{ color: "#9CA3AF" }}>Investment portfolio coming soon...</p>
    </div>
  );
}
