import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: "student" | "teacher";
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, requiredRole }) => {
  const { user, profile, loading } = useAuth();
  const location = useLocation();

  const getHomeRouteForRole = (role: AppRole) => {
    if (role === "admin") return "/admin";
    if (role === "teacher") return "/dashboard";
    if (role === "student") return "/choose-test";
    return null;
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  if (!profile) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle>Profile not available</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            We could not load your profile. Please sign out and sign in again.
          </CardContent>
        </Card>
      </div>
    );
  }

  if (profile.role === "admin" && !location.pathname.startsWith("/admin")) {
    return <Navigate to="/admin" replace />;
  }

  if (requiredRole && profile.role !== requiredRole) {
    const destination = getHomeRouteForRole(profile.role);
    if (destination) return <Navigate to={destination} replace />;

    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle>Unsupported account role</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Your account role is not recognized by this app build.
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;
