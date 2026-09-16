import Link from "next/link";
import { DiscoveryShell } from "@/components/public-events";
export default function EventNotFound() {
  return <DiscoveryShell><h1 className="text-3xl font-semibold">Event not found</h1><p className="mt-4 text-muted-foreground">This opportunity is not available.</p><Link href="/explore" className="mt-6 inline-block underline">Browse current opportunities</Link></DiscoveryShell>;
}
