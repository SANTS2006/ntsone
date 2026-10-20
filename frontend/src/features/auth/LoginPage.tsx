import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { useAuth } from "@/app/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ApiError } from "@/lib/api";
import { usePageMeta } from "@/lib/seo";
import { AuthFeatures } from "./AuthFeatures";
import { showServerFieldErrors } from "@/lib/serverErrors";
import { GoogleAuth } from "./GoogleAuth";

const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Please enter your email address")
    .email("Enter a valid email address, like name@example.com"),
  password: z.string().min(1, "Please enter your password"),
});

type LoginForm = z.infer<typeof loginSchema>;

export function LoginPage() {
  usePageMeta({ title: "Sign in", description: "Sign in to manage your programs, registrations, ID cards and tickets.", index: true });
  const { user, login, isLoading } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = React.useState(false);
  const [showPassword, setShowPassword] = React.useState(false);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema), mode: "onTouched" });

  if (!isLoading && user) {
    return <Navigate to="/admin" replace />;
  }

  const onSubmit = async (values: LoginForm) => {
    setSubmitting(true);
    try {
      await login(values.email, values.password);
      navigate("/admin");
    } catch (err) {
      // "No account with this email" goes under the email box, "wrong password" under the password box.
      if (!showServerFieldErrors(err, ["email", "password"], setError)) toast.error(err instanceof ApiError ? err.message : "We could not sign you in. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main id="main-content" tabIndex={-1} className="page-enter flex min-h-screen items-center justify-center p-4 focus:outline-none sm:p-8">
      <div className="grid w-full max-w-4xl grid-cols-1 overflow-hidden rounded-[2rem] border border-border/60 bg-card shadow-2xl lg:min-h-[620px] lg:grid-cols-2">
        {/* Info panel */}
        <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-brand p-10 text-white lg:flex">
          <div className="pointer-events-none absolute inset-0 bg-gradient-radial-soft opacity-60" />

          <p className="relative max-w-[220px] text-xs text-white/70">
            Registrations, voting, orders and payments, made simple. One platform for everything you run.
          </p>

          <div className="relative flex flex-1 flex-col items-center justify-center gap-8 py-10">
            <div className="pointer-events-none absolute left-1/2 top-1/2 h-[380px] w-[380px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10" />
            <div className="pointer-events-none absolute left-1/2 top-1/2 h-[280px] w-[280px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10" />

            <AuthFeatures heading="Everything you run, on one platform" />
          </div>

          <p className="relative text-xs text-white/60">
            &copy; {new Date().getFullYear()} NTSOne. One platform. Endless possibilities.
          </p>
        </div>

        {/* Form panel */}
        <div className="flex flex-col p-6 sm:p-10 lg:p-12">
          <div className="flex items-center justify-between">
            <Link to="/" aria-label="NTSOne home" className="flex items-center gap-2 text-base font-semibold">
              <BrandLogo className="h-9" />
              <span className="gradient-text hidden whitespace-nowrap sm:inline">NTSOne</span>
            </Link>
            <ThemeToggle />
          </div>

          <div className="flex flex-1 items-center justify-center py-8">
            <div className="w-full max-w-sm">
              <div className="mb-8">
                <h2 className="text-3xl font-bold tracking-tight">Sign In</h2>
                <p className="mt-1 text-sm text-muted-foreground">Sign in to manage programs and registrations.</p>
              </div>

              <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="email" className="sr-only">
                    Email
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="Enter your email"
                    className="h-12 rounded-full px-5"
                    aria-invalid={errors.email ? true : undefined}
                    aria-describedby={errors.email ? "email-error" : undefined}
                    {...register("email")}
                  />
                  {errors.email && <p id="email-error" role="alert" className="px-2 text-sm text-destructive">{errors.email.message}</p>}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="password" className="sr-only">
                    Password
                  </Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder="Password"
                      className="h-12 rounded-full px-5 pr-12"
                      aria-invalid={errors.password ? true : undefined}
                    aria-describedby={errors.password ? "password-error" : undefined}
                    {...register("password")}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {errors.password && <p id="password-error" role="alert" className="px-2 text-sm text-destructive">{errors.password.message}</p>}
                  <Link to="/forgot-password" className="self-end px-2 text-sm font-medium text-primary hover:opacity-80">
                    Forgot password?
                  </Link>
                </div>
                <Button type="submit" loading={submitting} size="lg" className="mt-2 h-12 rounded-full">
                  {submitting ? "Signing in..." : "Sign in"}
                  {!submitting && <ArrowRight className="h-4 w-4" />}
                </Button>
              </form>

              <div className="mt-6">
                <GoogleAuth mode="signin" />
              </div>

              <p className="mt-6 text-center text-sm text-muted-foreground">
                Don&apos;t have an account?{" "}
                <Link to="/register" className="font-medium text-primary hover:opacity-80">
                  Create one
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
