import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#2563eb",
          foreground: "#ffffff",
        },
        secondary: {
          DEFAULT: "#0ea5e9",
          foreground: "#ffffff",
        },
        muted: {
          DEFAULT: "#f3f4f6",
          foreground: "#4b5563",
        },
        destructive: {
          DEFAULT: "#ef4444",
          foreground: "#ffffff",
        },
        success: {
          DEFAULT: "#16a34a",
          foreground: "#ffffff",
        },
      },
    },
  },
  plugins: [],
};

export default config;
