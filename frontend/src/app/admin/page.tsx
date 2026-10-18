import { AdminDashboard } from "@/components/admin-dashboard";
export const metadata = {
  title: "Farm desk",
  robots: { index: false, follow: false },
};
export default function AdminPage() {
  return (
    <div className="container utility-page">
      <span className="eyebrow">THE FARMDIRECT FARM DESK</span>
      <h1>Goodness, well managed.</h1>
      <AdminDashboard />
    </div>
  );
}
