import { Switch, Route, Router as WouterRouter, Redirect, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./lib/auth-context";
import { useAuth } from "./lib/use-auth";
import { Landing } from "./pages/Landing";
import { AppLogin } from "./pages/AppLogin";
import { Docs } from "./pages/Docs";
import { SdrAtendimento } from "./pages/SdrAtendimento";
import { SdrContatos } from "./pages/SdrContatos";
import { SdrTags } from "./pages/SdrTags";
import { SdrConexao } from "./pages/SdrConexao";
import { SdrMeuPlano } from "./pages/SdrMeuPlano";
import { SdrAgente } from "./pages/SdrAgente";
import { SdrFollowup } from "./pages/SdrFollowup";
import { SdrEquipe } from "./pages/SdrEquipe";
import { SdrDashboard } from "./pages/SdrDashboard";
import { SdrFunil } from "./pages/SdrFunil";
import { SdrVendas } from "./pages/SdrVendas";
import { SdrCalls } from "./pages/SdrCalls";
import { SdrAdquirentes } from "./pages/SdrAdquirentes";
import { CallRoom } from "./pages/CallRoom";
import { Tutorials } from "./pages/Tutorials";
import { AdminDashboard } from "./pages/admin/AdminDashboard";
import { AdminUsers } from "./pages/admin/AdminUsers";
import { AdminSubscribers } from "./pages/admin/AdminSubscribers";
import { AdminOrders } from "./pages/admin/AdminOrders";
import { AdminTutorials } from "./pages/admin/AdminTutorials";
import { PixPage } from "./pages/PixPage";

const queryClient = new QueryClient();

function isAppDomain(): boolean {
  const h = window.location.hostname;
  return (
    h === "app.combozap.com" ||
    h === "localhost" ||
    h.endsWith(".replit.dev") ||
    h.endsWith(".replit.app") ||
    h.endsWith(".riker.replit.dev") ||
    h.endsWith(".picard.replit.dev")
  );
}

function Loading() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#fff" }}>
      <div style={{ textAlign: "center" }}>
        <img src="/combozap-logo.png" alt="ComboZap" style={{ height: 36, marginBottom: 12 }} />
        <div style={{ fontSize: 14, color: "#6b7280" }}>Carregando…</div>
      </div>
    </div>
  );
}

function AppRoutes() {
  const { user, loading, isAdmin } = useAuth();
  const [location] = useLocation();

  if (location === "/docs") return <Docs />;

  // Public PIX payment page — no auth required
  if (location.startsWith("/pix/")) return <PixPage />;

  // Public video call room — no auth required (guests join with just a name)
  if (location.startsWith("/call/")) return <CallRoom />;

  if (loading) return <Loading />;

  if (location === "/login" || location === "/register") {
    if (user) return <Redirect to={isAdmin ? "/admin/dashboard" : "/dashboard"} />;
    return <AppLogin defaultTab={location === "/register" ? "register" : "login"} />;
  }

  if (!user) {
    if (isAppDomain()) return <Redirect to="/login" />;
    return <Landing />;
  }

  if (location.startsWith("/admin")) {
    if (!isAdmin) return <Redirect to="/sdr/atendimento" />;
    return (
      <Switch>
        <Route path="/admin/dashboard"   component={AdminDashboard} />
        <Route path="/admin/tutoriais"   component={AdminTutorials} />
        <Route path="/admin/usuarios"    component={AdminUsers} />
        <Route path="/admin/assinantes"  component={AdminSubscribers} />
        <Route path="/admin/pedidos"     component={AdminOrders} />
        <Route>{() => <Redirect to="/admin/dashboard" />}</Route>
      </Switch>
    );
  }

  if (isAdmin && !location.startsWith("/sdr")) {
    return <Redirect to="/admin/dashboard" />;
  }

  return (
    <Switch>
      <Route path="/dashboard">
        {() => <Redirect to={isAdmin ? "/admin/dashboard" : "/sdr/atendimento"} />}
      </Route>

      <Route path="/sdr/dashboard"     component={SdrDashboard} />
      <Route path="/sdr/atendimento"   component={SdrAtendimento} />
      <Route path="/sdr/contatos"      component={SdrContatos} />
      <Route path="/sdr/tags"          component={SdrTags} />
      <Route path="/sdr/conexao"       component={SdrConexao} />
      <Route path="/sdr/meu-plano"     component={SdrMeuPlano} />
      <Route path="/sdr/agente"        component={SdrAgente} />
      <Route path="/sdr/followup"      component={SdrFollowup} />
      <Route path="/sdr/funil"         component={SdrFunil} />
      <Route path="/sdr/vendas"        component={SdrVendas} />
      <Route path="/sdr/calls"         component={SdrCalls} />
      <Route path="/sdr/adquirentes"   component={SdrAdquirentes} />
      <Route path="/sdr/tutoriais"     component={Tutorials} />
      <Route path="/sdr/equipe/cargos" component={SdrEquipe} />
      <Route path="/sdr/equipe/time"   component={SdrEquipe} />
      <Route path="/sdr/equipe">
        {() => <Redirect to="/sdr/equipe/cargos" />}
      </Route>

      <Route component={SdrAtendimento} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <WouterRouter>
          <AppRoutes />
        </WouterRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
