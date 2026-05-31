/** @type {import('tailwindcss').Config} */
import defaultTheme from "tailwindcss/defaultTheme";

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  // Always dark — no class toggling needed
  darkMode: "media",
  theme: {
    extend: {
      colors: {
        // ── Backgrounds (Zinc scale — zero blue hue) ────────────────────
        base:     "#09090b",   // Zinc-950: true near-black
        surface:  "#111113",   // Zinc-900-ish: darkest chrome
        elevated: "#18181b",   // Zinc-900: panels, sidebars
        card: {
          DEFAULT: "#1c1c1f",  // Zinc-800-ish: video cards, list items
          hover:   "#27272a",  // Zinc-800: hover state
        },

        // ── Accent — orange iris from the logo ──────────────────────────
        accent: {
          DEFAULT: "#f97316",               // Orange-500
          hover:   "#fb923c",               // Orange-400
          dim:     "rgba(249,115,22,0.12)", // subtle tint for selections
        },

        // ── Fire — crimson ring from the logo (danger / special) ────────
        fire: {
          DEFAULT: "#b91c1c",               // Crimson close to #B22222
          dim:     "rgba(185,28,28,0.15)",
        },

        // ── Borders ─────────────────────────────────────────────────────
        border: {
          subtle: "rgba(255,255,255,0.07)",
          medium: "rgba(255,255,255,0.12)",
          accent: "rgba(249,115,22,0.35)",
          fire:   "rgba(185,28,28,0.40)",
        },

        // ── Text (Zinc — warm-neutral, no blue tint) ────────────────────
        text: {
          primary:   "#f4f4f5", // Zinc-100: crisp warm white
          secondary: "#71717a", // Zinc-500: mid-grey labels
          muted:     "#3f3f46", // Zinc-700: de-emphasised hints
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
        fadeIn: "fadeIn 0.18s ease-out",
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
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};
