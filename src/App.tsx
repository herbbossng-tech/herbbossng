import { Route, Routes } from 'react-router-dom'

import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { AppLayout } from '@/components/layout/AppLayout'
import { allNavItems } from '@/data/navigation'
import { ForgotPassword } from '@/pages/auth/ForgotPassword'
import { Login } from '@/pages/auth/Login'
import { ResetPassword } from '@/pages/auth/ResetPassword'
import { Unauthorized } from '@/pages/auth/Unauthorized'
import { Dashboard } from '@/pages/Dashboard'
import { PlaceholderPage } from '@/pages/PlaceholderPage'

const otherNavItems = allNavItems.filter((item) => item.href !== '/')

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/unauthorized" element={<Unauthorized />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route index element={<Dashboard />} />
          {otherNavItems.map((item) => (
            <Route
              key={item.href}
              path={item.href.slice(1)}
              element={
                <PlaceholderPage
                  title={item.label}
                  description={`The ${item.label} module is being wired up next.`}
                  icon={item.icon}
                />
              }
            />
          ))}
        </Route>
      </Route>
    </Routes>
  )
}

export default App
