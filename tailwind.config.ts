import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: '#0d0f12',
        surface: '#13161b',
        card: '#1a1e26',
        bdr: '#252a35',
        accent: 'var(--accent, #f97316)',
        success: '#22c55e',
        warning: '#fbbf24',
        error: '#ef4444',
      },
      fontFamily: {
        heading: ['Barlow Condensed', 'sans-serif'],
        body: ['Barlow', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
export default config;
