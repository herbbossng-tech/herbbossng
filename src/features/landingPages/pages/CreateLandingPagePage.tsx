import { zodResolver } from '@hookform/resolvers/zod'
import { ChevronLeft, Loader2 } from 'lucide-react'
import * as React from 'react'
import { Controller, useForm } from 'react-hook-form'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCreateLandingPage, useLandingPageTemplates } from '@/features/landingPages/hooks'
import { pageTypeLabels } from '@/features/landingPages/statusMeta'
import { type LandingPageFormInput, type LandingPageFormOutput, landingPageFormSchema } from '@/features/landingPages/validation'
import { useProducts } from '@/features/products/hooks'
import { useCountries } from '@/features/workspace/hooks'

const defaultValues: LandingPageFormOutput = {
  name: '',
  productId: '',
  slug: '',
  pageType: 'product_sales',
  templateId: '',
  marketCountryCode: '',
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function CreateLandingPagePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const preselectedTemplateId = searchParams.get('template') ?? ''
  const createPage = useCreateLandingPage()
  const { data: products } = useProducts({ status: 'active' })
  const { data: templates } = useLandingPageTemplates()
  const { data: countries } = useCountries()
  const [slugEdited, setSlugEdited] = React.useState(false)

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors },
  } = useForm<LandingPageFormInput, unknown, LandingPageFormOutput>({
    resolver: zodResolver(landingPageFormSchema),
    defaultValues: { ...defaultValues, templateId: preselectedTemplateId },
  })

  const name = watch('name')
  const templateId = watch('templateId')
  React.useEffect(() => {
    if (!slugEdited) setValue('slug', slugify(name))
  }, [name, slugEdited, setValue])

  const selectedTemplate = React.useMemo(() => (templates ?? []).find((t) => t.id === templateId), [templates, templateId])

  async function submit(values: LandingPageFormOutput) {
    const page = await createPage.mutateAsync({ input: values, template: selectedTemplate })
    navigate(`/landing-pages/${page.id}/edit`, { replace: true })
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link to="/landing-pages" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" />
          Back to Landing Pages
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Create Landing Page</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Start from a template — you can fully customize sections, packages, and content after creating it.{' '}
          <Link to="/landing-pages/templates" className="text-primary hover:underline">
            Browse the template gallery
          </Link>
          .
        </p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="text-base">Page Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Page name</Label>
              <Input id="name" placeholder="e.g. Ginseng Five Treasures Tea — Kenya" {...register('name')} aria-invalid={!!errors.name} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="slug">URL slug</Label>
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <span className="shrink-0">/l/</span>
                <Input
                  id="slug"
                  {...register('slug', {
                    onChange: () => setSlugEdited(true),
                  })}
                  aria-invalid={!!errors.slug}
                />
              </div>
              {errors.slug && <p className="text-xs text-destructive">{errors.slug.message}</p>}
              <p className="text-xs text-muted-foreground">Must be globally unique — this becomes the public page URL.</p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Product</Label>
              <Controller
                control={control}
                name="productId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger aria-invalid={!!errors.productId}>
                      <SelectValue placeholder="Select the product this page sells" />
                    </SelectTrigger>
                    <SelectContent>
                      {(products ?? []).map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.productId && <p className="text-xs text-destructive">{errors.productId.message}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Market</Label>
              <Controller
                control={control}
                name="marketCountryCode"
                render={({ field }) => (
                  <Select value={field.value || '__workspace_default__'} onValueChange={(v) => field.onChange(v === '__workspace_default__' ? '' : v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__workspace_default__">Workspace default</SelectItem>
                      {(countries ?? []).map((c) => (
                        <SelectItem key={c.code} value={c.code}>
                          {c.name} ({c.currency_code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <p className="text-xs text-muted-foreground">
                Sets the page's own currency, phone-number format, and delivery rules — one product can have a different page per market (e.g. Kenya,
                Nigeria, Ghana), each independently priced.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Template</Label>
              <Controller
                control={control}
                name="templateId"
                render={({ field }) => (
                  <Select value={field.value || '__legacy__'} onValueChange={(v) => field.onChange(v === '__legacy__' ? '' : v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__legacy__">Blank ({pageTypeLabels.product_sales} starter)</SelectItem>
                      {(templates ?? []).map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                          {!t.is_system ? ' (custom)' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {selectedTemplate?.description && <p className="text-xs text-muted-foreground">{selectedTemplate.description}</p>}
              {!selectedTemplate && (
                <div className="flex flex-col gap-1.5 pt-1">
                  <Label className="text-xs text-muted-foreground">Legacy starter type</Label>
                  <Controller
                    control={control}
                    name="pageType"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="product_sales">{pageTypeLabels.product_sales}</SelectItem>
                          <SelectItem value="direct_response">{pageTypeLabels.direct_response}</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
              )}
              <p className="text-xs text-muted-foreground">Just a starting point — sections can be added, removed, and reordered afterward.</p>
            </div>

            {createPage.isError && (
              <p className="text-xs text-destructive">{(createPage.error as Error)?.message ?? 'Could not create the page. Please try again.'}</p>
            )}

            <div className="flex justify-end pt-2">
              <Button type="submit" disabled={createPage.isPending}>
                {createPage.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Create Draft
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
