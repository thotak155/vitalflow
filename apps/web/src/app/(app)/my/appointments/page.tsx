import { ComingSoon } from "../../../../components/coming-soon.js";

export default function MyAppointmentsPage() {
  return (
    <ComingSoon
      title="My appointments"
      breadcrumb="Appointments"
      milestone="Patient portal V2"
      lede="Upcoming and past visits — request new appointments, reschedule, cancel, or download a visit summary."
      bullets={[
        "Upcoming appointments with join-by-link for telehealth",
        "Past appointments with after-visit summary + invoice",
        "Request new appointment with preferred provider / date",
        "Reschedule + cancel with automatic provider notification",
        "Calendar export (.ics) + push reminders",
      ]}
    />
  );
}
