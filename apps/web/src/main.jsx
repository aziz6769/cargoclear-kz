import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@fontsource-variable/inter';
import '@fontsource-variable/manrope';
import { createRepository } from '@cargoclear/core';
import { seed } from '@cargoclear/core/seed';
import Root from './app/Root.jsx';
import { cloudConfigured } from './lib/supabase.js';
import { createDexieAdapter } from './storage/dexieAdapter.js';
import './index.css';

// Without VITE_SUPABASE_* the app runs exactly as in Phase 3 (IndexedDB + demo seed). With them it requires sign-in.
const localRepo = cloudConfigured ? null : createRepository(createDexieAdapter(), seed);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Root localRepo={localRepo} />
    </BrowserRouter>
  </React.StrictMode>,
);
