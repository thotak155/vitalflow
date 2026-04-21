import { ComingSoon } from "../../../../components/coming-soon.js";

export default function MyRecordsPage() {
  return (
    <ComingSoon
      title="My records"
      breadcrumb="Records"
      milestone="Patient portal V2"
      lede="Your health record — visit notes, diagnoses, vaccinations, and documents uploaded by your care team."
      bullets={[
        "Visit summaries from signed notes",
        "Problem list + active diagnoses",
        "Immunization record with CDC-compliant export",
        "Lab + imaging results with trending",
        "Document downloads (CCD, visit summary, referral letter)",
      ]}
    />
  );
}
