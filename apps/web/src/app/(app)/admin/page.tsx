"use client";

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  FormField,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from "@vitalflow/ui";
import { AppBreadcrumbs } from "@vitalflow/ui/layout";
import { PageHeader } from "@vitalflow/ui/patterns";
import NextLink from "next/link";
import { useState } from "react";

export default function AdminOverviewPage() {
  const [displayName, setDisplayName] = useState("Demo Clinic");
  const [slug, setSlug] = useState("demo");
  const [plan, setPlan] = useState("growth");
  const [notes, setNotes] = useState("");
  const slugError = /^[a-z0-9-]+$/.test(slug)
    ? undefined
    : "Lowercase letters, numbers, and dashes only.";

  return (
    <>
      <AppBreadcrumbs
        LinkComponent={NextLink}
        items={[{ label: "Admin", href: "/admin" }, { label: "Tenant settings" }]}
      />
      <PageHeader
        eyebrow="Tenant"
        title="Organization settings"
        description="Control the identity, plan, and access policies of this tenant."
        actions={
          <>
            <Button variant="outline">Discard</Button>
            <Button>Save changes</Button>
          </>
        }
      />

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="compliance">Compliance</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle>Identity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField label="Display name" htmlFor="display-name" required>
                <Input
                  id="display-name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </FormField>
              <FormField
                label="URL slug"
                htmlFor="slug"
                required
                helper="Appears in tenant-scoped URLs (e.g. demo.vitalflow.health)."
                error={slugError}
              >
                <Input
                  id="slug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  invalid={!!slugError}
                />
              </FormField>
              <Separator />
              <FormField label="Plan" htmlFor="plan">
                <Select value={plan} onValueChange={setPlan}>
                  <SelectTrigger id="plan">
                    <SelectValue placeholder="Choose a plan" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="starter">Starter</SelectItem>
                    <SelectItem value="growth">Growth</SelectItem>
                    <SelectItem value="enterprise">Enterprise</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
              <FormField
                label="Internal notes"
                htmlFor="notes"
                helper="Not visible to tenant users."
              >
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Anything the next admin should know…"
                />
              </FormField>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="billing">
          <Card>
            <CardHeader>
              <CardTitle>Billing</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">
                Stripe integration surfaces here once the monetization service is wired up.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="compliance">
          <Card>
            <CardHeader>
              <CardTitle>Compliance</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">
                BAA signature, audit log retention, and data-residency controls live here.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
