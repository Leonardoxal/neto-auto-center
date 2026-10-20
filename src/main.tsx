import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { StoreProvider } from './lib/store'
import { SheetProvider } from './ui/ui'
import './styles.css'

registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <SheetProvider>
        <App />
      </SheetProvider>
    </StoreProvider>
  </StrictMode>,
)
