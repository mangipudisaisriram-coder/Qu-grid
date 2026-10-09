import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import IntroGate from './components/IntroVideo';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <IntroGate>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </IntroGate>
  </React.StrictMode>,
);
