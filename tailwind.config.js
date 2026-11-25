/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: { extend: { colors: { midnight: '#020711', water: '#65edff', splash: '#ff4fa1' }, fontFamily: { display: ['Syne'], sans: ['Plus Jakarta Sans'], mono: ['JetBrains Mono'] } } },
  plugins: [],
};
