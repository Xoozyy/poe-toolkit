import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { LeagueWidgetApp } from './components/LeagueWidgetApp';
import './index.css';
import './widget.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LeagueWidgetApp />
  </StrictMode>,
);
