// First, so every module below sees the platform (see lib/platform.ts).
import './lib/platform';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Root } from './Root';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './styles/index.css';
import './styles/system.css';

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <Root />
    </StrictMode>,
  );
}
