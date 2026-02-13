/** @type {import('tailwindcss').Config} */
import defaultTheme from "tailwindcss/defaultTheme";

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      keyframes: {
        bounceClick: {
          "0%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.1)" },
          "100%": { transform: "scale(1)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        blurIn: {
          "0%": { opacity: "0", filter: "blur(5px)" },
          "100%": { opacity: "1", filter: "blur(0)" },
        },
      },
      animation: {
        bounceClick: "bounceClick 0.3s ease-in-out",
        shimmer: "shimmer 2s infinite linear",
        blurIn: "blurIn 0.2s ease-out forwards",
      },
      maxHeight: {
        128: "32rem",
      },
      fontFamily: {
        poppins: ["Poppins", ...defaultTheme.fontFamily.sans],
        inter: ["Inter", ...defaultTheme.fontFamily.sans],
        montserrat: ["Montserrat", ...defaultTheme.fontFamily.sans],
        "titillium-web": ["Titillium Web", ...defaultTheme.fontFamily.sans],
        helvetica: ["Helvetica Neue", ...defaultTheme.fontFamily.sans],
        sans: ["Roboto", ...defaultTheme.fontFamily.sans],
      },
      colors: {
        "black-estral": "#1C1C1C",
        "black-estraltrans": "#2F2F2F",
        "blue-estral": "#2C5586",
        "task-blue": "#3B4EF6",
        "task-lightBlue": "#3B82F6",
        "task-purple": "#7949FF",
        "task-green": "#30970B",
        "task-turquoise": "#14B8A6",
        "task-red": "#FF455C",
        "task-pink": "#EC4899",
        "task-orange": "#FD8117",
        "task-lightOrange": "#F59E0B",
        "gray-card": "#f4f4f5",
        "gray-table": "#474d5605",
        "gray-log": "#9e9e9e",
        "orange-stepbar": "#FF7223",
        "materialui-gray-box": "#CECECE",
        "table-row-gray": "#FBFBFC ",
        "table-head-gray": "#F4F4F5",
        "hyperText-blue": "#3B4EF6",
        "table-portfolio-head": "#FCFCFC",
        "table-portfolio-border": "#E8E8E8",
        "badge-complete": "#30970B",
        "report-cian": "#14B8A6",
        "report-blue": "#3B82F6",
        "graybg-thead": "#F8F9FA",
        "checkbox-border": "#CED4DA",
        "gray-label-dashboard": "#CED5DC",
        "gray-border-card": "#D1D1D1",
        "orange-late-bar": "#FD8117",
        "orange-risk-bar": "#F59E0B",
      },
      backgroundImage: {
        "page-gradient": "linear-gradient(to top, #050505 10%, #101112 90%)",
      },
      gridTemplateColumns: {
        21: "repeat(21, minmax(0, 1fr))",
      },
      screens: {
        desktop1024x768: "1024px",
        desktop1280x1024: "1280px",
        desktop1440x1024: "1440px",
        desktop1920x1080: "1920px",
      },
    },
  },
  plugins: [],
};
