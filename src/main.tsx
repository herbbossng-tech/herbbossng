import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import App from './App.tsx'
import { AffiliateAuthProvider } from './contexts/AffiliateAuthContext'
import { AuthProvider } from './contexts/AuthContext'
import { PermissionsProvider } from './contexts/PermissionsContext'
import { WorkspaceProvider } from './contexts/WorkspaceContext'
import './index.css'

const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          {/* Independent of AuthProvider — a separate Supabase client/session
              (see lib/supabaseAffiliate.ts) for the affiliate portal, which
              WorkspaceProvider/PermissionsProvider below never read from. */}
          <AffiliateAuthProvider>
            <WorkspaceProvider>
              <PermissionsProvider>
                <App />
              </PermissionsProvider>
            </WorkspaceProvider>
          </AffiliateAuthProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
