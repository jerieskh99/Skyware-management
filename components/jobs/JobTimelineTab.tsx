import { JobTimeline } from "./JobTimeline";
import type { JobDetail } from "@/lib/jobs/queries";

interface Props {
  job: JobDetail;
}

export function JobTimelineTab({ job }: Props) {
  return (
    <section className="space-y-3">
      <JobTimeline events={job.statusEvents} />
    </section>
  );
}
