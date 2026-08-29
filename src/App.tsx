import { Route, Routes } from 'react-router-dom'

import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { AppLayout } from '@/components/layout/AppLayout'
import { allNavItems } from '@/data/navigation'
import { CategoriesPage } from '@/features/categories/pages/CategoriesPage'
import { InventoryPage } from '@/features/inventory/pages/InventoryPage'
import { ProductCreatePage } from '@/features/products/pages/ProductCreatePage'
import { ProductEditPage } from '@/features/products/pages/ProductEditPage'
import { ProductsListPage } from '@/features/products/pages/ProductsListPage'
import { ProductSettingsPage } from '@/features/products/pages/ProductSettingsPage'
import { ProductsLayout } from '@/features/products/ProductsLayout'
import { ForgotPassword } from '@/pages/auth/ForgotPassword'
import { Login } from '@/pages/auth/Login'
import { ResetPassword } from '@/pages/auth/ResetPassword'
import { Unauthorized } from '@/pages/auth/Unauthorized'
import { Dashboard } from '@/pages/Dashboard'
import { PlaceholderPage } from '@/pages/PlaceholderPage'

const placeholderNavItems = allNavItems.filter((item) => item.href !== '/' && item.href !== '/products')

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

          <Route path="products">
            <Route element={<ProductsLayout />}>
              <Route index element={<ProductsListPage />} />
              <Route path="categories" element={<CategoriesPage />} />
              <Route path="inventory" element={<InventoryPage />} />
              <Route path="settings" element={<ProductSettingsPage />} />
            </Route>
            <Route path="new" element={<ProductCreatePage />} />
            <Route path=":id/edit" element={<ProductEditPage />} />
          </Route>

          {placeholderNavItems.map((item) => (
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
