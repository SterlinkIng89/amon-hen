/** @type {import('tailwindcss').Config} */
import defaultTheme from "tailwindcss/defaultTheme";

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        base: "#0d0f14",
        surface: "#13161e",
        elevated: "#1a1e28",
        card: {
          DEFAULT: "#1e2330",
          hover: "#252a38",
        },
        accent: {
          DEFAULT: "#f97316",
          hover: "#fb923c",
          dim: "rgba(249, 115, 22, 0.12)",
        },
        border: {
          subtle: "rgba(255, 255, 255, 0.06)",
          medium: "rgba(255, 255, 255, 0.10)",
          accent: "rgba(249, 115, 22, 0.40)",
        },
        text: {
          primary: "#e8eaf0",
          secondary: "#7c8799",
          muted: "#3e4a5c",
        },
      },
      borderRadius: {
        sm: "5px",
        md: "9px",
        lg: "13px",
      },
      height: {
        header: "50px",
      },
      width: {
        list: "310px",
      },
      fontFamily: {
        poppins: ["Poppins", ...defaultTheme.fontFamily.sans],
        inter: ["Inter", ...defaultTheme.fontFamily.sans],
        montserrat: ["Montserrat", ...defaultTheme.fontFamily.sans],
        "titillium-web": ["Titillium Web", ...defaultTheme.fontFamily.sans],
        helvetica: ["Helvetica Neue", ...defaultTheme.fontFamily.sans],
        sans: ["Inter", "Segoe UI", "system-ui", "sans-serif"],
        mono: ["Consolas", "Monaco", "monospace"],
      },
      animation: {
        shimmer: "shimmer 1.4s infinite",
        slideDown: "slideDown 0.15s ease-out",
        slideUp: "slideUp 0.2s ease-out",
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" },
        },
        slideDown: {
          "0%": { opacity: "0", transform: "translateY(-8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};
