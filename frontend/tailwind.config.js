/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {
    colors: { navy: '#0b1220', panel: '#0f172a', line: '#1e293b', brand: '#2563eb', cyanx: '#38bdf8' },
    fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
    boxShadow: { glow: '0 0 24px rgba(56,189,248,.25)' },
  } },
  plugins: [],
};
