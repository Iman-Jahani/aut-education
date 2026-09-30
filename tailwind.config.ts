import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        primary: "#6366f1",
        primary2: "#8b5cf6",
        ink: "#1e293b",
        muted: "#64748b",
        line: "#e2e8f0",
        success: "#10b981",
        warning: "#f59e0b",
        danger: "#ef4444",
      },
      fontFamily: {
        sans: ["Vazirmatn", "Segoe UI", "Tahoma", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      boxShadow: {
        soft: "0 1px 2px rgba(15,23,42,.04), 0 4px 16px rgba(15,23,42,.06)",
        lift: "0 2px 4px rgba(15,23,42,.05), 0 12px 32px rgba(99,102,241,.14)",
        glow: "0 8px 28px rgba(99,102,241,.38)",
      },
      borderRadius: {
        sm: "8px",
        md: "12px",
        lg: "16px",
        xl: "20px",
      },
    },
  },
  plugins: [],
};
export default config;
