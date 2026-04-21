import { createVitalFlowServerClient } from "@vitalflow/auth/server";
import { Button, Card, CardContent, CardHeader, CardTitle, FormField, Input } from "@vitalflow/ui";
import { AlertCircle, HeartPulse } from "@vitalflow/ui/icons";
import { redirect } from "next/navigation";

interface SetPasswordSearchParams {
  error?: string;
}

async function setInitialPassword(formData: FormData): Promise<void> {
  "use server";
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 12) {
    redirect(
      `/set-password?error=${encodeURIComponent("Password must be at least 12 characters")}`,
    );
  }
  if (password !== confirm) {
    redirect(`/set-password?error=${encodeURIComponent("Passwords don't match")}`);
  }

  const supabase = await createVitalFlowServerClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    redirect(`/set-password?error=${encodeURIComponent(error.message)}`);
  }

  // Session is already active from the invite callback; bounce into the app.
  redirect(`/`);
}

export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<SetPasswordSearchParams>;
}) {
  const params = await searchParams;
  const error = params.error;

  const supabase = await createVitalFlowServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    redirect(
      `/login?error=${encodeURIComponent("Invite link expired — ask your administrator to resend")}`,
    );
  }

  return (
    <Card className="shadow-vf-md">
      <CardHeader className="items-center text-center">
        <div className="text-primary flex items-center gap-2">
          <HeartPulse className="h-6 w-6" aria-hidden />
          <span className="text-lg font-semibold tracking-tight">VitalFlow</span>
        </div>
        <CardTitle>Welcome — set your password</CardTitle>
        <p className="text-muted-foreground text-sm">
          You&apos;re signed in as <span className="font-medium">{data.user.email}</span>. Pick a
          password to finish setting up your account.
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
        <form action={setInitialPassword} className="space-y-4">
          <FormField label="Password" htmlFor="password" required>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
            />
          </FormField>
          <FormField label="Confirm password" htmlFor="confirm" required>
            <Input
              id="confirm"
              name="confirm"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
            />
          </FormField>
          <Button type="submit" className="w-full">
            Set password and continue
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
