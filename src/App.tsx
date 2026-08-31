import { Route, Routes } from 'react-router-dom'

import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { AppLayout } from '@/components/layout/AppLayout'
import { allNavItems } from '@/data/navigation'
import { CategoriesPage } from '@/features/categories/pages/CategoriesPage'
import { CreateCustomerPage } from '@/features/customers/pages/CreateCustomerPage'
import { CustomerDetailPage } from '@/features/customers/pages/CustomerDetailPage'
import { CustomersPage } from '@/features/customers/pages/CustomersPage'
import { InventoryPage } from '@/features/inventory/pages/InventoryPage'
import { CreateLandingPagePage } from '@/features/landingPages/pages/CreateLandingPagePage'
import { LandingPageEditorPage } from '@/features/landingPages/pages/LandingPageEditorPage'
import { LandingPagePreviewPage } from '@/features/landingPages/pages/LandingPagePreviewPage'
import { LandingPagesPage } from '@/features/landingPages/pages/LandingPagesPage'
import { PublicLandingPage } from '@/features/landingPages/public/PublicLandingPage'
import { ThankYouPage } from '@/features/landingPages/public/ThankYouPage'
import { CreateOrderPage } from '@/features/orders/pages/CreateOrderPage'
import { OrderDetailPage } from '@/features/orders/pages/OrderDetailPage'
import { OrdersPage } from '@/features/orders/pages/OrdersPage'
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

const placeholderNavItems = allNavItems.filter(
  (item) =>
    item.href !== '/' &&
    item.href !== '/products' &&
    item.href !== '/orders' &&
    item.href !== '/customers' &&
    item.href !== '/landing-pages',
)

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/unauthorized" element={<Unauthorized />} />

      {/* Public, anon-accessible funnel routes — deliberately outside
          ProtectedRoute/AppLayout. The public renderer is a separate
          concern from the admin shell (no sidebar/topbar/auth). */}
      <Route path="/l/:slug" element={<PublicLandingPage />} />
      <Route path="/l/:slug/thank-you" element={<ThankYouPage />} />

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

          <Route path="orders">
            <Route index element={<OrdersPage />} />
            <Route path="new" element={<CreateOrderPage />} />
            <Route path=":id" element={<OrderDetailPage />} />
          </Route>

          <Route path="customers">
            <Route index element={<CustomersPage />} />
            <Route path="new" element={<CreateCustomerPage />} />
            <Route path=":id" element={<CustomerDetailPage />} />
          </Route>

          <Route path="landing-pages">
            <Route index element={<LandingPagesPage />} />
            <Route path="new" element={<CreateLandingPagePage />} />
            <Route path=":id/edit" element={<LandingPageEditorPage />} />
            <Route path=":id/preview" element={<LandingPagePreviewPage />} />
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
