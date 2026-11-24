// Configuration Tailwind CSS — palette café, ombres douces et animations maison.
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      boxShadow: {
        soft: '0 2px 12px rgb(28 25 23 / 0.07)',
      },
      keyframes: {
        // Flash ambré : nouvelle commande qui arrive dans la colonne cuisine.
        flash: {
          '0%, 100%': { backgroundColor: 'transparent' },
          '30%': { backgroundColor: 'rgb(253 230 138)' },
        },
        // Feuille du panier mobile : glissement vers le haut.
        'sheet-up': {
          from: { transform: 'translateY(24px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
      },
      animation: {
        flash: 'flash 2.2s ease-out',
        'sheet-up': 'sheet-up 0.25s ease-out',
      },
    },
  },
  plugins: [],
};
