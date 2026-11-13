import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@fontsource-variable/inter';
import { createRepository } from '@cargoclear/core';
import { seed } from '@cargoclear/core/seed';
import App from './App.jsx';
import { createDexieAdapter } from './storage/dexieAdapter.js';
import './index.css';

// Storage layer -> Data access layer. Replace `repo` with a REST-backed repository later.
const repo = createRepository(createDexieAdapter(), seed);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App repo={repo} />
    </BrowserRouter>
  </React.StrictMode>,
);
