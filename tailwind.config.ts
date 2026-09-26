import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";
import plugin from "tailwindcss/plugin";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * RailSync Design System — Tailwind theme
 * ════════════════════════════════════════════════════════════════════════════
 * Token VALUES live in `app/globals.css` as CSS custom properties (so they can
 * theme at runtime); this file only wires them into Tailwind utilities.
 *
 * The scales below intentionally REPLACE Tailwind's defaults (they are declared
 * at the theme root, not inside `extend`) so off-system values such as `p-13`,
 * `duration-300` or `shadow-2xl` cannot be generated at all:
 *
 *   1. Typography — 1.25 modular scale, 12px → 39px, 4 font weights
 *   2. Spacing    — 4px base grid (every step is a multiple of 4px)
 *   3. Elevation  — 4 purple-tinted shadow levels (sm · md · lg · xl)
 *   4. Motion     — 3 durations (fast · base · slow) + 1 easing curve
 */
export default {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./app/**/*.{js,ts,jsx,tsx}",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    /* ── 2. Spacing grid · 4px base ─────────────────────────────────────────
       Steps 1–16 are the canonical layout rhythm (4, 8, 12, 16, 20, 24, 28,
       32, 36, 40, 44, 48, 56, 64px); 20–96 exist for fixed component sizes
       (icons, avatars, panels). Sub-4px steps (0.5, 1.5, 2.5, 3.5) are
       deliberately absent — nothing on the grid can render at 2/6/10/14px. */
    spacing: {
      px: "1px",
      0: "0px",
      1: "0.25rem", // 4
      2: "0.5rem", // 8
      3: "0.75rem", // 12
      4: "1rem", // 16
      5: "1.25rem", // 20
      6: "1.5rem", // 24
      7: "1.75rem", // 28
      8: "2rem", // 32
      9: "2.25rem", // 36
      10: "2.5rem", // 40
      11: "2.75rem", // 44
      12: "3rem", // 48
      14: "3.5rem", // 56
      16: "4rem", // 64
      20: "5rem", // 80
      24: "6rem", // 96
      28: "7rem", // 112
      32: "8rem", // 128
      36: "9rem", // 144
      40: "10rem", // 160
      44: "11rem", // 176
      48: "12rem", // 192
      56: "14rem", // 224
      64: "16rem", // 256
      72: "18rem", // 288
      80: "20rem", // 320
      96: "24rem", // 384
    },

    /* ── 1. Typography scale · ratio 1.25 (12 / 14 / 16 / 20 / 25 / 31 / 39)
         Line-heights are multiples of 4px to sit on the same grid. ── */
    fontSize: {
      xs: ["0.75rem", { lineHeight: "1rem" }], // 12 / 16
      sm: ["0.875rem", { lineHeight: "1.25rem" }], // 14 / 20
      base: ["1rem", { lineHeight: "1.5rem" }], // 16 / 24
      lg: ["1.25rem", { lineHeight: "1.75rem" }], // 20 / 28
      xl: ["1.5625rem", { lineHeight: "2rem" }], // 25 / 32
      "2xl": ["1.9375rem", { lineHeight: "2.5rem" }], // 31 / 40
      "3xl": ["2.4375rem", { lineHeight: "3rem" }], // 39 / 48
    },

    /* ── 1b. Font weights — headings semibold/bold, labels medium, body normal.
         Max two emphasis weights per screen. ── */
    fontWeight: {
      normal: "400",
      medium: "500",
      semibold: "600",
      bold: "700",
    },

    extend: {
      /* ── Font Families (Inter) ── */
      fontFamily: {
        sans: ["var(--font-sans)"],
        heading: ["var(--font-sans)"],
        mono: ["var(--font-mono)"],
      },

      /* ── Color Palette ── */
      colors: {
        /* ── Surface layers ── */
        surface: {
          1: "hsl(var(--surface-1))",
          2: "hsl(var(--surface-2))",
          3: "hsl(var(--surface-3))",
        },

        /* ── Border tokens ── */
        "border-subtle": "hsl(var(--border-subtle))",
        "border-default": "hsl(var(--border-default))",
        "border-strong": "hsl(var(--border-strong))",

        /* ── Neutral grays — text hierarchy ── */
        gray: {
          50: "hsl(var(--gray-50))",
          100: "hsl(var(--gray-100))",
          200: "hsl(var(--gray-200))",
          300: "hsl(var(--gray-300))",
          400: "hsl(var(--gray-400))",
          500: "hsl(var(--gray-500))",
          600: "hsl(var(--gray-600))",
          700: "hsl(var(--gray-700))",
          800: "hsl(var(--gray-800))",
          900: "hsl(var(--gray-900))",
          950: "hsl(var(--gray-950))",
        },

        /* ── Base / surfaces ── */
        border: "hsl(var(--border))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",

        /* ── Primary: Royal Purple (#960DF2) ── */
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          hover: "hsl(var(--primary-hover))",
          active: "hsl(var(--primary-active))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },

        /* ── Semantic colors ── */
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
          bg: "hsl(var(--success-bg))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
          bg: "hsl(var(--warning-bg))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
          bg: "hsl(var(--destructive-bg))",
        },
        danger: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
          bg: "hsl(var(--destructive-bg))",
        },

        /* ── Chart colors ── */
        chart: {
          1: "hsl(var(--chart-1))",
          2: "hsl(var(--chart-2))",
          3: "hsl(var(--chart-3))",
          4: "hsl(var(--chart-4))",
          5: "hsl(var(--chart-5))",
        },

        /* ── Sidebar tokens ── */
        sidebar: {
          DEFAULT: "hsl(var(--sidebar))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: {
            DEFAULT: "hsl(var(--sidebar-primary))",
            foreground: "hsl(var(--sidebar-primary-foreground))",
          },
          accent: {
            DEFAULT: "hsl(var(--sidebar-accent))",
            foreground: "hsl(var(--sidebar-accent-foreground))",
          },
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },

      /* ── Border Radius (consistent rounded-lg) ── */
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
        "2xl": "var(--radius-2xl)",
        full: "var(--radius-full)",
      },
    },

    /* ── 3. Elevation system · 4 purple-tinted levels (values in globals.css)
         sm = resting card · md = hover/raised · lg = modal/dropdown
         xl = the single most important element on a page, used sparingly ── */
    boxShadow: {
      none: "none",
      DEFAULT: "var(--shadow-sm)",
      sm: "var(--shadow-sm)",
      md: "var(--shadow-md)",
      lg: "var(--shadow-lg)",
      xl: "var(--shadow-xl)",
    },

    /* ── 4. Motion · one easing curve, three durations ── */
    transitionDuration: {
      DEFAULT: "var(--duration-base)",
      fast: "var(--duration-fast)",
      base: "var(--duration-base)",
      slow: "var(--duration-slow)",
    },
    transitionTimingFunction: {
      DEFAULT: "var(--ease-standard)",
      standard: "var(--ease-standard)",
    },
    /* Radix (dialog/dropdown/select/toast) enter-exit animations read this key,
       so panel motion follows the same tokens as CSS transitions. */
    animationDuration: {
      DEFAULT: "var(--duration-base)",
      fast: "var(--duration-fast)",
      base: "var(--duration-base)",
      slow: "var(--duration-slow)",
    },
  },
  plugins: [
    animate,
    /* ── Note: `.page-container` lives in `app/globals.css` (@layer utilities)
       so the design system keeps a single source of truth. ── */
    /* ── Component & variant plugins ── */
    plugin(({ addVariant }) => {
      addVariant("data-open", [
        "&:where([data-state=\"open\"])",
        "&:where([data-open]:not([data-open=\"false\"]))",
      ]);
      addVariant("data-closed", [
        "&:where([data-state=\"closed\"])",
        "&:where([data-closed]:not([data-closed=\"false\"]))",
      ]);
      addVariant("data-checked", [
        "&:where([data-state=\"checked\"])",
        "&:where([data-checked=\"true\"])",
      ]);
      addVariant("data-unchecked", [
        "&:where([data-state=\"unchecked\"])",
        "&:where([data-unchecked]:not([data-unchecked=\"false\"]))",
      ]);
      addVariant("data-selected", "&:where([data-selected=\"true\"])");
      addVariant("data-disabled", [
        "&:where([data-disabled=\"true\"])",
        "&:where([data-disabled]:not([data-disabled=\"false\"]))",
      ]);
      addVariant("data-active", [
        "&:where([data-state=\"active\"])",
        "&:where([data-active=\"true\"])",
      ]);
      addVariant("data-horizontal", "&:where([data-orientation=\"horizontal\"])");
      addVariant("data-vertical", "&:where([data-orientation=\"vertical\"])");
    }),
  ],
} satisfies Config;
