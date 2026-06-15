import { createContext, useEffect, useState, type ReactNode } from "react";
import {
  auth, googleProvider,
  signInWithPopup, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, updateProfile, signOut,
} from "./firebase";

export type PermLevel = "none" | "view" | "edit";
export interface RolePermissions {
  atendimento: PermLevel;
  contatos: PermLevel;
  tags: PermLevel;
  disparo: PermLevel;
  conexao: PermLevel;
  plano: PermLevel;
  agentes: PermLevel;
  funil: PermLevel;
  respostas: PermLevel;
}

export interface User {
  id: number;
  email: string;
  name: string;
  role: string;
  plan: string;
  isAdmin: boolean;
  teamMemberId?: number;
  teamMemberName?: string;
  teamMemberEmail?: string;
  permissions?: RolePermissions;
}

export interface AuthCtx {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  register: (name: string, email: string, whatsapp: string, password: string, confirmPassword: string, acceptTerms: boolean) => Promise<void>;
  logout: () => Promise<void>;
  isTeamMember: boolean;
  isAdmin: boolean;
  can: (section: keyof RolePermissions, level?: PermLevel) => boolean;
}

export const AuthContext = createContext<AuthCtx | null>(null);

async function apiFetch(path: string, body?: unknown): Promise<any> {
  const r = await fetch(path, {
    method: body ? "POST" : "GET",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error ?? "Erro na requisição");
  return data;
}

async function firebaseSync(idToken: string, extra?: { name?: string; whatsapp?: string }) {
  return apiFetch("/api/auth/firebase-sync", { idToken, ...extra });
}

const PERM_ORDER: Record<PermLevel, number> = { none: 0, view: 1, edit: 2 };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/auth/me")
      .then((data) => setUser(data))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const idToken = await cred.user.getIdToken();
      const data = await firebaseSync(idToken);
      setUser(data.user);
    } catch (firebaseErr: any) {
      const code = firebaseErr?.code ?? "";
      if (code === "auth/user-not-found" || code === "auth/invalid-credential" || code === "auth/wrong-password") {
        const data = await apiFetch("/api/auth/login", { email, password });
        setUser(data.user);
      } else {
        const msg = code === "auth/invalid-email" ? "E-mail inválido"
          : code === "auth/too-many-requests" ? "Muitas tentativas. Tente mais tarde."
          : firebaseErr?.message ?? "E-mail ou senha incorretos";
        throw new Error(msg);
      }
    }
  };

  const loginWithGoogle = async () => {
    const cred = await signInWithPopup(auth, googleProvider);
    const idToken = await cred.user.getIdToken();
    const data = await firebaseSync(idToken, { name: cred.user.displayName ?? "" });
    setUser(data.user);
  };

  const register = async (
    name: string, email: string, whatsapp: string,
    password: string, confirmPassword: string, acceptTerms: boolean
  ) => {
    if (password !== confirmPassword) throw new Error("Senhas não coincidem");
    if (!acceptTerms) throw new Error("Aceite os termos de uso");
    if (password.length < 8) throw new Error("Senha deve ter ao menos 8 caracteres");

    let idToken: string;
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName: name });
      idToken = await cred.user.getIdToken();
    } catch (err: any) {
      const code = err?.code ?? "";
      const msg = code === "auth/email-already-in-use" ? "E-mail já está em uso"
        : code === "auth/weak-password" ? "Senha muito fraca"
        : code === "auth/invalid-email" ? "E-mail inválido"
        : err?.message ?? "Erro ao criar conta";
      throw new Error(msg);
    }

    const data = await firebaseSync(idToken, { name, whatsapp });
    setUser(data.user);
  };

  const logout = async () => {
    await signOut(auth).catch(() => {});
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
    setUser(null);
    window.location.href = "/login";
  };

  const isTeamMember = !!user?.teamMemberId;
  const isAdmin = user?.isAdmin === true;

  const can = (section: keyof RolePermissions, level: PermLevel = "view"): boolean => {
    if (!user) return false;
    if (!isTeamMember) return true;
    const perms = user.permissions;
    if (!perms) return false;
    return PERM_ORDER[perms[section] ?? "none"] >= PERM_ORDER[level];
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, loginWithGoogle, register, logout, isTeamMember, isAdmin, can }}>
      {children}
    </AuthContext.Provider>
  );
}
