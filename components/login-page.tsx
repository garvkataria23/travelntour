"use client";

import { ArrowRight, Check, Eye, Globe2, LockKeyhole, Mail, Plane } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { api, hasActiveSession, setSession } from "@/lib/api";

const EASY_ID = "blue";
const EASY_PASSWORD = "aura";

export function LoginPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ userId?: string; password?: string }>({});
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);

  const STEPS = ["Connecting to server…", "Verifying credentials…", "Securing your session…"];
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function validate() {
    const errors: { userId?: string; password?: string } = {};
    if (!userId.trim()) errors.userId = "Username is required.";
    else if (userId.trim() !== EASY_ID && !EMAIL_RE.test(userId.trim())) errors.userId = "Enter a valid email address.";
    if (!password) errors.password = "Password is required.";
    else if (password.length < 4) errors.password = "Password must be at least 4 characters.";
    return errors;
  }

  function fillDemo() {
    setUserId(EASY_ID);
    setPassword(EASY_PASSWORD);
    setFieldErrors({});
    setError("");
    setMessage("");
    setShowPassword(false);
  }

  useEffect(() => {
    if (hasActiveSession()) {
      router.replace("/dashboard");
    } else {
      setReady(true);
    }
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    const nextErrors = validate();
    setFieldErrors(nextErrors);
    if (nextErrors.userId || nextErrors.password) return;
    setLoading(true);
    setStep(0);
    // clear any previous success/error, then animate steps while we wait
    try {
      const steps = ["Connecting to server…", "Verifying credentials…", "Securing your session…"];
      let i = 0;
      const timer = window.setInterval(() => {
        if (i < steps.length - 1) {
          i += 1;
          setStep(i);
        }
      }, 450);
      try {
        const credentials = { email: userId.trim(), password };
        const session = await api<{ accessToken: string; refreshToken: string; user: { id: string; name: string; email: string; role: string } }>(
          "/auth/login",
          { method: "POST", body: credentials, auth: false },
        );
        setMessage("Login successful — signing you in.");
        setSession(session, remember);
        window.setTimeout(() => router.push("/dashboard"), 500);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to login. Please try again.");
      } finally {
        window.clearInterval(timer);
      }
    } finally {
      setLoading(false);
    }
  }

  if (!ready) return null;

  return (
    <main className="min-h-screen bg-[#e9f4ff] p-0 text-slate-900 sm:p-4 md:p-7">
      <section className="mx-auto grid min-h-screen max-w-[1480px] overflow-hidden bg-white shadow-soft sm:min-h-[calc(100vh-32px)] sm:rounded-[22px] md:min-h-[calc(100vh-56px)] lg:grid-cols-[1.53fr_1fr]">
        <aside className="relative hidden bg-navy lg:block">
          <div className="absolute inset-0 bg-[url('/assets/flyconnect-hero.png')] bg-cover bg-center" />
        </aside>

        <section className="relative flex min-h-screen flex-col overflow-hidden bg-white px-6 pb-7 pt-8 sm:min-h-[calc(100vh-32px)] sm:px-10 md:px-16 lg:min-h-0 lg:px-[104px] lg:pb-5 lg:pt-10">
<div className="flex justify-end">
            <span className="flex items-center gap-2 rounded-full px-2 py-1 text-[15px] font-medium text-[#4b5870]">
              <Globe2 className="h-[18px] w-[18px]" />
              English
            </span>
          </div>

          <div className="relative z-10 mx-auto flex w-full max-w-[448px] flex-1 flex-col justify-center pb-10 pt-6 lg:justify-start lg:pt-7">
            <div className="mb-[46px] flex flex-col items-center">
              <div className="flex items-center gap-3">
                <Plane className="h-[60px] w-[60px] -rotate-45 fill-[#218bf3] stroke-[#218bf3] stroke-[1.5]" />
                <div>
                  <h1 className="text-[32px] font-extrabold leading-none tracking-[-0.04em] text-[#06142c]">
                    Fly<span className="text-[#1d8af3]">Connect</span>
                  </h1>
                  <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.06em] text-[#334157]">Travel Smarter, Together</p>
                </div>
              </div>
            </div>

            <div className="mb-9">
              <h2 className="text-[38px] font-extrabold leading-tight tracking-[-0.055em] text-[#08142c] sm:text-[40px]">Welcome Back</h2>
              <p className="mt-1 max-w-[385px] text-[18px] leading-8 text-[#667389]">Login to your account to manage bookings, automations and more.</p>
            </div>

            <form className="space-y-7" onSubmit={handleSubmit}>
<label className="block">
                <span className="mb-[10px] block text-[17px] font-semibold text-[#101b31]">Username</span>
                <span className={`flex h-[56px] items-center gap-4 rounded-xl border bg-white px-4 text-[#77849a] shadow-[0_1px_2px_rgba(10,25,45,0.02)] ${fieldErrors.userId ? "border-rose-400 ring-4 ring-rose-50" : "border-[#cfd8e5] focus-within:border-[#87bdf4] focus-within:ring-4 focus-within:ring-blue-100"}`}>
                  <Mail className="h-[22px] w-[22px]" />
                  <input value={userId} onChange={(event) => { setUserId(event.target.value); setFieldErrors((errors) => ({ ...errors, userId: undefined })); }} className="h-full min-w-0 flex-1 bg-transparent text-[16px] font-medium text-slate-900 outline-none placeholder:text-[#7c8799]" placeholder={EASY_ID} type="text" autoComplete="username" />
                </span>
                {fieldErrors.userId ? <span className="mt-2 block text-[13px] font-medium text-rose-600">{fieldErrors.userId}</span> : null}
              </label>

              <label className="block">
                <span className="mb-[10px] flex items-center justify-between text-[17px] font-semibold text-[#101b31]">
                  Password
                  <button className="text-[14px] font-medium text-[#087df0] hover:text-[#0068d1]" type="button" onClick={() => setMessage("Contact your administrator to reset your password.")}>Forgot Password?</button>
                </span>
                <span className={`flex h-[56px] items-center gap-4 rounded-xl border bg-white px-4 text-[#77849a] shadow-[0_1px_2px_rgba(10,25,45,0.02)] ${fieldErrors.password ? "border-rose-400 ring-4 ring-rose-50" : "border-[#cfd8e5] focus-within:border-[#87bdf4] focus-within:ring-4 focus-within:ring-blue-100"}`}>
                  <LockKeyhole className="h-[21px] w-[21px]" />
                  <input value={password} onChange={(event) => { setPassword(event.target.value); setFieldErrors((errors) => ({ ...errors, password: undefined })); }} className="h-full min-w-0 flex-1 bg-transparent text-[16px] font-medium text-slate-900 outline-none placeholder:text-[#7c8799]" placeholder={EASY_PASSWORD} type={showPassword ? "text" : "password"} autoComplete="current-password" />
                  <button aria-label="Toggle password visibility" onClick={() => setShowPassword((value) => !value)} type="button">
                    <Eye className="h-[22px] w-[22px]" />
                  </button>
                </span>
                {fieldErrors.password ? <span className="mt-2 block text-[13px] font-medium text-rose-600">{fieldErrors.password}</span> : null}
              </label>

              <button onClick={() => setRemember((value) => !value)} className="-mt-1 flex items-center gap-3 text-[16px] font-medium text-[#1d2636]" type="button">
                <span className={`grid h-6 w-6 place-items-center rounded-md border transition ${remember ? "border-[#2289ee] bg-[#2289ee] text-white" : "border-slate-300 bg-white text-transparent"}`}>
                  <Check className="h-4 w-4 stroke-[3]" />
                </span>
                Keep me logged in
              </button>

              <button className="flex h-[56px] w-full items-center justify-center gap-5 rounded-xl bg-[#218bf3] text-[17px] font-bold text-white shadow-[0_14px_24px_rgba(33,139,243,0.25)] transition hover:bg-[#0f7ee9] active:scale-[0.99]" type="submit" disabled={loading}>
                {loading ? "Logging in..." : "Login"}
                <ArrowRight className="h-6 w-6" />
              </button>
            </form>

            {error ? <p className="mt-4 rounded-lg bg-rose-50 px-4 py-3 text-center text-sm font-medium text-rose-700">{error}</p> : null}
            {message ? <p className="mt-4 rounded-lg bg-blue-50 px-4 py-3 text-center text-sm font-medium text-blue-700">{message}</p> : null}

            <p className="mt-6 rounded-lg bg-blue-50 px-4 py-3 text-center text-[14px] font-medium text-blue-700">
              Demo access — username <b>{EASY_ID}</b>, password <b>{EASY_PASSWORD}</b>
            </p>
            <button type="button" onClick={fillDemo} className="mt-3 flex w-full items-center justify-between gap-3 rounded-lg border border-dashed border-[#8fc4f5] bg-blue-50 px-4 py-3 text-left transition hover:bg-blue-100">
              <span className="text-[14px] font-medium text-blue-700">
                Quick demo login — <b>{EASY_ID}</b> / <b>{EASY_PASSWORD}</b>
              </span>
              <span className="shrink-0 rounded-md bg-[#1688f9] px-3 py-1.5 text-[13px] font-bold text-white">Use demo</span>
            </button>
          </div>

          <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-[150px] overflow-hidden opacity-70">
            <div className="absolute bottom-0 left-0 right-0 h-[75px] bg-gradient-to-t from-[#e9eef5] to-transparent" />
            <div className="city-silhouette" />
            <div className="absolute bottom-[56px] left-[48%] h-px w-[220px] rounded-full border-t-2 border-dashed border-[#cdd8e7]" />
            <Plane className="absolute bottom-[92px] right-[44px] h-12 w-12 -rotate-[24deg] fill-[#d8e2ef] stroke-[#d8e2ef]" />
            <p className="absolute bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap text-[12px] font-semibold uppercase tracking-[0.38em] text-[#a5afbe]">Flights • People • Possibilities</p>
          </div>
        </section>
      </section>
    </main>
  );
}
