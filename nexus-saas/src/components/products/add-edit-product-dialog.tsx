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
  price: number // base price
  basePrice?: number // for clarity, but keep price for backward compatibility
  stock?: number
  provider: string
  bundleType: string
  category: string
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
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialData, open, tabParam])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setForm((prev) => ({
      ...prev,
      [name]: ["price", "basePrice"].includes(name) ? parseFloat(value) : value
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{mode === "edit" ? "Edit Product" : "Add Bundle"}</DialogTitle>
            <DialogDescription>
              {mode === "edit" ? "Update product details." : "Create a new bundle for your organization."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">Name</Label>
              {isBundleSection ? (
                <select id="name" name="name" className="col-span-3 flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50" required value={form.name} onChange={handleChange}>
                  {Array.from({ length: 100 }, (_, i) => (
                    <option key={i + 1} value={`${i + 1}GB`}>{i + 1}GB</option>
                  ))}
                </select>
              ) : (
                <Input id="name" name="name" className="col-span-3" required placeholder="e.g. Legal Doc Name" value={form.name} onChange={handleChange} />
              )}
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="basePrice" className="text-right">Base Price (GH₵)</Label>
              <Input id="basePrice" name="basePrice" type="number" min="0" step="0.01" className="col-span-3" required placeholder="e.g. 10.00" value={form.basePrice ?? form.price} onChange={handleChange} />
            </div>
            {!isBundleSection && (
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="category" className="text-right">Category</Label>
                <select id="category" name="category" className="col-span-3 flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50" required value={form.category} onChange={handleChange}>
                  <option value="LEGAL_DOCUMENT">Legal Document</option>
                  <option value="EDUCATION">Education</option>
                  <option value="AFA_MINUTES">AFA Minutes</option>
                </select>
              </div>
            )}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="provider" className="text-right">Provider</Label>
              <input id="provider" name="provider" className="col-span-3 flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50" required value={form.provider} readOnly />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="bundleType" className="text-right">Type</Label>
              <select id="bundleType" name="bundleType" className="col-span-3 flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50" required value={form.bundleType} onChange={handleChange}>
                <option value="DATA">Data</option>
                <option value="AIRTIME">Airtime</option>
              </select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="description" className="text-right">Description</Label>
              <Input id="description" name="description" className="col-span-3" value={form.description} onChange={handleChange} />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="price" className="text-right">Price</Label>
              <Input id="price" name="price" type="number" step="0.01" className="col-span-3" required value={form.price} onChange={handleChange} />
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
