import type { Config } from "tailwindcss";

/**
 * VitalFlow shared Tailwind preset.
 *
 * Every color maps to a CSS custom property from
 * @vitalflow/ui/styles/tokens.css so tenants can theme at runtime.
 */
const preset: Partial<Config> = {
  darkMode: ["class"],
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      colors: {
        border: "hsl(var(--vf-border))",
        input: "hsl(var(--vf-input))",
        ring: "hsl(var(--vf-ring))",
        background: "hsl(var(--vf-background))",
        foreground: "hsl(var(--vf-foreground))",
        primary: {
          DEFAULT: "hsl(var(--vf-primary))",
          foreground: "hsl(var(--vf-primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--vf-secondary))",
          foreground: "hsl(var(--vf-secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--vf-muted))",
          foreground: "hsl(var(--vf-muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--vf-accent))",
          foreground: "hsl(var(--vf-accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--vf-destructive))",
          foreground: "hsl(var(--vf-destructive-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--vf-success))",
          foreground: "hsl(var(--vf-success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--vf-warning))",
          foreground: "hsl(var(--vf-warning-foreground))",
        },
        info: {
          DEFAULT: "hsl(var(--vf-info))",
          foreground: "hsl(var(--vf-info-foreground))",
        },
        clinical: {
          critical: "hsl(var(--vf-clinical-critical))",
          warning: "hsl(var(--vf-clinical-warning))",
          normal: "hsl(var(--vf-clinical-normal))",
          info: "hsl(var(--vf-clinical-info))",
        },
      },
      borderRadius: {
        lg: "var(--vf-radius)",
        md: "calc(var(--vf-radius) - 2px)",
        sm: "calc(var(--vf-radius) - 4px)",
      },
      fontFamily: {
        sans: ["var(--vf-font-sans)", "ui-sans-serif", "system-ui"],
        mono: ["var(--vf-font-mono)", "ui-monospace", "SFMono-Regular"],
      },
      boxShadow: {
        "vf-sm": "var(--vf-shadow-sm)",
        "vf-md": "var(--vf-shadow-md)",
        "vf-lg": "var(--vf-shadow-lg)",
      },
      transitionTimingFunction: {
        vf: "var(--vf-ease)",
      },
      transitionDuration: {
        fast: "var(--vf-duration-fast)",
        normal: "var(--vf-duration-normal)",
        slow: "var(--vf-duration-slow)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "fade-out": { from: { opacity: "1" }, to: { opacity: "0" } },
      },
      animation: {
        "accordion-down": "accordion-down var(--vf-duration-normal) var(--vf-ease)",
        "accordion-up": "accordion-up var(--vf-duration-normal) var(--vf-ease)",
        "fade-in": "fade-in var(--vf-duration-normal) var(--vf-ease)",
        "fade-out": "fade-out var(--vf-duration-normal) var(--vf-ease)",
      },
    },
  },
  plugins: [],
};

export default preset;
