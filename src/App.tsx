import { Route, Routes } from 'react-router-dom'

import { AppLayout } from '@/components/layout/AppLayout'
import { primaryNav, secondaryNav } from '@/data/navigation'
import { Dashboard } from '@/pages/Dashboard'
import { PlaceholderPage } from '@/pages/PlaceholderPage'

const otherNavItems = [...primaryNav, ...secondaryNav].filter((item) => item.href !== '/')

function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Dashboard />} />
        {otherNavItems.map((item) => (
          <Route
            key={item.href}
            path={item.href}
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
    </Routes>
  )
}

export default App
