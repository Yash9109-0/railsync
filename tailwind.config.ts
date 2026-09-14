import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";
import plugin from "tailwindcss/plugin";

export default {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./app/**/*.{js,ts,jsx,tsx}",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      /* ── Font Families (Inter) ── */
      fontFamily: {
        sans: ["var(--font-sans)"],
        heading: ["var(--font-heading)"],
        mono: ["var(--font-mono)"],
      },

      /* ── Color Palette ── */
      colors: {
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
          hover: "hsl(var(--primary-hover))",  /* #F3E5FE — lighter tint */
          active: "hsl(var(--primary-active))", /* #6D09B13 — darker shade */
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },

        /* ── Semantic colors ── */
        success: {
          DEFAULT: "hsl(var(--success))",           /* #1FA65C */
          foreground: "hsl(var(--success-foreground))",
          bg: "hsl(var(--success-bg))",             /* light tint for badges */
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",           /* #F2A60D */
          foreground: "hsl(var(--warning-foreground))",
          bg: "hsl(var(--warning-bg))",             /* light tint for badges */
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",       /* #F2340D */
          foreground: "hsl(var(--destructive-foreground))",
          bg: "hsl(var(--destructive-bg))",         /* light tint for badges */
        },
        danger: {
          DEFAULT: "hsl(var(--destructive))",       /* alias → same as destructive */
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

      /* ── Shadows ── */
      boxShadow: {
        card: "var(--shadow-card)",
        elegant: "0 4px 6px -1px var(--tw-shadow-color)",
      },
    },
  },
  plugins: [
    animate,
    /* ── Page Container utility ── */
    plugin(({ addUtilities }) => {
      addUtilities({
        ".page-container": {
          width: "100%",
          marginLeft: "auto",
          marginRight: "auto",
          paddingLeft: "1rem",
          paddingRight: "1rem",
          maxWidth: "72rem",
          "@media (min-width: 640px)": {
            paddingLeft: "1.5rem",
            paddingRight: "1.5rem",
          },
          "@media (min-width: 1024px)": {
            maxWidth: "72rem",
          },
        },
      });
    }),
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
