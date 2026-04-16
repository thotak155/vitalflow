import {
  ClipboardList,
  HeartPulse,
  Inbox,
  LayoutDashboard,
  Pill,
  Stethoscope,
  Users,
} from "@vitalflow/ui/icons";
import type { NavSection } from "@vitalflow/ui/layout";

export const providerNav: readonly NavSection[] = [
  {
    id: "work",
    label: "Work",
    items: [
      { id: "home", label: "Dashboard", href: "/", icon: LayoutDashboard },
      { id: "inbox", label: "Inbox", href: "/inbox", icon: Inbox, badge: 3 },
      { id: "tasks", label: "Tasks", href: "/tasks", icon: ClipboardList },
    ],
  },
  {
    id: "clinical",
    label: "Clinical",
    items: [
      {
        id: "patients",
        label: "Patients",
        href: "/patients",
        icon: Users,
        requires: ["patient:read"],
      },
      {
        id: "encounters",
        label: "Encounters",
        href: "/encounters",
        icon: HeartPulse,
        requires: ["clinical:read"],
      },
      {
        id: "orders",
        label: "Orders",
        href: "/orders",
        icon: Stethoscope,
        requires: ["clinical:write"],
        comingSoon: true,
      },
      {
        id: "meds",
        label: "Medications",
        href: "/medications",
        icon: Pill,
        requires: ["clinical:read"],
        comingSoon: true,
      },
    ],
  },
];
