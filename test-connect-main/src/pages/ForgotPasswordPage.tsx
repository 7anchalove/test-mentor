import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GraduationCap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";

const schema = z.object({
  email: z.string().trim().email("Invalid email address"),
});

const ForgotPasswordPage = () => {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const parsed = schema.safeParse({ email });
    if (!parsed.success) {
      toast({
        title: "Validation Error",
        description: parsed.error.errors[0].message,
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });
    setLoading(false);

    if (error) {
      const message = String(error.message || "").toLowerCase();
      const status = (error as { status?: number; code?: string }).status;
      const code = String((error as { status?: number; code?: string }).code || "").toLowerCase();
      const isRateLimited = message.includes("rate limit") || status === 429 || code === "429";

      if (isRateLimited) {
        toast({
          title: "Please try again later",
          description: "Too many reset requests. Please wait a few minutes and try again.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Could not send reset email",
        description: error.message,
        variant: "destructive",
      });
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
                <p className="text-sm text-muted-foreground">
                  If this email exists in our system, a password reset link has been sent.
                </p>
                <Link to="/auth">
                  <Button className="w-full">Back to Log In</Button>
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
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
