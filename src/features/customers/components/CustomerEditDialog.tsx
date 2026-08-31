import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { CustomerForm } from '@/features/customers/components/CustomerForm'
import { useUpdateCustomer } from '@/features/customers/hooks'
import type { CustomerFormOutput } from '@/features/customers/validation'
import type { Customer } from '@/types/database'

interface CustomerEditDialogProps {
  customer: Customer
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CustomerEditDialog({ customer, open, onOpenChange }: CustomerEditDialogProps) {
  const updateCustomer = useUpdateCustomer(customer.id)

  const defaultValues: CustomerFormOutput = {
    fullName: customer.full_name,
    phone: customer.phone,
    alternatePhone: customer.alternate_phone ?? '',
    email: customer.email ?? '',
    state: customer.state ?? '',
    city: customer.city ?? '',
    address: customer.address ?? '',
    addressLine2: customer.address_2 ?? '',
    landmark: customer.landmark ?? '',
    postalCode: customer.postal_code ?? '',
  }

  async function submit(values: CustomerFormOutput) {
    // Deliberately omit `phone` — it's disabled in this form (see
    // CustomerForm's phoneEditable prop) and must never be written here.
    await updateCustomer.mutateAsync({
      full_name: values.fullName,
      alternate_phone: values.alternatePhone || null,
      email: values.email || null,
      state: values.state || null,
      city: values.city || null,
      address: values.address || null,
      address_2: values.addressLine2 || null,
      landmark: values.landmark || null,
      postal_code: values.postalCode || null,
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit customer</DialogTitle>
        </DialogHeader>
        <div className="px-6 pb-6">
          <CustomerForm
            defaultValues={defaultValues}
            isSubmitting={updateCustomer.isPending}
            submitError={updateCustomer.isError ? ((updateCustomer.error as Error)?.message ?? 'Could not save changes.') : null}
            submitLabel="Save changes"
            phoneEditable={false}
            onSubmit={submit}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
