import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { DeckProvider } from './state/DeckContext.jsx'
import { ToastProvider } from './state/ToastContext.jsx'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <DeckProvider>
          <App />
        </DeckProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
