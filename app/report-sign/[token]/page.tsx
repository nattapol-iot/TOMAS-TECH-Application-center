import ReportCustomerSign from "../../system/ReportCustomerSign";

export const metadata = { title: "Customer report acknowledgment", referrer: "no-referrer", robots: { index: false, follow: false } };

export default async function ReportSignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ReportCustomerSign token={token} />;
}
