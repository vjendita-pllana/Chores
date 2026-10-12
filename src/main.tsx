import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { isNetworkError } from './lib/format'
import { registerServiceWorker } from './lib/push'
import './index.css'

// Retry dropped connections (common on iOS right after the app was backgrounded
// or a system prompt interrupted it). Other errors fail straight away.

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: (n, e) => n < (isNetworkError(e) ? 3 : 1) },
    mutations: { retry: (n, e) => n < 3 && isNetworkError(e), retryDelay: (n) => 400 * 2 ** n },
  },
})

registerServiceWorker().catch((e) => console.error('SW registration failed', e))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
