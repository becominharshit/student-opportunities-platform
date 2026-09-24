import Link from "next/link";
import { DiscoveryShell } from "@/components/public-events";
export default function EventNotFound() {
  return <DiscoveryShell activePath="/explore"><section className="empty-panel"><h1 className="page-title">Event not found</h1><p className="mt-4 text-muted-foreground">This opportunity is not available.</p><Link href="/explore" className="action-link mt-6">Browse current opportunities</Link></section></DiscoveryShell>;
}
