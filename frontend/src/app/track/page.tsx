import { Tracking } from "@/components/tracking";
export const metadata = {
  title: "Track your order",
  robots: { index: false, follow: false },
};
export default async function TrackPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  return (
    <div className="container utility-page">
      <span className="eyebrow">FROM OUR HANDS TO YOUR HOME</span>
      <h1>Follow your goodness.</h1>
      <Tracking initialId={(await searchParams).id} />
    </div>
  );
}
