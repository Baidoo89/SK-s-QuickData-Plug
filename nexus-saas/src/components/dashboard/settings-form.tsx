"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";

interface SettingsFormProps {
  initialName: string;
}

export function SettingsForm({ initialName }: SettingsFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState(initialName);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/organization", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name }),
      });

      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error("Something went wrong");
      }

      toast({
        title: "Settings updated",
        description: payload?.data?.storePath
          ? `Your organization name and storefront link were updated to ${payload.data.storePath}.`
          : "Your organization name has been updated.",
      });
      
      router.refresh();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update settings. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="min-w-0">
      <Card className="premium-surface min-w-0 overflow-hidden rounded-lg">
        <CardHeader className="border-b border-border/70 bg-muted/20 pb-3">
          <CardTitle className="text-sm font-semibold">Organization Name</CardTitle>
          <CardDescription className="break-words">
            This is your organization&apos;s visible name on dashboards and storefront pages.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4">
          <div className="grid gap-2 sm:max-w-md">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
            />
          </div>
        </CardContent>
        <CardFooter className="border-t border-border/70 bg-muted/10 px-4 py-3">
          <Button type="submit" disabled={loading} className="w-full sm:w-auto">
            {loading ? "Saving..." : "Save"}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
