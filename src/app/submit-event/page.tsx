import { requireIdentity } from "@/lib/auth/identity";
import { DiscoveryShell } from "@/components/public-events";
import { SubmissionForm } from "@/components/submission-form";

export const metadata = {
  title: "Submit a Student Opportunity | Student Opportunities",
  description: "Share a student hackathon, coding competition, workshop, or conference for platform review.",
};

export default async function SubmitEventPage() {
  await requireIdentity("/submit-event");

  return (
    <DiscoveryShell authenticated={true}>
      <div className="max-w-3xl">
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Submit an Opportunity
        </h1>
        <p className="mt-2 text-base text-muted-foreground">
          Suggest a genuine student opportunity to be reviewed by our team and listed in the platform directory.
        </p>

        <div className="mt-8">
          <SubmissionForm />
        </div>
      </div>
    </DiscoveryShell>
  );
}
