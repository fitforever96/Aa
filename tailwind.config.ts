import type { Config } from "tailwindcss";

const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: v("bg"),
        surface: v("surface"),
        surface2: v("surface-2"),
        surface3: v("surface-3"),
        line: v("line"),
        ink: v("ink"),
        ink2: v("ink-2"),
        ink3: v("ink-3"),
        red: { DEFAULT: v("red"), press: v("red-press"), soft: v("red-soft") },
        ok: v("ok"),
        warn: v("warn"),
        info: v("info"),
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        display: ["Roboto Condensed", "Inter", "sans-serif"],
      },
      borderRadius: { xl: "14px", "2xl": "18px", "3xl": "24px" },
      fontSize: { "2xs": ["11px", "14px"] },
      keyframes: {
        rise: { "0%": { opacity: "0", transform: "translateY(6px)" }, "100%": { opacity: "1", transform: "none" } },
        sheet: { "0%": { transform: "translateY(100%)" }, "100%": { transform: "none" } },
        fade: { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
      },
      animation: { rise: "rise .28s cubic-bezier(.2,.8,.2,1) both", sheet: "sheet .32s cubic-bezier(.2,.8,.2,1) both", fade: "fade .2s ease both" },
    },
  },
  plugins: [],
} satisfies Config;
