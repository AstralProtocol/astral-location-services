import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  base: '/dashboard/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Ensure bare imports from e2e/tests/ and e2e/lib/ (outside the
      // dashboard package root) resolve through the dashboard's node_modules
      'ethers': path.resolve(__dirname, 'node_modules/ethers'),
    },
  },
  optimizeDeps: {
    include: ['ethers'],
  },
});
