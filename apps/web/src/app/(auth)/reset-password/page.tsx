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
import { redirect } from "next/navigation";

interface ResetPasswordSearchParams {
  error?: string;
}

async function updatePassword(formData: FormData): Promise<void> {
  "use server";
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 12) {
    redirect(`/reset-password?error=${encodeURIComponent("Password must be at least 12 characters")}`);
  }
  if (password !== confirm) {
    redirect(`/reset-password?error=${encodeURIComponent("Passwords don't match")}`);
  }

  const supabase = await createVitalFlowServerClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    redirect(`/reset-password?error=${encodeURIComponent(error.message)}`);
  }

  await supabase.auth.signOut();
  redirect(`/login?reset=done`);
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<ResetPasswordSearchParams>;
}) {
  const params = await searchParams;
  const error = params.error;

  const supabase = await createVitalFlowServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    redirect(`/login?error=${encodeURIComponent("Reset link expired — request a new one")}`);
  }

  return (
    <Card className="shadow-vf-md">
      <CardHeader className="items-center text-center">
        <div className="flex items-center gap-2 text-primary">
          <HeartPulse className="h-6 w-6" aria-hidden />
          <span className="text-lg font-semibold tracking-tight">VitalFlow</span>
        </div>
        <CardTitle>Choose a new password</CardTitle>
        <p className="text-sm text-muted-foreground">
          At least 12 characters. Use something you don&apos;t use elsewhere.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-foreground"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
            <span>{error}</span>
          </div>
        ) : null}
        <form action={updatePassword} className="space-y-4">
          <FormField label="New password" htmlFor="password" required>
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
            Update password
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
