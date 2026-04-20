import { createVitalFlowServerClient } from "@vitalflow/auth/server";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  FormField,
  Input,
} from "@vitalflow/ui";
import { AlertCircle, HeartPulse } from "@vitalflow/ui/icons";
import NextLink from "next/link";
import { redirect } from "next/navigation";

interface LoginSearchParams {
  next?: string;
  error?: string;
  reset?: string;
}

async function signIn(formData: FormData): Promise<void> {
  "use server";
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(String(formData.get("next") ?? ""));

  if (!email || !email.includes("@") || !password) {
    redirect(`/login?error=${encodeURIComponent("Enter your email and password")}`);
  }

  const supabase = await createVitalFlowServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/login?error=${encodeURIComponent("Invalid email or password")}`);
  }
  redirect(next);
}

function safeNext(raw: string): string {
  return raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<LoginSearchParams>;
}) {
  const params = await searchParams;
  const error = params.error;
  const resetSent = params.reset === "sent";
  const passwordChanged = params.reset === "done";
  const next = safeNext(params.next ?? "/");

  return (
    <Card className="shadow-vf-md">
      <CardHeader className="items-center text-center">
        <div className="flex items-center gap-2 text-primary">
          <HeartPulse className="h-6 w-6" aria-hidden />
          <span className="text-lg font-semibold tracking-tight">VitalFlow</span>
        </div>
        <CardTitle>Sign in</CardTitle>
        <p className="text-sm text-muted-foreground">
          Use the credentials your administrator set up for you.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {resetSent ? (
          <div
            role="status"
            className="rounded-md border border-success/30 bg-success/5 p-3 text-sm"
          >
            If an account exists for that email, we sent a password reset link.
          </div>
        ) : null}
        {passwordChanged ? (
          <div
            role="status"
            className="rounded-md border border-success/30 bg-success/5 p-3 text-sm"
          >
            Password updated. Sign in with your new password.
          </div>
        ) : null}
        {error ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-foreground"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
            <span>{error}</span>
          </div>
        ) : null}
        <form action={signIn} className="space-y-4">
          <input type="hidden" name="next" value={next} />
          <FormField label="Email" htmlFor="email" required>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
            />
          </FormField>
          <FormField label="Password" htmlFor="password" required>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              minLength={12}
            />
          </FormField>
          <Button type="submit" className="w-full">
            Sign in
          </Button>
        </form>
        <div className="text-center text-sm">
          <NextLink href="/forgot-password" className="text-primary hover:underline">
            Forgot your password?
          </NextLink>
        </div>
      </CardContent>
    </Card>
  );
}
