import { Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AdminDashboard } from "./pages/AdminDashboard";
import { AdminTenantsPage } from "./pages/AdminTenantsPage";
import {
  ChangePasswordPage,
  InvitePage,
  LoginPage,
  RecoverPage,
} from "./pages/AuthPages";
import { PublicHome } from "./pages/PublicHome";
import { PrivacyPage } from "./pages/PrivacyPage";
import { SystemSalesPage } from "./pages/SystemSalesPage";
import { TenantDashboard } from "./pages/TenantDashboard";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<PublicHome />} />
      <Route path="/sistema" element={<SystemSalesPage />} />
      <Route path="/privacidade" element={<PrivacyPage />} />
      <Route path="/entrar" element={<LoginPage />} />
      <Route
        path="/proprietario/entrar"
        element={<LoginPage portal="owner" />}
      />
      <Route path="/recuperar-senha" element={<RecoverPage />} />
      <Route path="/convite" element={<InvitePage />} />
      <Route path="/alterar-senha" element={<ChangePasswordPage />} />
      <Route element={<ProtectedRoute role="tenant" />}>
        <Route path="/inquilino/*" element={<TenantDashboard />} />
      </Route>
      <Route element={<ProtectedRoute role="admin" />}>
        <Route
          path="/proprietario"
          element={<Navigate to="/admin" replace />}
        />
        <Route path="/admin/inquilinos" element={<AdminTenantsPage />} />
        <Route path="/admin/*" element={<AdminDashboard />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
