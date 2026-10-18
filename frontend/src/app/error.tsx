"use client";
import { Button } from "@/components/ui/button";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="container error-page">
      <span className="eyebrow">A LITTLE PAUSE</span>
      <h1>We couldn’t load the store.</h1>
      <p>
        Please try again in a moment. Your shopping bag is still saved on this
        device.
      </p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
