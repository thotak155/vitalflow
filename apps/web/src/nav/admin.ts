import {
  Building2,
  CreditCard,
  LayoutDashboard,
  Settings,
  Shield,
  Users,
} from "@vitalflow/ui/icons";
import type { NavSection } from "@vitalflow/ui/layout";

export const adminNav: readonly NavSection[] = [
  {
    id: "overview",
    items: [{ id: "home", label: "Overview", href: "/admin", icon: LayoutDashboard }],
  },
  {
    id: "tenant",
    label: "Tenant",
    items: [
      {
        id: "members",
        label: "Members",
        href: "/admin/members",
        icon: Users,
        requires: ["admin:users"],
      },
      {
        id: "payers",
        label: "Payers",
        href: "/admin/payers",
        icon: Building2,
        requires: ["admin:billing_config"],
      },
      {
        id: "billing",
        label: "Billing",
        href: "/admin/billing",
        icon: CreditCard,
        requires: ["admin:tenant"],
      },
      {
        id: "security",
        label: "Security",
        href: "/admin/security",
        icon: Shield,
        requires: ["admin:tenant"],
      },
    ],
  },
  {
    id: "settings",
    items: [{ id: "settings", label: "Settings", href: "/admin/settings", icon: Settings }],
  },
];
