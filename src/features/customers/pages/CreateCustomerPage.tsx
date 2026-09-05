import { ChevronLeft } from 'lucide-react'
import * as React from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CustomerForm } from '@/features/customers/components/CustomerForm'
import { useCreateCustomer } from '@/features/customers/hooks'
import type { CustomerFormOutput } from '@/features/customers/validation'

const emptyCustomerForm: CustomerFormOutput = {
  fullName: '',
  phone: '',
  alternatePhone: '',
  email: '',
  state: '',
  city: '',
  address: '',
  addressLine2: '',
  landmark: '',
  postalCode: '',
}

const DUPLICATE_PHONE_PREFIX = 'customer_phone_exists:'

export function CreateCustomerPage() {
  const navigate = useNavigate()
  const createCustomer = useCreateCustomer()
  const [duplicateCustomerId, setDuplicateCustomerId] = React.useState<string | null>(null)
  const [genericError, setGenericError] = React.useState<string | null>(null)

  async function submit(values: CustomerFormOutput) {
    setDuplicateCustomerId(null)
    setGenericError(null)
    try {
      const customer = await createCustomer.mutateAsync(values)
      navigate(`/customers/${customer.id}`, { replace: true })
    } catch (err) {
      const message = (err as Error)?.message ?? ''
      if (message.includes(DUPLICATE_PHONE_PREFIX)) {
        setDuplicateCustomerId(message.split(DUPLICATE_PHONE_PREFIX)[1]?.trim() ?? null)
      } else {
        setGenericError(message || 'Could not create customer. Please try again.')
      }
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link to="/customers" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" />
          Back to Customers
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Add Customer</h1>
        <p className="mt-1 text-sm text-muted-foreground">Create a customer record manually.</p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="text-base">Customer Details</CardTitle>
        </CardHeader>
        <CardContent>
          {duplicateCustomerId && (
            <div className="mb-4 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
              <p className="font-medium text-foreground">A customer with this phone number already exists.</p>
              <Link to={`/customers/${duplicateCustomerId}`} className="text-primary hover:underline">
                View existing customer →
              </Link>
            </div>
          )}
          <CustomerForm
            defaultValues={emptyCustomerForm}
            isSubmitting={createCustomer.isPending}
            submitError={genericError}
            submitLabel="Create Customer"
            onSubmit={submit}
          />
        </CardContent>
      </Card>
    </div>
  )
}
