import Link from "next/link";
import { FileText, ArrowLeft } from "lucide-react";

export const metadata = {
  title: "Terms of Service | FlyConnect",
  description: "FlyConnect Terms of Service",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8 text-slate-800">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 p-8 sm:p-12 space-y-8">
        <div className="flex items-center justify-between border-b border-slate-100 pb-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-50 text-[#1688f9] grid place-items-center">
              <FileText className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Terms of Service</h1>
              <p className="text-xs text-slate-500">Last updated: September 2026</p>
            </div>
          </div>
          <Link
            href="/"
            className="text-xs font-semibold text-[#1688f9] hover:underline flex items-center gap-1"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to App
          </Link>
        </div>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-slate-900">1. Acceptance of Terms</h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            By accessing or using FlyConnect, you agree to comply with and be bound by these Terms of Service.
            If you do not agree to these terms, please do not use the service.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-slate-900">2. Service Description</h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            FlyConnect provides travel management, booking workflows, invoicing, and agency operations software.
            Users may optionally link their Google Drive accounts for backing up business records and monitoring cloud storage limits.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-slate-900">3. User Responsibilities &amp; Data Ownership</h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            You retain all rights and ownership to the business data, customer records, and backup archives generated
            using FlyConnect. You are responsible for maintaining the confidentiality of your account credentials.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-slate-900">4. Third-Party Integrations</h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            Our service integrates with Google Drive APIs for cloud storage functions. Use of Google services is subject to
            Google&apos;s Terms of Service and API user policies.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-slate-900">5. Termination</h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            We reserve the right to suspend or terminate accounts that violate these terms or engage in misuse of the application.
          </p>
        </section>
      </div>
    </div>
  );
}
