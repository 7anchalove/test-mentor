import { useQuery } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";

import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

interface AdminRouteProps {
  children: React.ReactNode;
}

const AdminRoute: React.FC<AdminRouteProps> = ({ children }) => {
  const { user, loading } = useAuth();

  const { data: role, isLoading } = useQuery({
    queryKey: ["admin-route-role", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("user_id", user!.id)
        .single();

      if (error) throw error;
      return String(data.role ?? "");
    },
  });

  if (loading || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  if (role !== "admin") return <Navigate to="/" replace />;

  return <>{children}</>;
};

export default AdminRoute;