import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/rowdies/400.css';
import '@fontsource/rowdies/700.css';
import './index.css';
import App from './App.tsx';
import ErrorBoundary from './ErrorBoundary.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
