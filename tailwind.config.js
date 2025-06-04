/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'bronze': '#C47E36',      // Primærfarge
        'ivory': '#F8F5F2',       // Bakgrunn
        'charcoal': '#2A2A2A',    // Tekst
        'steel-blue': '#50667C',  // Aksent
        'success-green': '#6A8B5F',
        'muted-red': '#B04C3A',
      },
    },
  },
  plugins: [],
} 