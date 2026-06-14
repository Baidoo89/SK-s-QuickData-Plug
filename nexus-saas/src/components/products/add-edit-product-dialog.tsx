"use client"

import { useState, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { useRouter } from "next/navigation"
import { Plus, Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/use-toast"

export interface Product {
  id?: string
  name: string
  description?: string
  price: number
  basePrice?: number
  storefrontPrice?: number
  stock?: number
  provider: string
  bundleType: string
  category: string
  serviceForm?: string | null
}



interface AddEditProductDialogProps {
  open: boolean
  setOpen: (open: boolean) => void
  initialData?: Product | null
  mode: "add" | "edit"
}

export function AddEditProductDialog({ open, setOpen, initialData, mode }: AddEditProductDialogProps) {
// ...existing code inside AddEditProductDialog only...

  const router = useRouter()
  const { toast } = useToast()
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab") || "bundle_mtn";
  let providerOption = "MTN";
  let isBundleSection = true;
  if (tabParam === "bundle_airteltigo") providerOption = "AIRTELTIGO";
  else if (tabParam === "bundle_telecel") providerOption = "TELECEL";
  else if (tabParam === "legal_documents" || tabParam === "education" || tabParam === "afa_minutes") isBundleSection = false;
  const [isLoading, setIsLoading] = useState(false)
  const [form, setForm] = useState<Product>({
    name: "",
    description: "",
    price: 0,
    basePrice: 0,
    stock: 10000,
    provider: providerOption,
    bundleType: "DATA",
    category: "DATA_BUNDLE",
  })

  useEffect(() => {
    if (initialData) {
      setForm({
        ...initialData,
        basePrice: initialData.basePrice ?? initialData.price ?? 0,
        price: initialData.price ?? initialData.basePrice ?? 0,
        storefrontPrice: initialData.storefrontPrice ?? initialData.price ?? 0,
      })
    } else {
      setForm({
        name: "",
        description: "",
        price: 0,
        stock: 10000,
        provider: providerOption,
        bundleType: "DATA",
        category: "DATA_BUNDLE",
        basePrice: 0,
        storefrontPrice: 0,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialData, open, tabParam])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setForm((prev) => ({
      ...prev,
      [name]: ["price", "basePrice", "storefrontPrice"].includes(name) ? parseFloat(value) : value
    }))
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsLoading(true)
    try {
      const response = await fetch(`/api/products${mode === "edit" && form.id ? "/" + form.id : ""}`, {
        method: mode === "edit" ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      if (!response.ok) throw new Error("Failed to save product")
      toast({
        title: "Success",
        description: mode === "edit" ? "Product updated successfully" : "Product created successfully",
      })
      setOpen(false)
      router.refresh()
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Something went wrong",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const isDataBundleForm = isBundleSection && (mode === "add" || form.category === "DATA_BUNDLE")

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{mode === "edit" ? "Edit Product" : isDataBundleForm ? "Add Bundle" : "Add Product"}</DialogTitle>
            <DialogDescription>
              {mode === "edit" ? "Update product details." : "Create a new catalog item for your organization."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2 sm:grid-cols-4 sm:items-center sm:gap-4">
              <Label htmlFor="name" className="sm:text-right">Name</Label>
              {isDataBundleForm ? (
                <select id="name" name="name" className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:col-span-3" required value={form.name} onChange={handleChange}>
                  {Array.from({ length: 100 }, (_, i) => (
                    <option key={i + 1} value={`${i + 1}GB`}>{i + 1}GB</option>
                  ))}
                </select>
              ) : (
                <Input id="name" name="name" className="sm:col-span-3" required placeholder="e.g. Legal Doc Name" value={form.name} onChange={handleChange} />
              )}
            </div>
            <div className="grid gap-2 sm:grid-cols-4 sm:items-center sm:gap-4">
              <Label htmlFor="basePrice" className="sm:text-right">Source Cost</Label>
              <Input id="basePrice" name="basePrice" type="number" min="0" step="0.01" className="sm:col-span-3" required placeholder="e.g. 10.00" value={form.basePrice ?? form.price} onChange={handleChange} />
            </div>
            {!isDataBundleForm && (
              <div className="grid gap-2 sm:grid-cols-4 sm:items-center sm:gap-4">
                <Label htmlFor="category" className="sm:text-right">Category</Label>
                <select id="category" name="category" className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:col-span-3" required value={form.category} onChange={handleChange}>
                  <option value="LEGAL_DOCUMENT">Legal Document</option>
                  <option value="EDUCATION">Education</option>
                  <option value="REGISTRATION_SERVICE">Registration Service</option>
                  {form.category === "AFA_REGISTRATION" ? <option value="AFA_REGISTRATION">Legacy Registration Service</option> : null}
                </select>
              </div>
            )}
            <div className="grid gap-2 sm:grid-cols-4 sm:items-center sm:gap-4">
              <Label htmlFor="provider" className="sm:text-right">Provider</Label>
              {isDataBundleForm ? (
                <input id="provider" name="provider" className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:col-span-3" required value={form.provider} readOnly />
              ) : (
                <select id="provider" name="provider" className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:col-span-3" required value={form.provider} onChange={handleChange}>
                  <option value="MTN">MTN</option>
                  <option value="AIRTELTIGO">AirtelTigo</option>
                  <option value="TELECEL">Telecel</option>
                  <option value="SERVICE">Other Service</option>
                </select>
              )}
            </div>
            <div className="grid gap-2 sm:grid-cols-4 sm:items-center sm:gap-4">
              <Label htmlFor="bundleType" className="sm:text-right">Type</Label>
              <select id="bundleType" name="bundleType" className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:col-span-3" required value={form.bundleType} onChange={handleChange}>
                <option value="DATA">Data</option>
                <option value="AIRTIME">Airtime</option>
                <option value="SERVICE">Service</option>
              </select>
            </div>
            <div className="grid gap-2 sm:grid-cols-4 sm:items-center sm:gap-4">
              <Label htmlFor="description" className="sm:text-right">Description</Label>
              <Input id="description" name="description" className="sm:col-span-3" value={form.description} onChange={handleChange} />
            </div>
            <div className="grid gap-2 sm:grid-cols-4 sm:items-center sm:gap-4">
              <Label htmlFor="price" className="sm:text-right">Dashboard price</Label>
              <Input id="price" name="price" type="number" step="0.01" className="sm:col-span-3" required value={form.price} onChange={handleChange} />
            </div>
            <div className="grid gap-2 sm:grid-cols-4 sm:items-center sm:gap-4">
              <Label htmlFor="storefrontPrice" className="sm:text-right">Shop price</Label>
              <Input id="storefrontPrice" name="storefrontPrice" type="number" min="0" step="0.01" className="sm:col-span-3" required value={form.storefrontPrice ?? form.price} onChange={handleChange} />
            </div>
            <input type="hidden" name="stock" value={form.stock} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isLoading}>{isLoading ? (mode === "edit" ? "Saving..." : "Creating...") : (mode === "edit" ? "Save Changes" : "Create Product")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
