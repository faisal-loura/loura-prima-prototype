import type { Config } from "tailwindcss";

/** Tokens are RGB channels in globals.css so opacity modifiers (`bg-ink/80`) work. */
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: ["class"],
  // Utilities are scoped under body so they outrank Blueprint's `.bp6-dark a` style rules.
  important: "body",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "Georgia", "serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      colors: {
        background: token("background"),
        surface: token("surface"),
        foreground: token("foreground"),
        card: { DEFAULT: token("card"), foreground: token("card-foreground") },
        popover: { DEFAULT: token("popover"), foreground: token("popover-foreground") },
        primary: { DEFAULT: token("primary"), foreground: token("primary-foreground") },
        secondary: { DEFAULT: token("secondary"), foreground: token("secondary-foreground") },
        muted: { DEFAULT: token("muted"), foreground: token("muted-foreground") },
        accent: { DEFAULT: token("accent"), foreground: token("accent-foreground") },
        destructive: { DEFAULT: token("destructive"), foreground: token("destructive-foreground") },
        border: token("border"),
        input: token("input"),
        ring: token("ring"),
        ink: token("ink"),
        brand: token("brand"),
        // State tones — see <StatusTag> and the [data-tone] rules in globals.css.
        ready: { DEFAULT: token("ready"), soft: token("ready-soft") },
        risk: { DEFAULT: token("risk"), soft: token("risk-soft") },
        blocked: { DEFAULT: token("blocked"), soft: token("blocked-soft") },
        unknown: { DEFAULT: token("unknown"), soft: token("unknown-soft") },
        progress: { DEFAULT: token("progress"), soft: token("progress-soft") },
        "brand-strong": token("brand-strong"),
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 4px)",
        sm: "calc(var(--radius) - 6px)",
      },
      letterSpacing: {
        eyebrow: "0.08em",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
