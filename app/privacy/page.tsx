import Link from "next/link";
import { ShieldCheck, ArrowLeft } from "lucide-react";

export const metadata = {
  title: "Privacy Policy | FlyConnect",
  description: "FlyConnect Privacy Policy and Google Drive data handling disclosure",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8 text-slate-800">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 p-8 sm:p-12 space-y-8">
        <div className="flex items-center justify-between border-b border-slate-100 pb-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-50 text-[#1688f9] grid place-items-center">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Privacy Policy</h1>
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
          <h2 className="text-lg font-bold text-slate-900">1. Overview</h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            FlyConnect (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) provides a travel and tourism agency management platform.
            This Privacy Policy explains how our application collects, uses, and safeguards information when you connect
            your Google account for agency database backup and storage management.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-slate-900">2. Google API Data &amp; Scopes Disclosure</h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            FlyConnect accesses Google user data exclusively for user-initiated agency database backups and storage inspection:
          </p>
          <ul className="list-disc pl-5 text-sm text-slate-600 space-y-2">
            <li>
              <strong>Google Drive File Scope (<code>drive.file</code>):</strong> Used strictly to upload, update, and manage
              database backup files created directly by FlyConnect in the user&apos;s personal Google Drive folder upon explicit request.
            </li>
            <li>
              <strong>Google Drive Metadata Scope (<code>drive.metadata.readonly</code>):</strong> Used strictly to read storage quota
              metrics (total storage, used storage, free space) so the user can monitor their available backup space within the app.
            </li>
            <li>
              <strong>User Info Scope (<code>userinfo.email</code>):</strong> Used to confirm the connected Google account identity.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-slate-900">3. Google Limited Use Policy Compliance</h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            FlyConnect adheres to the <strong>Google API Services User Data Policy</strong>, including the Limited Use requirements:
          </p>
          <ul className="list-disc pl-5 text-sm text-slate-600 space-y-2">
            <li>We do not transfer or disclose your Google user data to any third parties.</li>
            <li>We do not use your Google user data for serving advertisements, retargeting, or marketing.</li>
            <li>We do not store your private Google Drive files on external servers; files remain inside your own Google Drive.</li>
            <li>Tokens are kept locally in your session and are never shared.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-slate-900">4. Data Retention and Revocation</h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            You can disconnect Google Drive access at any time directly in the FlyConnect Settings panel by clicking
            &quot;Disconnect Google Drive&quot; or by revoking permissions in your{" "}
            <a
              href="https://myaccount.google.com/permissions"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#1688f9] underline"
            >
              Google Account Security settings
            </a>.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-slate-900">5. Contact Us</h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            If you have questions about this Privacy Policy or your data privacy, contact us via the FlyConnect application administrator.
          </p>
        </section>
      </div>
    </div>
  );
}
