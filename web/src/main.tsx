import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './app/App.tsx';
import { ConfirmProvider } from '@/components/ui/confirm-provider';
import { Toaster } from '@/components/ui/toaster';
import { AuthProvider } from '@/features/auth';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <ConfirmProvider>
        <App />
      </ConfirmProvider>
    </AuthProvider>
    <Toaster />
  </StrictMode>,
);
