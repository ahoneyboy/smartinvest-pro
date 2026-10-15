/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0d1117",
        card: "#161b22",
        card2: "#1c2129",
        line: "#30363d",
        up: "#ef4444",
        down: "#22c55e",
        mut: "#8b949e",
        fg: "#e6edf3",
        accent: "#58a6ff",
        gold: "#e3b341",
      },
      fontFamily: {
        mono: ["'JetBrains Mono'", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};
