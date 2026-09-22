import { redirect } from "next/navigation";

export default async function LegacyCustomerPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  redirect(id ? `/customers/${id}` : "/customers");
}