import Link from "next/link";
import { Button } from "@/components/ui/button";
export default function NotFound() {
  return (
    <div className="container error-page">
      <span className="eyebrow">A LITTLE DETOUR</span>
      <h1>This little corner is empty.</h1>
      <p>Let’s find your way back to something good.</p>
      <Button asChild>
        <Link href="/shop">Explore the collection</Link>
      </Button>
    </div>
  );
}
