/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                primary: "#1e3a8a", /* Ein schönes Kirchen-Blau */
                secondary: "#fbbf24", /* Ein warmes Gold-Gelb */
            }
        },
    },
    plugins: [],
}