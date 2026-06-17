import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#111111",
        muted: "#6B6B6B",
        tertiary: "#9A9A9A",
        line: "#E8E8E8",
        divider: "#DADADA",
        brand: "#000000",
        accent: "#F0F0F0",
        surface: "#FFFFFF",
        wash: "#F7F7F7",
        soft: "#F3F3F3"
      }
    }
  },
  plugins: []
} satisfies Config;
