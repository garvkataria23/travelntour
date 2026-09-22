/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        navy: "#071833",
        primary: "#1688f9"
      },
      boxShadow: {
        soft: "0 24px 80px rgba(10, 25, 45, 0.12)"
      }
    }
  },
  plugins: []
};
