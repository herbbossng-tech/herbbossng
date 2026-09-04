import { Route, Routes } from 'react-router-dom'

import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { AppLayout } from '@/components/layout/AppLayout'
import { allNavItems } from '@/data/navigation'
import { AdCostsPage } from '@/features/adCosts/pages/AdCostsPage'
import { ApprovalRulesPage } from '@/features/approvalRules/pages/ApprovalRulesPage'
import { AssignmentRulesPage } from '@/features/assignmentRules/pages/AssignmentRulesPage'
import { AffiliateDetailPage } from '@/features/affiliates/pages/AffiliateDetailPage'
import { AffiliatesPage } from '@/features/affiliates/pages/AffiliatesPage'
import { AffiliatesLayout } from '@/features/affiliates/AffiliatesLayout'
import { CampaignDetailPage } from '@/features/campaigns/pages/CampaignDetailPage'
import { CampaignFormPage } from '@/features/campaigns/pages/CampaignFormPage'
import { CampaignsPage } from '@/features/campaigns/pages/CampaignsPage'
import { WalletsPage } from '@/features/wallets/pages/WalletsPage'
import { WithdrawalsPage } from '@/features/withdrawals/pages/WithdrawalsPage'
import { AutomationLayout } from '@/features/automation/AutomationLayout'
import { AutomationEventsPage } from '@/features/automation/pages/AutomationEventsPage'
import { AutomationExecutionsPage } from '@/features/automation/pages/AutomationExecutionsPage'
import { AutomationRulesPage } from '@/features/automation/pages/AutomationRulesPage'
import { FailedAutomationsPage } from '@/features/automation/pages/FailedAutomationsPage'
import { DeliveryPartnersPage } from '@/features/deliveryPartners/pages/DeliveryPartnersPage'
import { OperationsLayout } from '@/features/operations/OperationsLayout'
import { OperationsDashboardPage } from '@/features/operations/pages/OperationsDashboardPage'
import { RescueBoardPage } from '@/features/operations/pages/RescueBoardPage'
import { SettlementPage } from '@/features/settlement/pages/SettlementPage'
import { SupportPage } from '@/features/support/pages/SupportPage'
import { TaskManagerPage } from '@/features/tasks/pages/TaskManagerPage'
import { WaybillsPage } from '@/features/waybills/pages/WaybillsPage'
import { CategoriesPage } from '@/features/categories/pages/CategoriesPage'
import { CreateCustomerPage } from '@/features/customers/pages/CreateCustomerPage'
import { CustomerDetailPage } from '@/features/customers/pages/CustomerDetailPage'
import { CustomersPage } from '@/features/customers/pages/CustomersPage'
import { AnalyticsPage } from '@/features/analytics/pages/AnalyticsPage'
import { AuditLogsPage } from '@/features/auditLogs/pages/AuditLogsPage'
import { BrandDetailPage } from '@/features/brands/pages/BrandDetailPage'
import { BrandsPage } from '@/features/brands/pages/BrandsPage'
import { FinancePage } from '@/features/finance/pages/FinancePage'
import { InventoryPage } from '@/features/inventory/pages/InventoryPage'
import { NotificationsPage } from '@/features/notifications/pages/NotificationsPage'
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
import { ReportsPage } from '@/features/reports/pages/ReportsPage'
import { RoleDetailPage } from '@/features/roles/pages/RoleDetailPage'
import { RolesPage } from '@/features/roles/pages/RolesPage'
import { SettingsPage } from '@/features/settings/pages/SettingsPage'
import { StaffDetailPage } from '@/features/staff/pages/StaffDetailPage'
import { StaffPage } from '@/features/staff/pages/StaffPage'
import { WorkspaceSettingsPage } from '@/features/workspace/pages/WorkspaceSettingsPage'
import { ForgotPassword } from '@/pages/auth/ForgotPassword'
import { Login } from '@/pages/auth/Login'
import { ResetPassword } from '@/pages/auth/ResetPassword'
import { Unauthorized } from '@/pages/auth/Unauthorized'
import { Dashboard } from '@/pages/Dashboard'
import { AcceptInvitationPage } from '@/pages/invitations/AcceptInvitationPage'
import { PlaceholderPage } from '@/pages/PlaceholderPage'

const placeholderNavItems = allNavItems.filter(
  (item) =>
    item.href !== '/' &&
    item.href !== '/products' &&
    item.href !== '/orders' &&
    item.href !== '/customers' &&
    item.href !== '/landing-pages' &&
    item.href !== '/finance' &&
    item.href !== '/analytics' &&
    item.href !== '/reports' &&
    item.href !== '/staff' &&
    item.href !== '/roles' &&
    item.href !== '/workspace' &&
    item.href !== '/brands' &&
    item.href !== '/notifications' &&
    item.href !== '/audit-logs' &&
    item.href !== '/affiliates' &&
    item.href !== '/operations' &&
    item.href !== '/automation' &&
    item.href !== '/support' &&
    item.href !== '/settings',
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
        {/* Deliberately outside AppLayout: a user accepting their first
            invitation to any workspace has zero workspace access yet, so
            AppLayout's own gating would show "No workspace access" before
            they ever get a chance to redeem the token. */}
        <Route path="/invitations/accept" element={<AcceptInvitationPage />} />

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

          <Route path="finance" element={<FinancePage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="reports" element={<ReportsPage />} />

          <Route path="staff">
            <Route index element={<StaffPage />} />
            <Route path=":id" element={<StaffDetailPage />} />
          </Route>

          <Route path="roles">
            <Route index element={<RolesPage />} />
            <Route path=":id" element={<RoleDetailPage />} />
          </Route>

          <Route path="workspace" element={<WorkspaceSettingsPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="audit-logs" element={<AuditLogsPage />} />

          <Route path="settings">
            <Route index element={<SettingsPage />} />
            <Route path="assignment-rules" element={<AssignmentRulesPage />} />
            <Route path="approval-rules" element={<ApprovalRulesPage />} />
          </Route>

          <Route path="brands">
            <Route index element={<BrandsPage />} />
            <Route path=":id" element={<BrandDetailPage />} />
          </Route>

          <Route path="affiliates">
            <Route path="campaigns/new" element={<CampaignFormPage />} />
            <Route path="campaigns/:id" element={<CampaignDetailPage />} />
            <Route element={<AffiliatesLayout />}>
              <Route index element={<AffiliatesPage />} />
              <Route path="campaigns" element={<CampaignsPage />} />
              <Route path="credits" element={<WalletsPage />} />
              <Route path="withdrawals" element={<WithdrawalsPage />} />
              <Route path="ad-costs" element={<AdCostsPage />} />
            </Route>
            <Route path=":id" element={<AffiliateDetailPage />} />
          </Route>

          <Route path="operations">
            <Route element={<OperationsLayout />}>
              <Route index element={<OperationsDashboardPage />} />
              <Route path="rescue-board" element={<RescueBoardPage />} />
              <Route path="tasks" element={<TaskManagerPage />} />
              <Route path="waybills" element={<WaybillsPage />} />
              <Route path="delivery-partners" element={<DeliveryPartnersPage />} />
              <Route path="settlement" element={<SettlementPage />} />
            </Route>
          </Route>

          <Route path="automation">
            <Route element={<AutomationLayout />}>
              <Route index element={<AutomationRulesPage />} />
              <Route path="events" element={<AutomationEventsPage />} />
              <Route path="executions" element={<AutomationExecutionsPage />} />
              <Route path="failed" element={<FailedAutomationsPage />} />
            </Route>
          </Route>

          <Route path="support" element={<SupportPage />} />

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
