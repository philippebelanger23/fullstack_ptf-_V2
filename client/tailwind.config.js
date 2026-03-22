/** @type {import('tailwindcss').Config} */
export default {
    darkMode: ['selector', '[data-theme="dark"]'],
    content: [
        "./index.html",
        "./App.tsx",
        "./index.tsx",
        "./components/**/*.{js,ts,jsx,tsx}",
        "./views/**/*.{js,ts,jsx,tsx}",
        "./services/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                wallstreet: {
                    50: 'var(--wallstreet-900)',    // Using main bg as lightest
                    100: 'var(--wallstreet-900)',
                    200: 'var(--wallstreet-700)',
                    300: 'var(--wallstreet-600)',
                    400: 'var(--wallstreet-500)',   // Mapping 400 to muted text color range
                    500: 'var(--wallstreet-500)',
                    600: 'var(--wallstreet-600)',
                    700: 'var(--wallstreet-700)',
                    800: 'var(--wallstreet-800)',
                    900: 'var(--wallstreet-900)',
                    950: '#020617',
                    text: 'var(--wallstreet-text)',
                    accent: 'var(--wallstreet-accent)',
                    danger: 'var(--wallstreet-danger)',
                    success: 'var(--wallstreet-success)',
                    warning: 'var(--wallstreet-warning)'
                }
            },
            fontFamily: {
                sans: ['Inter', 'sans-serif'],
                mono: ['JetBrains Mono', 'monospace'],
            },
        },
    },
    plugins: [],
}
