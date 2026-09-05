import * as React from 'react'
import { Route, Routes } from 'react-router-dom'

import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { AppLayout } from '@/components/layout/AppLayout'
import { LoadingState } from '@/components/ui/state'
import { allNavItems } from '@/data/navigation'
import { ForgotPassword } from '@/pages/auth/ForgotPassword'
import { Login } from '@/pages/auth/Login'
import { ResetPassword } from '@/pages/auth/ResetPassword'
import { Unauthorized } from '@/pages/auth/Unauthorized'
import { Dashboard } from '@/pages/Dashboard'
import { PlaceholderPage } from '@/pages/PlaceholderPage'

// Everything below is route-level code-split (React.lazy): each of
// these modules only downloads when a user actually navigates to it,
// instead of all going into the single ~2MB main bundle. Auth pages
// and the Dashboard (the landing route almost every session hits
// immediately) stay eager above — splitting those would only add a
// network round-trip with no benefit. See vite's own build-time
// "chunk larger than 500kB" warning for the evidence this addresses.
const AcceptInvitationPage = React.lazy(() => import('@/pages/invitations/AcceptInvitationPage').then((m) => ({ default: m.AcceptInvitationPage })))
const PublicLandingPage = React.lazy(() => import('@/features/landingPages/public/PublicLandingPage').then((m) => ({ default: m.PublicLandingPage })))
const ThankYouPage = React.lazy(() => import('@/features/landingPages/public/ThankYouPage').then((m) => ({ default: m.ThankYouPage })))

const ProductsLayout = React.lazy(() => import('@/features/products/ProductsLayout').then((m) => ({ default: m.ProductsLayout })))
const ProductsListPage = React.lazy(() => import('@/features/products/pages/ProductsListPage').then((m) => ({ default: m.ProductsListPage })))
const CategoriesPage = React.lazy(() => import('@/features/categories/pages/CategoriesPage').then((m) => ({ default: m.CategoriesPage })))
const InventoryPage = React.lazy(() => import('@/features/inventory/pages/InventoryPage').then((m) => ({ default: m.InventoryPage })))
const ProductSettingsPage = React.lazy(() => import('@/features/products/pages/ProductSettingsPage').then((m) => ({ default: m.ProductSettingsPage })))
const ProductCreatePage = React.lazy(() => import('@/features/products/pages/ProductCreatePage').then((m) => ({ default: m.ProductCreatePage })))
const ProductEditPage = React.lazy(() => import('@/features/products/pages/ProductEditPage').then((m) => ({ default: m.ProductEditPage })))

const OrdersPage = React.lazy(() => import('@/features/orders/pages/OrdersPage').then((m) => ({ default: m.OrdersPage })))
const CreateOrderPage = React.lazy(() => import('@/features/orders/pages/CreateOrderPage').then((m) => ({ default: m.CreateOrderPage })))
const OrderDetailPage = React.lazy(() => import('@/features/orders/pages/OrderDetailPage').then((m) => ({ default: m.OrderDetailPage })))

const CustomersPage = React.lazy(() => import('@/features/customers/pages/CustomersPage').then((m) => ({ default: m.CustomersPage })))
const CreateCustomerPage = React.lazy(() => import('@/features/customers/pages/CreateCustomerPage').then((m) => ({ default: m.CreateCustomerPage })))
const CustomerDetailPage = React.lazy(() => import('@/features/customers/pages/CustomerDetailPage').then((m) => ({ default: m.CustomerDetailPage })))

const LandingPagesPage = React.lazy(() => import('@/features/landingPages/pages/LandingPagesPage').then((m) => ({ default: m.LandingPagesPage })))
const TemplateGalleryPage = React.lazy(() => import('@/features/landingPages/pages/TemplateGalleryPage').then((m) => ({ default: m.TemplateGalleryPage })))
const CreateLandingPagePage = React.lazy(() => import('@/features/landingPages/pages/CreateLandingPagePage').then((m) => ({ default: m.CreateLandingPagePage })))
const LandingPageEditorPage = React.lazy(() => import('@/features/landingPages/pages/LandingPageEditorPage').then((m) => ({ default: m.LandingPageEditorPage })))
const LandingPagePreviewPage = React.lazy(() => import('@/features/landingPages/pages/LandingPagePreviewPage').then((m) => ({ default: m.LandingPagePreviewPage })))

const FinancePage = React.lazy(() => import('@/features/finance/pages/FinancePage').then((m) => ({ default: m.FinancePage })))
const AnalyticsPage = React.lazy(() => import('@/features/analytics/pages/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage })))
const ReportsPage = React.lazy(() => import('@/features/reports/pages/ReportsPage').then((m) => ({ default: m.ReportsPage })))

const StaffPage = React.lazy(() => import('@/features/staff/pages/StaffPage').then((m) => ({ default: m.StaffPage })))
const StaffDetailPage = React.lazy(() => import('@/features/staff/pages/StaffDetailPage').then((m) => ({ default: m.StaffDetailPage })))
const RolesPage = React.lazy(() => import('@/features/roles/pages/RolesPage').then((m) => ({ default: m.RolesPage })))
const RoleDetailPage = React.lazy(() => import('@/features/roles/pages/RoleDetailPage').then((m) => ({ default: m.RoleDetailPage })))

const WorkspaceSettingsPage = React.lazy(() => import('@/features/workspace/pages/WorkspaceSettingsPage').then((m) => ({ default: m.WorkspaceSettingsPage })))
const NotificationsPage = React.lazy(() => import('@/features/notifications/pages/NotificationsPage').then((m) => ({ default: m.NotificationsPage })))
const AuditLogsPage = React.lazy(() => import('@/features/auditLogs/pages/AuditLogsPage').then((m) => ({ default: m.AuditLogsPage })))

const SettingsPage = React.lazy(() => import('@/features/settings/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })))
const AssignmentRulesPage = React.lazy(() => import('@/features/assignmentRules/pages/AssignmentRulesPage').then((m) => ({ default: m.AssignmentRulesPage })))
const ApprovalRulesPage = React.lazy(() => import('@/features/approvalRules/pages/ApprovalRulesPage').then((m) => ({ default: m.ApprovalRulesPage })))
const IntegrationHealthPage = React.lazy(() => import('@/features/integrations/pages/IntegrationHealthPage').then((m) => ({ default: m.IntegrationHealthPage })))
const CommunicationTemplatesPage = React.lazy(() => import('@/features/communications/pages/CommunicationTemplatesPage').then((m) => ({ default: m.CommunicationTemplatesPage })))

const BrandsPage = React.lazy(() => import('@/features/brands/pages/BrandsPage').then((m) => ({ default: m.BrandsPage })))
const BrandDetailPage = React.lazy(() => import('@/features/brands/pages/BrandDetailPage').then((m) => ({ default: m.BrandDetailPage })))

const AffiliatesLayout = React.lazy(() => import('@/features/affiliates/AffiliatesLayout').then((m) => ({ default: m.AffiliatesLayout })))
const AffiliatesPage = React.lazy(() => import('@/features/affiliates/pages/AffiliatesPage').then((m) => ({ default: m.AffiliatesPage })))
const AffiliateDetailPage = React.lazy(() => import('@/features/affiliates/pages/AffiliateDetailPage').then((m) => ({ default: m.AffiliateDetailPage })))
const CampaignsPage = React.lazy(() => import('@/features/campaigns/pages/CampaignsPage').then((m) => ({ default: m.CampaignsPage })))
const CampaignFormPage = React.lazy(() => import('@/features/campaigns/pages/CampaignFormPage').then((m) => ({ default: m.CampaignFormPage })))
const CampaignDetailPage = React.lazy(() => import('@/features/campaigns/pages/CampaignDetailPage').then((m) => ({ default: m.CampaignDetailPage })))
const WalletsPage = React.lazy(() => import('@/features/wallets/pages/WalletsPage').then((m) => ({ default: m.WalletsPage })))
const WithdrawalsPage = React.lazy(() => import('@/features/withdrawals/pages/WithdrawalsPage').then((m) => ({ default: m.WithdrawalsPage })))
const AdCostsPage = React.lazy(() => import('@/features/adCosts/pages/AdCostsPage').then((m) => ({ default: m.AdCostsPage })))

const OperationsLayout = React.lazy(() => import('@/features/operations/OperationsLayout').then((m) => ({ default: m.OperationsLayout })))
const OperationsDashboardPage = React.lazy(() => import('@/features/operations/pages/OperationsDashboardPage').then((m) => ({ default: m.OperationsDashboardPage })))
const RescueBoardPage = React.lazy(() => import('@/features/operations/pages/RescueBoardPage').then((m) => ({ default: m.RescueBoardPage })))
const TaskManagerPage = React.lazy(() => import('@/features/tasks/pages/TaskManagerPage').then((m) => ({ default: m.TaskManagerPage })))
const WaybillsPage = React.lazy(() => import('@/features/waybills/pages/WaybillsPage').then((m) => ({ default: m.WaybillsPage })))
const DeliveryPartnersPage = React.lazy(() => import('@/features/deliveryPartners/pages/DeliveryPartnersPage').then((m) => ({ default: m.DeliveryPartnersPage })))
const SettlementPage = React.lazy(() => import('@/features/settlement/pages/SettlementPage').then((m) => ({ default: m.SettlementPage })))

const AutomationLayout = React.lazy(() => import('@/features/automation/AutomationLayout').then((m) => ({ default: m.AutomationLayout })))
const AutomationRulesPage = React.lazy(() => import('@/features/automation/pages/AutomationRulesPage').then((m) => ({ default: m.AutomationRulesPage })))
const AutomationEventsPage = React.lazy(() => import('@/features/automation/pages/AutomationEventsPage').then((m) => ({ default: m.AutomationEventsPage })))
const AutomationExecutionsPage = React.lazy(() => import('@/features/automation/pages/AutomationExecutionsPage').then((m) => ({ default: m.AutomationExecutionsPage })))
const FailedAutomationsPage = React.lazy(() => import('@/features/automation/pages/FailedAutomationsPage').then((m) => ({ default: m.FailedAutomationsPage })))

const SupportPage = React.lazy(() => import('@/features/support/pages/SupportPage').then((m) => ({ default: m.SupportPage })))

const MarketingLayout = React.lazy(() => import('@/features/marketing/MarketingLayout').then((m) => ({ default: m.MarketingLayout })))
const MarketingOverviewPage = React.lazy(() => import('@/features/marketing/pages/MarketingOverviewPage').then((m) => ({ default: m.MarketingOverviewPage })))
const MarketingCampaignsPage = React.lazy(() => import('@/features/marketing/pages/MarketingCampaignsPage').then((m) => ({ default: m.MarketingCampaignsPage })))
const MarketingCampaignDetailPage = React.lazy(() => import('@/features/marketing/pages/MarketingCampaignDetailPage').then((m) => ({ default: m.MarketingCampaignDetailPage })))
const MarketingChannelsPage = React.lazy(() => import('@/features/marketing/pages/MarketingChannelsPage').then((m) => ({ default: m.MarketingChannelsPage })))
const MarketingLandingPagesPage = React.lazy(() => import('@/features/marketing/pages/MarketingLandingPagesPage').then((m) => ({ default: m.MarketingLandingPagesPage })))
const MarketingProductsPage = React.lazy(() => import('@/features/marketing/pages/MarketingProductsPage').then((m) => ({ default: m.MarketingProductsPage })))
const MarketingMediaBuyersPage = React.lazy(() => import('@/features/marketing/pages/MarketingMediaBuyersPage').then((m) => ({ default: m.MarketingMediaBuyersPage })))
const MarketingBudgetPage = React.lazy(() => import('@/features/marketing/pages/MarketingBudgetPage').then((m) => ({ default: m.MarketingBudgetPage })))

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
    item.href !== '/marketing' &&
    item.href !== '/settings',
)

function App() {
  return (
    <React.Suspense fallback={<LoadingState label="Loading…" />}>
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
              <Route path="templates" element={<TemplateGalleryPage />} />
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
              <Route path="integrations" element={<IntegrationHealthPage />} />
              <Route path="communications/templates" element={<CommunicationTemplatesPage />} />
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

            <Route path="marketing">
              <Route path="campaigns/:id" element={<MarketingCampaignDetailPage />} />
              <Route element={<MarketingLayout />}>
                <Route index element={<MarketingOverviewPage />} />
                <Route path="campaigns" element={<MarketingCampaignsPage />} />
                <Route path="channels" element={<MarketingChannelsPage />} />
                <Route path="landing-pages" element={<MarketingLandingPagesPage />} />
                <Route path="products" element={<MarketingProductsPage />} />
                <Route path="media-buyers" element={<MarketingMediaBuyersPage />} />
                <Route path="budget" element={<MarketingBudgetPage />} />
              </Route>
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
    </React.Suspense>
  )
}

export default App
