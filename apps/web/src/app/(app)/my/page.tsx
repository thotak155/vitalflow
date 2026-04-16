"use client";

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Modal,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  ModalTrigger,
} from "@vitalflow/ui";
import { Calendar, Mail } from "@vitalflow/ui/icons";
import { AppBreadcrumbs } from "@vitalflow/ui/layout";
import { EmptyState, PageHeader } from "@vitalflow/ui/patterns";
import NextLink from "next/link";

export default function PatientHomePage() {
  return (
    <>
      <AppBreadcrumbs
        LinkComponent={NextLink}
        items={[{ label: "My health", href: "/my" }, { label: "Home" }]}
      />
      <PageHeader
        eyebrow="Welcome back"
        title="Hi Alex — how can we help today?"
        description="Book a visit, message your care team, or review recent results."
        actions={
          <Modal>
            <ModalTrigger asChild>
              <Button>Book appointment</Button>
            </ModalTrigger>
            <ModalContent>
              <ModalHeader>
                <ModalTitle>Request an appointment</ModalTitle>
                <ModalDescription>
                  A scheduler will confirm your time by email within one business day.
                </ModalDescription>
              </ModalHeader>
              <p className="py-4 text-sm text-muted-foreground">
                Full booking flow lands with the scheduling milestone.
              </p>
              <ModalFooter>
                <Button variant="outline">Cancel</Button>
                <Button>Send request</Button>
              </ModalFooter>
            </ModalContent>
          </Modal>
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" aria-hidden />
              Upcoming visits
            </CardTitle>
          </CardHeader>
          <CardContent>
            <EmptyState
              icon={Calendar}
              title="No upcoming visits"
              description="When you have an appointment scheduled, it'll appear here."
              action={
                <Button variant="outline" size="sm">
                  Request one
                </Button>
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" aria-hidden />
              Messages
              <Badge variant="muted" size="sm">
                0
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <EmptyState
              icon={Mail}
              title="Inbox is clear"
              description="New messages from your care team will appear here."
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
