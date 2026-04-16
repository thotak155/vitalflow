import {
  Calendar,
  CreditCard,
  FileText,
  HeartPulse,
  LayoutDashboard,
  Mail,
  Pill,
} from "@vitalflow/ui/icons";
import type { NavSection } from "@vitalflow/ui/layout";

export const patientNav: readonly NavSection[] = [
  {
    id: "home",
    items: [{ id: "home", label: "Home", href: "/my", icon: LayoutDashboard }],
  },
  {
    id: "care",
    label: "Care",
    items: [
      { id: "appointments", label: "Appointments", href: "/my/appointments", icon: Calendar },
      { id: "records", label: "Records", href: "/my/records", icon: FileText },
      { id: "prescriptions", label: "Prescriptions", href: "/my/prescriptions", icon: Pill },
      { id: "vitals", label: "Vitals", href: "/my/vitals", icon: HeartPulse },
    ],
  },
  {
    id: "account",
    label: "Account",
    items: [
      { id: "messages", label: "Messages", href: "/my/messages", icon: Mail, badge: 0 },
      { id: "billing", label: "Billing", href: "/my/billing", icon: CreditCard },
    ],
  },
];
