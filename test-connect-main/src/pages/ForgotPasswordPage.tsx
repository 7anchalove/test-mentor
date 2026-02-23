import { useState } from "react";
import { Link } from "react-router-dom";
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
    const response = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: parsed.data.email }),
    });

    const payload = (await response.json().catch(() => null)) as
      | { ok?: boolean; message?: string }
      | null;
    setLoading(false);

    if (!response.ok) {
      if (response.status === 429) {
        toast({
          title: "Please try again later",
          description:
            payload?.message ??
            "Too many reset requests. Please wait a minute and try again.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Could not send reset email",
        description: payload?.message ?? "Please try again.",
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
