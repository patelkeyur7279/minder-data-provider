import React from "react";
import Link from "next/link";

export default function HomePage() {
  console.log("HomePage rendering...");

  return (
    <div
      style={{
        padding: "40px",
        maxWidth: "1200px",
        margin: "0 auto",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}>
      <div
        style={{
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
          padding: "40px",
          borderRadius: "12px",
          color: "white",
          marginBottom: "40px",
        }}>
        <h1 style={{ margin: 0, fontSize: "48px" }}>🎯 Minder Data Provider</h1>
        <p style={{ margin: "10px 0 0 0", fontSize: "20px", opacity: 0.9 }}>
          Universal Data Provider for React & Next.js - ONE function to rule
          them all!
        </p>
      </div>

      <div
        style={{
          background: "#f0fdf4",
          border: "2px solid #86efac",
          padding: "20px",
          borderRadius: "8px",
          marginBottom: "40px",
        }}>
        <p
          style={{
            margin: 0,
            color: "#15803d",
            fontWeight: "bold",
            fontSize: "18px",
          }}>
          ✅ Package loaded successfully! No errors!
        </p>
        <p style={{ margin: "8px 0 0 0", color: "#166534", fontSize: "14px" }}>
          The new minder() API is configured and ready to use.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: "20px",
          marginBottom: "40px",
        }}>
        <div
          style={{
            background: "white",
            border: "1px solid #e5e7eb",
            borderRadius: "8px",
            padding: "24px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
          }}>
          <h3 style={{ margin: "0 0 12px 0", color: "#1f2937" }}>
            🚀 New Universal API
          </h3>
          <p style={{ color: "#6b7280", fontSize: "14px", lineHeight: "1.6" }}>
            Simple, powerful, and type-safe. Use the new <code>minder()</code>{" "}
            function for all your data needs.
          </p>
          <Link
            href='/test-new-api'
            style={{
              display: "inline-block",
              marginTop: "12px",
              color: "#667eea",
              textDecoration: "none",
              fontWeight: "bold",
            }}>
            View Examples →
          </Link>
        </div>

        <div
          style={{
            background: "white",
            border: "1px solid #e5e7eb",
            borderRadius: "8px",
            padding: "24px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
          }}>
          <h3 style={{ margin: "0 0 12px 0", color: "#1f2937" }}>
            🔐 Authentication Demo
          </h3>
          <p style={{ color: "#6b7280", fontSize: "14px", lineHeight: "1.6" }}>
            Complete auth flow with Login, Register, Dashboard, and User
            management using real API.
          </p>
          <Link
            href='/auth/login'
            style={{
              display: "inline-block",
              marginTop: "12px",
              color: "#667eea",
              textDecoration: "none",
              fontWeight: "bold",
            }}>
            Try Auth Demo →
          </Link>
        </div>

        <div
          style={{
            background: "white",
            border: "1px solid #e5e7eb",
            borderRadius: "8px",
            padding: "24px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
          }}>
          <h3 style={{ margin: "0 0 12px 0", color: "#1f2937" }}>
            🚀 Complete CRUD
          </h3>
          <p style={{ color: "#6b7280", fontSize: "14px", lineHeight: "1.6" }}>
            All CRUD operations: Create, Read, Update, Patch, Delete & Search
            with real-time updates.
          </p>
          <Link
            href='/crud-demo'
            style={{
              display: "inline-block",
              marginTop: "12px",
              color: "#667eea",
              textDecoration: "none",
              fontWeight: "bold",
            }}>
            Try CRUD Demo →
          </Link>
        </div>

        <div
          style={{
            background: "white",
            border: "1px solid #e5e7eb",
            borderRadius: "8px",
            padding: "24px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
          }}>
          <h3 style={{ margin: "0 0 12px 0", color: "#1f2937" }}>
            ⚡ Zero Configuration
          </h3>
          <p style={{ color: "#6b7280", fontSize: "14px", lineHeight: "1.6" }}>
            No provider wrapper needed. Just call <code>configureMinder()</code>{" "}
            once and you're ready to go.
          </p>
        </div>

        <div
          style={{
            background: "white",
            border: "1px solid #e5e7eb",
            borderRadius: "8px",
            padding: "24px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
          }}>
          <h3 style={{ margin: "0 0 12px 0", color: "#1f2937" }}>
            📦 Lightweight
          </h3>
          <p style={{ color: "#6b7280", fontSize: "14px", lineHeight: "1.6" }}>
            Only 510KB with all dependencies bundled. Users install zero extra
            packages!
          </p>
        </div>
      </div>

      <div
        style={{
          background: "#fefce8",
          border: "2px solid #fde047",
          padding: "24px",
          borderRadius: "8px",
          marginBottom: "40px",
        }}>
        <h2 style={{ margin: "0 0 16px 0", color: "#854d0e" }}>
          📚 Quick Start
        </h2>
        <pre
          style={{
            background: "#1e293b",
            color: "#e2e8f0",
            padding: "16px",
            borderRadius: "6px",
            overflow: "auto",
            fontSize: "13px",
          }}>
          {`// 1. Install
npm install minder-data-provider

// 2. Configure (once in _app.tsx)
import { configureMinder } from 'minder-data-provider';

configureMinder({
  baseURL: 'https://api.example.com',
  timeout: 30000
});

// 3. Use anywhere!
import { minder } from 'minder-data-provider';

// Pure function approach
const { data, error } = await minder('users');

// Or React hook approach
import { useMinder } from 'minder-data-provider';
const { data, loading } = useMinder('users');`}
        </pre>
      </div>

      <div style={{ textAlign: "center", padding: "40px 0" }}>
        <h2 style={{ marginBottom: "20px", color: "#1f2937" }}>
          🎨 Live Demos
        </h2>
        <Link
          href='/test-new-api'
          style={{
            display: "inline-block",
            background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            color: "white",
            padding: "16px 32px",
            borderRadius: "8px",
            textDecoration: "none",
            fontWeight: "bold",
            fontSize: "18px",
            boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
          }}>
          View Interactive Examples →
        </Link>
      </div>
    </div>
  );
}
