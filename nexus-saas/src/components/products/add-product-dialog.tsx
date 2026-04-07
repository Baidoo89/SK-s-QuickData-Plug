"use client"

import { useState } from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AddEditProductDialog } from "@/components/products/add-edit-product-dialog"

export function AddProductDialog() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="mr-2 h-4 w-4" />
        Add Bundle
      </Button>
      <AddEditProductDialog open={open} setOpen={setOpen} mode="add" />
    </>
  )
}
