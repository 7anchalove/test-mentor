import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";

import Index from "./pages/Index";
import AuthPage from "./pages/AuthPage";
import ChooseTestPage from "./pages/student/ChooseTestPage";
import PickDateTimePage from "./pages/student/PickDateTimePage";
import TeachersPage from "./pages/student/TeachersPage";
import ChatPage from "./pages/ChatPage";
import ConversationsPage from "./pages/ConversationsPage";
import TeacherDashboard from "./pages/teacher/TeacherDashboard";
import AvailabilityPage from "./pages/teacher/AvailabilityPage";
import NotFound from "./pages/NotFound";
import AvailabilityTestPage from "./pages/dev/AvailabilityTestPage";

const queryClient = new QueryClient();
const isDev = import.meta.env.DEV;

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/student" element={<Navigate to="/auth" replace />} />
            <Route path="/teacher" element={<Navigate to="/auth" replace />} />

            {/* Student routes */}
            <Route path="/choose-test" element={<ProtectedRoute requiredRole="student"><ChooseTestPage /></ProtectedRoute>} />
            <Route path="/pick-datetime" element={<ProtectedRoute requiredRole="student"><PickDateTimePage /></ProtectedRoute>} />
            <Route path="/teachers" element={<ProtectedRoute requiredRole="student"><TeachersPage /></ProtectedRoute>} />

            {/* Teacher routes */}
            <Route path="/dashboard" element={<ProtectedRoute requiredRole="teacher"><TeacherDashboard /></ProtectedRoute>} />
            <Route path="/availability" element={<ProtectedRoute requiredRole="teacher"><AvailabilityPage /></ProtectedRoute>} />

            {/* Shared routes */}
            <Route path="/conversations" element={<ProtectedRoute><ConversationsPage /></ProtectedRoute>} />
            <Route path="/chat/:conversationId" element={<ProtectedRoute><ChatPage /></ProtectedRoute>} />

            {isDev && <Route path="/dev/availability-test" element={<AvailabilityTestPage />} />}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
