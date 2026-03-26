import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Corporate agriculture palette — forest green primary
        finca: {
          50:  "#F3FAF6",
          100: "#E8F5EE",
          200: "#C6E5D4",
          300: "#9DD0B5",
          400: "#6BB891",
          500: "#4DB882",
          600: "#38996A",
          700: "#2D7A50",
          800: "#245C3E",
          900: "#1B3A2D",
          950: "#0F2318",
        },
        // Earth/coffee accent — warm browns and harvest gold
        earth: {
          50:  "#FDF6E3",
          100: "#FBF0D0",
          200: "#F5DFA1",
          300: "#ECC86A",
          400: "#D4A843",
          500: "#B8912E",
          600: "#8B6914",
          700: "#6B5010",
          800: "#5C4033",
          900: "#3D2A22",
          950: "#231812",
        },
      },
      fontFamily: {
        sans: [
          "var(--font-geist-sans)",
          "system-ui",
          "-apple-system",
          "sans-serif",
        ],
        mono: ["var(--font-geist-mono)", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
