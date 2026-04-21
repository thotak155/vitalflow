import { createVitalFlowServerClient } from "@vitalflow/auth/server";
import { Button, Card, CardContent, CardHeader, CardTitle, FormField, Input } from "@vitalflow/ui";
import { AlertCircle, HeartPulse } from "@vitalflow/ui/icons";
import NextLink from "next/link";
import { redirect } from "next/navigation";

interface ForgotPasswordSearchParams {
  error?: string;
}

async function requestReset(formData: FormData): Promise<void> {
  "use server";
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  if (!email || !email.includes("@")) {
    redirect(`/forgot-password?error=${encodeURIComponent("Enter a valid email")}`);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const supabase = await createVitalFlowServerClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${appUrl}/auth/callback?type=recovery`,
  });

  // Always show the same confirmation even if the email doesn't exist —
  // prevents account enumeration via timing/response differences.
  redirect(`/login?reset=sent`);
}

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<ForgotPasswordSearchParams>;
}) {
  const params = await searchParams;
  const error = params.error;

  return (
    <Card className="shadow-vf-md">
      <CardHeader className="items-center text-center">
        <div className="text-primary flex items-center gap-2">
          <HeartPulse className="h-6 w-6" aria-hidden />
          <span className="text-lg font-semibold tracking-tight">VitalFlow</span>
        </div>
        <CardTitle>Reset your password</CardTitle>
        <p className="text-muted-foreground text-sm">
          We&apos;ll email you a link to pick a new password.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <div
            role="alert"
            className="border-destructive/30 bg-destructive/5 text-foreground flex items-start gap-2 rounded-md border p-3 text-sm"
          >
            <AlertCircle className="text-destructive mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{error}</span>
          </div>
        ) : null}
        <form action={requestReset} className="space-y-4">
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
          <Button type="submit" className="w-full">
            Send reset link
          </Button>
        </form>
        <div className="text-center text-sm">
          <NextLink href="/login" className="text-primary hover:underline">
            Back to sign in
          </NextLink>
        </div>
      </CardContent>
    </Card>
  );
}
