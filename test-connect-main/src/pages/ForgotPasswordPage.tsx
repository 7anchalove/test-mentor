import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GraduationCap, MailCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { FormError } from "@/components/ui/form-error";
import { z } from "zod";

const schema = z.object({
  email: z.string().trim().email("Invalid email address"),
});

const ForgotPasswordPage = () => {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const parsed = schema.safeParse({ email });
    if (!parsed.success) {
      setFormError(parsed.error.errors[0].message);
      return;
    }

    setLoading(true);
    const baseUrl = window.location.origin;

    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo: `${baseUrl}/auth/reset-password`,
    });
    setLoading(false);

    if (error) {
      const message = String(error.message || "").toLowerCase();
      const status = (error as { status?: number; code?: string }).status;
      const code = String((error as { status?: number; code?: string }).code || "").toLowerCase();
      const isRateLimited = message.includes("rate limit") || status === 429 || code === "429";

      if (isRateLimited) {
        setFormError("Too many reset requests. Please wait a minute and try again.");
        return;
      }

      setFormError(error.message);
      return;
    }

    setSent(true);
    toast({
      title: "Reset email sent",
      description: "Check your inbox for the password reset link.",
    });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl gradient-hero">
            <GraduationCap className="h-7 w-7 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold font-display text-foreground">Forgot Password</h1>
          <p className="mt-2 text-muted-foreground">We’ll email you a secure reset link.</p>
        </div>

        <Card className="glass-card">
          <CardHeader>
            <CardTitle>Reset your password</CardTitle>
            <CardDescription>Enter your account email address.</CardDescription>
          </CardHeader>
          <CardContent>
            {sent ? (
              <div className="space-y-4">
                <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950/40">
                  <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
                  <div>
                    <p className="text-sm font-medium text-green-700 dark:text-green-400">Check your inbox</p>
                    <p className="text-sm text-muted-foreground">
                      If this email exists in our system, a password reset link has been sent.
                    </p>
                  </div>
                </div>
                <Link to="/auth">
                  <Button className="w-full">Back to Log In</Button>
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <FormError message={formError} />
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setFormError(null); }}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Sending..." : "Send reset link"}
                </Button>
                <Link to="/auth" className="block text-center text-sm text-primary hover:underline">
                  Back to Log In
                </Link>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ForgotPasswordPage;
