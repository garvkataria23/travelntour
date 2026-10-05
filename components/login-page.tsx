"use client";

import { ArrowRight, Check, Eye, Globe2, KeyRound, LockKeyhole, Mail, Plane, ShieldCheck, User as UserIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { api, hasActiveSession, setSession, getStoredUser, type ApiSession } from "@/lib/api";
import { resetPassword } from "@/lib/firebase";
import {
  StaffMember,
  authenticateStaffCredentials,
  getStoredStaff,
  hydrateSessionWithStaffPermissions,
} from "@/lib/staff-management";

export function LoginPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState("");
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; userId?: string; password?: string }>({});
  const [loading, setLoading] = useState(false);
  const [staffAccounts, setStaffAccounts] = useState<StaffMember[]>([]);
  const [showRoleAccounts, setShowRoleAccounts] = useState(true);

  // Forgot password modal state
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMsg, setForgotMsg] = useState("");
  const [forgotErr, setForgotErr] = useState("");

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function validate() {
    const errors: { name?: string; userId?: string; password?: string } = {};

    if (mode === "register" && !name.trim()) {
      errors.name = "Full name or agency name is required.";
    }
    if (!userId.trim()) {
      errors.userId = "Email is required.";
    } else if (!EMAIL_RE.test(userId.trim())) {
      errors.userId = "Enter a valid email address.";
    }
    if (!password) {
      errors.password = "Password is required.";
    } else if (password.length < 6) {
      errors.password = "Password must be at least 6 characters.";
    }
    return errors;
  }

  useEffect(() => {
    setStaffAccounts(getStoredStaff().filter((m) => m.status === "ACTIVE"));
    if (hasActiveSession()) {
      const stored = getStoredUser();
      if (stored?.role === "SUPER_ADMIN") {
        router.replace("/admin");
      } else {
        router.replace("/dashboard");
      }
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
    if (Object.keys(nextErrors).length > 0) return;

    setLoading(true);

    try {
      if (mode === "register") {
        try {
          const res = await api<ApiSession>("/auth/register", {
            method: "POST",
            auth: false,
            body: { name: name.trim(), email: userId.trim().toLowerCase(), password },
          });
          if (res && res.accessToken) {
            const enriched = hydrateSessionWithStaffPermissions(res);
            setSession(enriched, remember);
            if (enriched.user?.businessId && typeof window !== "undefined") {
              window.localStorage.setItem("fc_business_id", enriched.user.businessId);
            }
            setMessage("Account created successfully! Welcome to FlyConnect.");
            router.push(enriched.user?.role === "SUPER_ADMIN" ? "/admin" : "/dashboard");
            return;
          }
        } catch (regErr: any) {
          setError(regErr.message || "Registration failed. Public registration may be disabled.");
          return;
        }
      } else {
        const cleanEmail = userId.trim().toLowerCase();
        // 1. Try backend API authentication first
        try {
          const res = await api<ApiSession>("/auth/login", {
            method: "POST",
            auth: false,
            body: { email: cleanEmail, password },
          });
          if (res && res.accessToken) {
            const enriched = hydrateSessionWithStaffPermissions(res);
            setSession(enriched, remember);
            if (enriched.user?.businessId && typeof window !== "undefined") {
              window.localStorage.setItem("fc_business_id", enriched.user.businessId);
            }
            setMessage(`Signed in as ${enriched.user.name} (${enriched.user.role}).`);
            router.push(enriched.user?.role === "SUPER_ADMIN" ? "/admin" : "/dashboard");
            return;
          }
        } catch {
          // 2. Fallback to Staff & Role Registry authentication (supports browser-provisioned staff & offline mode)
          try {
            const staffSession = authenticateStaffCredentials(cleanEmail, password);
            setSession(staffSession, remember);
            if (staffSession.user?.businessId && typeof window !== "undefined") {
              window.localStorage.setItem("fc_business_id", staffSession.user.businessId);
            }
            setMessage(`Signed in as ${staffSession.user.name} (${staffSession.user.role}).`);
            router.push(staffSession.user?.role === "SUPER_ADMIN" ? "/admin" : "/dashboard");
            return;
          } catch (staffErr: any) {
            setError(staffErr?.message || "Invalid email or password. Please verify and retry.");
            return;
          }
        }
      }
    } catch {
      setError("Authentication failed. Please verify your credentials and retry.");
    } finally {
      setLoading(false);
    }
  }

  async function handlePasswordReset(e: FormEvent) {
    e.preventDefault();
    setForgotErr("");
    setForgotMsg("");
    if (!forgotEmail.trim() || !EMAIL_RE.test(forgotEmail.trim())) {
      setForgotErr("Please enter a valid email address.");
      return;
    }
    setForgotLoading(true);
    try {
      await resetPassword(forgotEmail.trim().toLowerCase());
    } catch {
      // Don't leak whether the account exists
    } finally {
      setForgotMsg(`If an account exists with ${forgotEmail}, a password reset link has been sent.`);
      setForgotLoading(false);
      setTimeout(() => {
        setForgotOpen(false);
        setForgotMsg("");
        setForgotEmail("");
      }, 4000);
    }
  }

  if (!ready) return null;

  return (
    <main className="min-h-screen bg-[#e9f4ff] p-0 text-slate-900 sm:p-4 md:p-7">
      <section className="mx-auto grid min-h-screen max-w-[1480px] overflow-hidden bg-white shadow-soft sm:min-h-[calc(100vh-32px)] sm:rounded-[22px] md:min-h-[calc(100vh-56px)] lg:grid-cols-[1.53fr_1fr]">
        <aside className="relative hidden bg-[#08142e] lg:block">
          <div className="absolute inset-0 bg-[url('/assets/flyconnect-hero.png')] bg-cover bg-center" />
        </aside>

        <section className="relative flex min-h-screen flex-col overflow-y-auto bg-white px-6 pb-7 pt-8 sm:min-h-[calc(100vh-32px)] sm:px-10 md:px-16 lg:min-h-0 lg:px-[80px] lg:pb-5 lg:pt-8">
          <div className="flex justify-end">
            <span className="flex items-center gap-2 rounded-full px-2 py-1 text-[15px] font-medium text-[#4b5870]">
              <Globe2 className="h-[18px] w-[18px]" />
              English
            </span>
          </div>

          <div className="relative z-10 mx-auto flex w-full max-w-[448px] flex-1 flex-col justify-center pb-8 pt-4 lg:justify-start lg:pt-5">
            <div className="mb-6 flex flex-col items-center">
              <div className="flex items-center gap-3">
                <Plane className="h-12 w-12 -rotate-45 fill-[#218bf3] stroke-[#218bf3] stroke-[1.5]" />
                <div>
                  <h1 className="text-[28px] font-extrabold leading-none tracking-[-0.04em] text-[#06142c]">
                    Fly<span className="text-[#1d8af3]">Connect</span>
                  </h1>
                  <p className="mt-1.5 text-[10px] font-bold uppercase tracking-[0.06em] text-[#334157]">Travel Smarter, Together</p>
                </div>
              </div>
            </div>

            <div className="mb-6">
              <h2 className="text-[32px] font-extrabold leading-tight tracking-[-0.055em] text-[#08142c]">
                {mode === "login" ? "Welcome Back" : "Create Account"}
              </h2>
              <p className="mt-1 text-[15px] leading-relaxed text-[#667389]">
                {mode === "login"
                  ? "Sign in to manage bookings, customers, and travel operations."
                  : "Start managing your travel agency bookings, customers, and invoices."}
              </p>
            </div>

            <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
              {mode === "register" ? (
                <label className="block">
                  <span className="mb-1.5 block text-[15px] font-semibold text-[#101b31]">Full Name / Agency Name</span>
                  <span className={`flex h-[50px] items-center gap-3.5 rounded-xl border bg-white px-4 text-[#77849a] shadow-sm ${fieldErrors.name ? "border-rose-400 ring-4 ring-rose-50" : "border-[#cfd8e5] focus-within:border-[#87bdf4] focus-within:ring-4 focus-within:ring-blue-100"}`}>
                    <UserIcon className="h-5 w-5" />
                    <input
                      value={name}
                      onChange={(e) => { setName(e.target.value); setFieldErrors((errs) => ({ ...errs, name: undefined })); }}
                      className="h-full min-w-0 flex-1 bg-transparent text-[15px] font-medium text-slate-900 outline-none placeholder:text-[#7c8799]"
                      placeholder="Blue Aura Travel Agency"
                      type="text"
                    />
                  </span>
                  {fieldErrors.name ? <span className="mt-1 block text-xs font-medium text-rose-600">{fieldErrors.name}</span> : null}
                </label>
              ) : null}

              <label className="block">
                <span className="mb-1.5 block text-[15px] font-semibold text-[#101b31]">Email Address</span>
                <span className={`flex h-[50px] items-center gap-3.5 rounded-xl border bg-white px-4 text-[#77849a] shadow-sm ${fieldErrors.userId ? "border-rose-400 ring-4 ring-rose-50" : "border-[#cfd8e5] focus-within:border-[#87bdf4] focus-within:ring-4 focus-within:ring-blue-100"}`}>
                  <Mail className="h-5 w-5" />
                  <input
                    value={userId}
                    onChange={(event) => { setUserId(event.target.value); setFieldErrors((errors) => ({ ...errors, userId: undefined })); }}
                    className="h-full min-w-0 flex-1 bg-transparent text-[15px] font-medium text-slate-900 outline-none placeholder:text-[#7c8799]"
                    placeholder="agent@flyconnect.app"
                    type="text"
                    autoComplete="email"
                  />
                </span>
                {fieldErrors.userId ? <span className="mt-1 block text-xs font-medium text-rose-600">{fieldErrors.userId}</span> : null}
              </label>

              <label className="block">
                <span className="mb-1.5 flex items-center justify-between text-[15px] font-semibold text-[#101b31]">
                  Password
                  {mode === "login" ? (
                    <button
                      className="text-xs font-semibold text-[#087df0] hover:text-[#0068d1]"
                      type="button"
                      onClick={() => { setForgotOpen(true); setForgotEmail(userId.includes("@") ? userId : ""); }}
                    >
                      Forgot Password?
                    </button>
                  ) : null}
                </span>
                <span className={`flex h-[50px] items-center gap-3.5 rounded-xl border bg-white px-4 text-[#77849a] shadow-sm ${fieldErrors.password ? "border-rose-400 ring-4 ring-rose-50" : "border-[#cfd8e5] focus-within:border-[#87bdf4] focus-within:ring-4 focus-within:ring-blue-100"}`}>
                  <LockKeyhole className="h-5 w-5" />
                  <input
                    value={password}
                    onChange={(event) => { setPassword(event.target.value); setFieldErrors((errors) => ({ ...errors, password: undefined })); }}
                    className="h-full min-w-0 flex-1 bg-transparent text-[15px] font-medium text-slate-900 outline-none placeholder:text-[#7c8799]"
                    placeholder="••••••••"
                    type={showPassword ? "text" : "password"}
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                  />
                  <button aria-label="Toggle password visibility" onClick={() => setShowPassword((value) => !value)} type="button">
                    <Eye className="h-5 w-5" />
                  </button>
                </span>
                {fieldErrors.password ? <span className="mt-1 block text-xs font-medium text-rose-600">{fieldErrors.password}</span> : null}
              </label>

              <div className="flex items-center justify-between pt-1">
                <button onClick={() => setRemember((value) => !value)} className="flex items-center gap-2.5 text-sm font-medium text-[#1d2636]" type="button">
                  <span className={`grid h-5 w-5 place-items-center rounded-md border transition ${remember ? "border-[#2289ee] bg-[#2289ee] text-white" : "border-slate-300 bg-white text-transparent"}`}>
                    <Check className="h-3.5 w-3.5 stroke-[3]" />
                  </span>
                  Keep me logged in
                </button>
              </div>

              <button
                className="flex h-[52px] w-full items-center justify-center gap-3 rounded-xl bg-[#218bf3] text-[16px] font-bold text-white shadow-[0_12px_20px_rgba(33,139,243,0.25)] transition hover:bg-[#0f7ee9] active:scale-[0.99] disabled:opacity-60"
                type="submit"
                disabled={loading}
              >
                {loading ? (mode === "login" ? "Logging in..." : "Creating Account...") : (mode === "login" ? "Login" : "Sign Up")}
                <ArrowRight className="h-5 w-5" />
              </button>
            </form>

            <div className="mt-4 text-center">
              {mode === "login" ? (
                <p className="text-sm text-[#667389]">
                  Don&apos;t have an account?{" "}
                  <button
                    type="button"
                    onClick={() => { setMode("register"); setError(""); setMessage(""); }}
                    className="font-bold text-[#1688f9] hover:underline"
                  >
                    Create Account
                  </button>
                </p>
              ) : (
                <p className="text-sm text-[#667389]">
                  Already have an account?{" "}
                  <button
                    type="button"
                    onClick={() => { setMode("login"); setError(""); setMessage(""); }}
                    className="font-bold text-[#1688f9] hover:underline"
                  >
                    Sign In
                  </button>
                </p>
              )}
            </div>

            {error ? <p className="mt-4 rounded-lg bg-rose-50 px-4 py-3 text-center text-sm font-medium text-rose-700">{error}</p> : null}
            {message ? <p className="mt-4 rounded-lg bg-emerald-50 px-4 py-3 text-center text-sm font-semibold text-emerald-700">{message}</p> : null}

            {/* Role-Based Separate Email & Password Quick Selector */}
            {mode === "login" && staffAccounts.length > 0 && (
              <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-extrabold text-slate-800">
                    <ShieldCheck className="h-4 w-4 text-blue-600" />
                    Role-Based Staff & Admin Logins ({staffAccounts.length})
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowRoleAccounts(!showRoleAccounts)}
                    className="text-[11px] font-bold text-blue-600 hover:underline"
                  >
                    {showRoleAccounts ? "Hide" : "Show Credentials"}
                  </button>
                </div>
                {showRoleAccounts && (
                  <div className="mt-2.5 max-h-48 space-y-1.5 overflow-y-auto pr-1">
                    {staffAccounts.map((acc) => (
                      <div
                        key={acc.id}
                        className="flex items-center justify-between gap-2 rounded-xl border border-slate-200/90 bg-white px-3 py-2 text-xs shadow-2xs transition hover:border-blue-300"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate font-extrabold text-slate-900">
                              {acc.name}
                            </span>
                            <span
                              className={`rounded px-1.5 py-0.2 text-[9px] font-extrabold ${
                                acc.role === "SUPER_ADMIN"
                                  ? "bg-violet-100 text-violet-800"
                                  : acc.role === "ADMIN"
                                  ? "bg-blue-100 text-blue-800"
                                  : acc.role === "MANAGER"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-amber-100 text-amber-800"
                              }`}
                            >
                              {acc.role}
                            </span>
                          </div>
                          <div className="truncate font-mono text-[11px] text-slate-500">
                            {acc.email} • Pwd: {acc.password || "Staff@123"}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setUserId(acc.email);
                            setPassword(acc.password || "Staff@123");
                            setError("");
                            setMessage(`Filled credentials for ${acc.name} (${acc.role}). Click Login!`);
                          }}
                          className="shrink-0 rounded-lg bg-blue-50 px-2.5 py-1.5 text-[11px] font-extrabold text-blue-700 hover:bg-blue-100 transition"
                        >
                          Use Login
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      </section>

      {/* Forgot Password Modal */}
      {forgotOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-[#071333]">Reset Your Password</h3>
            <p className="mt-1 text-sm text-[#596782]">
              Enter the email address associated with your account, and we will send you a secure password reset link.
            </p>

            <form onSubmit={handlePasswordReset} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#101b31] mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="agent@flyconnect.app"
                  className="w-full h-11 rounded-lg border border-[#cfd8e5] px-3 text-sm outline-none focus:border-[#1688f9] focus:ring-2 focus:ring-blue-100"
                />
              </div>

              {forgotErr ? <p className="rounded bg-rose-50 p-2 text-xs font-medium text-rose-700">{forgotErr}</p> : null}
              {forgotMsg ? <p className="rounded bg-emerald-50 p-2 text-xs font-semibold text-emerald-700">{forgotMsg}</p> : null}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setForgotOpen(false); setForgotErr(""); setForgotMsg(""); }}
                  className="h-10 px-4 text-sm font-semibold text-[#596782] hover:text-[#071333]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={forgotLoading}
                  className="h-10 rounded-lg bg-[#1688f9] px-5 text-sm font-bold text-white hover:bg-[#1270d1] disabled:opacity-60"
                >
                  {forgotLoading ? "Sending Link..." : "Send Reset Link"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </main>
  );
}
