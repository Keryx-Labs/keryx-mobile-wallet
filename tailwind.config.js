/** @type {import('tailwindcss').Config} */
// Same palette as keryx-labs.com and the desktop wallet. Every colour resolves through a CSS
// custom property declared in src/index.css; `<alpha-value>` keeps opacity modifiers working.
const token = (name) => `rgb(var(--mx-${name}) / <alpha-value>)`;
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        keryx: {
          bg: token("bg"),
          surface: token("surface"),
          border: token("border"),
          borderHi: token("border-hi"),
          bright: token("bright"),
          green: token("green"),
          mid: token("mid"),
          dim: token("dim"),
          // Decoration only: too low-contrast for text.
          muted: token("muted"),
          fill: token("fill"),
          cta: token("cta"),
          onCta: token("on-cta"),
          text: token("text"),
          ink: token("ink"),
          warn: token("warn"),
          error: token("error"),
          // Legacy names.
          dark: token("bg"),
          panel: token("surface"),
          teal: token("mid"),
        },
      },
      fontFamily: {
        mono: ["JetBrains Mono", "Fira Code", "ui-monospace", "monospace"],
        sans: ["JetBrains Mono", "Fira Code", "ui-monospace", "monospace"],
      },
      borderRadius: {
        sm: "6px",
        DEFAULT: "10px",
        lg: "10px",
      },
      letterSpacing: {
        label: "0.24em",
        "label-wide": "0.34em",
      },
      boxShadow: {
        cta: "0 0 32px rgba(0,229,51,0.35)",
        card: "0 8px 30px rgba(0,0,0,0.35), 0 0 24px rgba(0,229,51,0.05)",
        glow: "0 0 0 1px rgba(46,227,88,0.25), 0 0 24px -6px rgba(46,227,88,0.35)",
      },
    },
  },
  plugins: [],
};
