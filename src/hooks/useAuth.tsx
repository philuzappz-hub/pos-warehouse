// src/hooks/useAuth.tsx
import { supabase } from "@/integrations/supabase/client";
import { Profile } from "@/types/profiles";
import { Session, User } from "@supabase/supabase-js";
import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type AppRole = "admin" | "cashier" | "warehouse" | "staff";

const VALID_ROLES: AppRole[] = ["admin", "cashier", "warehouse", "staff"];
const isAppRole = (v: any): v is AppRole => VALID_ROLES.includes(v);

// ✅ company row used for app-wide branding + PDFs
export type CompanyMini = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  tax_id: string | null;
  receipt_footer: string | null;
  logo_url: string | null; // either public URL OR private storage path
};

// ✅ branch mini for switcher + labels
export type BranchMini = {
  id: string;
  name: string;
};

interface AuthContextType {
  user: User | null;
  session: Session | null;

  profile: Profile | null;
  roles: AppRole[];

  // ✅ company branding (best practice)
  company: CompanyMini | null;
  companyName: string | null; // backward compatibility
  companyLogoUrl: string | null; // derived display url (public or signed)

  branchId: string | null;
  branchName: string | null;

  // ✅ admin active branch context
  activeBranchId: string | null;
  activeBranchName: string | null;
  branches: BranchMini[];
  refreshBranches: () => Promise<BranchMini[]>;

  setActiveBranchId: (branchId: string | null) => void;

  loading: boolean;

  signIn: (
    email: string,
    password: string
  ) => Promise<{ error: Error | null; needsCompanySetup?: boolean }>;

  signUp: (
    email: string,
    password: string,
    fullName: string
  ) => Promise<{ error: Error | null; needsCompanySetup?: boolean }>;

  signOut: () => Promise<void>;

  hasRole: (role: AppRole) => boolean;
  isAdmin: boolean;
  isCashier: boolean;
  isWarehouse: boolean;

  isAttendanceManager: boolean;
  isReturnsHandler: boolean;

  refreshProfile: () => Promise<Profile | null>;
  refreshCompany: () => Promise<CompanyMini | null>;

  createEmployee: (
    email: string,
    password: string,
    fullName: string,
    opts?: {
      phone?: string | null;
      role?: AppRole;
      branchId?: string | null;
    }
  ) => Promise<{ error: Error | null; userId?: string }>;

  deleteEmployee: (
    userId: string,
    opts?: { mode?: "soft" | "hard"; reason?: string | null }
  ) => Promise<{ error: Error | null; ok?: boolean }>;

  repairMissingCompanyId: () => Promise<{ error: Error | null; repaired?: number }>;

  updateEmployeeRoleBranch: (
    userId: string,
    role: AppRole,
    branchId: string
  ) => Promise<{ error: Error | null; ok?: boolean }>;

  setEmployeeFlag: (
    userId: string,
    field: "is_attendance_manager" | "is_returns_handler",
    value: boolean
  ) => Promise<{ error: Error | null; ok?: boolean }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const ADMIN_ACTIVE_BRANCH_KEY = "admin_active_branch_id";

const LOADING_WATCHDOG_MS = 8000;

// ✅ profile cache + retries
const PROFILE_CACHE_KEY = "cached_profile_v1";
const PROFILE_CACHE_USER_KEY = "cached_profile_user_id_v1";
const PROFILE_FETCH_RETRIES = 3;

// ✅ company cache (full row + signed url + expiry)
const COMPANY_CACHE_KEY = "cached_company_v1";
const COMPANY_CACHE_USER_KEY = "cached_company_user_id_v1";
const COMPANY_LOGO_URL_CACHE_KEY = "cached_company_logo_url_v1";
const COMPANY_LOGO_URL_EXPIRES_AT_KEY = "cached_company_logo_expires_at_v1";

const LOGO_BUCKET = "company-logos";
const SIGNED_URL_TTL = 60 * 60 * 24; // 24 hours

function isHttpUrl(v: string) {
  return /^https?:\/\//i.test(v || "");
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let t: number | undefined;

  const timeoutPromise = new Promise<T>((_, reject) => {
    t = window.setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (t) window.clearTimeout(t);
  });
}

function getProjectRefFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    return u.hostname.split(".")[0] ?? null;
  } catch {
    return null;
  }
}

function getTokenIssuerProjectRef(accessToken: string): string | null {
  try {
    const payloadPart = accessToken.split(".")[1];
    if (!payloadPart) return null;
    const json = JSON.parse(atob(payloadPart));
    const iss = json?.iss as string | undefined;
    if (!iss) return null;
    const u = new URL(iss);
    return u.hostname.split(".")[0] ?? null;
  } catch {
    return null;
  }
}

function getAnonKeyFromEnv(): string | null {
  return (
    (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ||
    (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ||
    (import.meta.env.VITE_SUPABASE_PUBLIC_ANON_KEY as string | undefined) ||
    null
  );
}

function getSupabaseUrlFromEnv(): string | null {
  return (
    (import.meta.env.VITE_SUPABASE_URL as string | undefined) ||
    (import.meta.env.VITE_PUBLIC_SUPABASE_URL as string | undefined) ||
    null
  );
}

/**
 * ✅ NEW:
 * Always prefer a stable public site URL for auth emails.
 * - On localhost, `window.location.origin` = http://localhost:8081 (bad for opening on phone)
 * - On Vercel, use VITE_SITE_URL = https://pos-warehouse.vercel.app
 */
function getSiteUrl(): string {
  const env =
    (import.meta.env.VITE_SITE_URL as string | undefined) ||
    (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined) ||
    (import.meta.env.VITE_APP_URL as string | undefined) ||
    "";

  const v = String(env || "").trim().replace(/\/+$/, "");
  if (v && /^https?:\/\//i.test(v)) return v;

  // fallback: current origin (works for pure web testing on same device)
  return window.location.origin;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  const [branchNameState, setBranchNameState] = useState<string | null>(null);

  // ✅ company data in one place
  const [company, setCompany] = useState<CompanyMini | null>(null);
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string | null>(null);

  // ✅ keep companyName for existing components
  const companyName = company?.name ?? null;

  // ✅ branches (for admin switcher + label)
  const [branchesState, setBranchesState] = useState<BranchMini[]>([]);
  const [activeBranchNameState, setActiveBranchNameState] = useState<string | null>(null);

  const fetchSeq = useRef(0);
  const mountedRef = useRef(true);
  const lastFetchedUserIdRef = useRef<string | null>(null);

  // ✅ NEW: stable company_id + remember last loaded company for branches
  const companyIdFromProfile = (profile as any)?.company_id ?? null;

  const watchdogRef = useRef<number | null>(null);
  const kickWatchdog = () => {
    if (watchdogRef.current) window.clearTimeout(watchdogRef.current);
    watchdogRef.current = window.setTimeout(() => {
      console.warn("[useAuth] Watchdog fired: forcing loading=false");
      if (mountedRef.current) setLoading(false);
    }, LOADING_WATCHDOG_MS);
  };
  const stopWatchdog = () => {
    if (watchdogRef.current) window.clearTimeout(watchdogRef.current);
    watchdogRef.current = null;
  };

  const safeSetProfile = (p: Profile | null) => mountedRef.current && setProfile(p);
  const safeSetRoles = (r: AppRole[]) => mountedRef.current && setRoles(r);
  const safeSetBranchName = (n: string | null) => mountedRef.current && setBranchNameState(n);
  const safeSetLoading = (v: boolean) => mountedRef.current && setLoading(v);
  const safeSetUser = (u: User | null) => mountedRef.current && setUser(u);
  const safeSetSession = (s: Session | null) => mountedRef.current && setSession(s);

  const safeSetCompany = (c: CompanyMini | null) => mountedRef.current && setCompany(c);
  const safeSetCompanyLogoUrl = (u: string | null) => mountedRef.current && setCompanyLogoUrl(u);

  const safeSetBranches = (b: BranchMini[]) => mountedRef.current && setBranchesState(b);
  const safeSetActiveBranchName = (n: string | null) =>
    mountedRef.current && setActiveBranchNameState(n);

  const branchId = (profile as any)?.branch_id ?? null;
  const branchName = branchNameState;

  const [activeBranchIdState, setActiveBranchIdState] = useState<string | null>(null);
  const safeSetActiveBranch = (v: string | null) =>
    mountedRef.current && setActiveBranchIdState(v);

  const isAdmin = useMemo(() => {
    return roles.includes("admin") || (profile as any)?.is_admin === true;
  }, [roles, profile]);

  const isCashier = useMemo(() => roles.includes("cashier"), [roles]);
  const isWarehouse = useMemo(() => roles.includes("warehouse"), [roles]);

  const isAttendanceManager = (profile as any)?.is_attendance_manager || false;
  const isReturnsHandler = (profile as any)?.is_returns_handler || false;

  const setActiveBranchId = (newBranchId: string | null) => {
    if (!isAdmin) return;

    safeSetActiveBranch(newBranchId);

    if (!newBranchId) safeSetActiveBranchName(null);
    else {
      const maybe = branchesState.find((b) => b.id === newBranchId)?.name ?? null;
      if (maybe) safeSetActiveBranchName(maybe);
    }

    if (newBranchId) localStorage.setItem(ADMIN_ACTIVE_BRANCH_KEY, newBranchId);
    else localStorage.removeItem(ADMIN_ACTIVE_BRANCH_KEY);
  };

  const activeBranchId = useMemo(() => {
    if (isAdmin) return activeBranchIdState;
    return branchId;
  }, [isAdmin, activeBranchIdState, branchId]);

  const applyProfileState = (p: any) => {
    const prof = (p as unknown as Profile | null) ?? null;
    safeSetProfile(prof);

    if (prof?.role && isAppRole(prof.role)) safeSetRoles([prof.role]);
    else if (p?.is_admin === true) safeSetRoles(["admin"]);
    else safeSetRoles([]);

    const saved = localStorage.getItem(ADMIN_ACTIVE_BRANCH_KEY);
    const adminNow = (prof?.role && prof.role === "admin") || p?.is_admin === true;

    if (adminNow) safeSetActiveBranch(saved || null);
    else safeSetActiveBranch(null);
  };

  // -----------------------
  // ✅ Cache helpers
  // -----------------------
  const readCachedProfile = (userId: string): Profile | null => {
    try {
      const cachedUserId = localStorage.getItem(PROFILE_CACHE_USER_KEY);
      if (cachedUserId !== userId) return null;

      const raw = localStorage.getItem(PROFILE_CACHE_KEY);
      if (!raw) return null;

      return JSON.parse(raw) as Profile;
    } catch {
      return null;
    }
  };

  const writeCachedProfile = (userId: string, p: any) => {
    try {
      localStorage.setItem(PROFILE_CACHE_USER_KEY, userId);
      localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(p));
    } catch {}
  };

  const clearCachedProfile = () => {
    try {
      localStorage.removeItem(PROFILE_CACHE_USER_KEY);
      localStorage.removeItem(PROFILE_CACHE_KEY);
    } catch {}
  };

  const readCachedCompany = (userId: string): CompanyMini | null => {
    try {
      const cachedUserId = localStorage.getItem(COMPANY_CACHE_USER_KEY);
      if (cachedUserId !== userId) return null;

      const raw = localStorage.getItem(COMPANY_CACHE_KEY);
      if (!raw) return null;

      return JSON.parse(raw) as CompanyMini;
    } catch {
      return null;
    }
  };

  const writeCachedCompany = (userId: string, c: CompanyMini | null) => {
    try {
      localStorage.setItem(COMPANY_CACHE_USER_KEY, userId);
      if (c) localStorage.setItem(COMPANY_CACHE_KEY, JSON.stringify(c));
      else localStorage.removeItem(COMPANY_CACHE_KEY);
    } catch {}
  };

  const readCachedCompanyLogoUrl = (userId: string): string | null => {
    try {
      const cachedUserId = localStorage.getItem(COMPANY_CACHE_USER_KEY);
      if (cachedUserId !== userId) return null;

      const url = localStorage.getItem(COMPANY_LOGO_URL_CACHE_KEY);
      const expRaw = localStorage.getItem(COMPANY_LOGO_URL_EXPIRES_AT_KEY);
      const exp = expRaw ? Number(expRaw) : 0;

      if (!url) return null;
      if (!exp) return url;

      if (Date.now() > exp) return null;
      return url;
    } catch {
      return null;
    }
  };

  const writeCachedCompanyLogoUrl = (userId: string, url: string | null, expiresAtMs?: number) => {
    try {
      localStorage.setItem(COMPANY_CACHE_USER_KEY, userId);
      if (url) localStorage.setItem(COMPANY_LOGO_URL_CACHE_KEY, url);
      else localStorage.removeItem(COMPANY_LOGO_URL_CACHE_KEY);

      if (expiresAtMs) localStorage.setItem(COMPANY_LOGO_URL_EXPIRES_AT_KEY, String(expiresAtMs));
      else localStorage.removeItem(COMPANY_LOGO_URL_EXPIRES_AT_KEY);
    } catch {}
  };

  const clearCachedCompany = () => {
    try {
      localStorage.removeItem(COMPANY_CACHE_USER_KEY);
      localStorage.removeItem(COMPANY_CACHE_KEY);
      localStorage.removeItem(COMPANY_LOGO_URL_CACHE_KEY);
      localStorage.removeItem(COMPANY_LOGO_URL_EXPIRES_AT_KEY);
    } catch {}
  };

  const buildFallbackProfile = (userId: string): Profile => {
    const fullNameFromMeta =
      (user as any)?.user_metadata?.full_name ??
      (session as any)?.user?.user_metadata?.full_name ??
      (user as any)?.email ??
      "User";

    return {
      id: userId as any,
      user_id: userId as any,
      full_name: String(fullNameFromMeta),
      phone: null as any,
      role: null as any,
      is_admin: false as any,
      company_id: null as any,
      branch_id: null as any,
      avatar_url: null as any,
      staff_code: null as any,
      is_attendance_manager: false as any,
      is_returns_handler: false as any,
      created_at: null as any,
      updated_at: null as any,
      deleted_at: null as any,
      deleted_by: null as any,
      deleted_reason: null as any,
    } as unknown as Profile;
  };

  // ✅ staff branch name (their assigned branch)
  const fetchBranchName = async (bId: string | null) => {
    if (!bId) {
      safeSetBranchName(null);
      return;
    }

    try {
      const queryPromise = Promise.resolve(
        supabase.from("branches").select("name").eq("id", bId).maybeSingle()
      );

      const { data, error } = await withTimeout(queryPromise, 2500, "fetchBranchName");
      if (error) throw error;

      safeSetBranchName((data as any)?.name ?? null);
    } catch (e) {
      console.warn("[useAuth] branch name fetch failed:", e);
      safeSetBranchName(null);
    }
  };

  // ✅ admin selected branch name (activeBranchId)
  const fetchActiveBranchName = async (bId: string | null) => {
    if (!bId) {
      safeSetActiveBranchName(null);
      return;
    }

    try {
      const queryPromise = Promise.resolve(
        supabase.from("branches").select("name").eq("id", bId).maybeSingle()
      );

      const { data, error } = await withTimeout(queryPromise, 2500, "fetchActiveBranchName");
      if (error) throw error;

      safeSetActiveBranchName((data as any)?.name ?? null);
    } catch (e) {
      console.warn("[useAuth] active branch name fetch failed:", e);
    }
  };

  // ✅ load branches for admin switcher
  const fetchBranches = async (companyId: string | null): Promise<BranchMini[]> => {
    if (!companyId) {
      safeSetBranches([]);
      return [];
    }

    try {
      const queryPromise = Promise.resolve(
        supabase
          .from("branches")
          .select("id,name")
          .eq("company_id", companyId as any)
          .eq("is_active", true)
          .order("name")
      );

      const { data, error } = await withTimeout(queryPromise, 4500, "fetchBranches");
      if (error) throw error;

      const list = ((data ?? []) as any[]).map((r) => ({
        id: String(r.id),
        name: String(r.name),
      })) as BranchMini[];

      safeSetBranches(list);
      return list;
    } catch (e) {
      console.warn("[useAuth] branches fetch failed:", e);
      safeSetBranches([]);
      return [];
    }
  };

  const refreshBranches = async () => {
    return await fetchBranches(companyIdFromProfile);
  };

  useEffect(() => {
    if (!isAdmin) {
      safeSetBranches([]);
      return;
    }
    if (!companyIdFromProfile) {
      safeSetBranches([]);
      return;
    }
    fetchBranches(companyIdFromProfile).catch(() => {});
  }, [isAdmin, companyIdFromProfile]);

  useEffect(() => {
    if (!isAdmin) {
      safeSetActiveBranchName(branchNameState ?? null);
      return;
    }

    if (!activeBranchIdState) {
      safeSetActiveBranchName(null);
      return;
    }

    const found = branchesState.find((b) => b.id === activeBranchIdState)?.name ?? null;
    if (found) {
      safeSetActiveBranchName(found);
      return;
    }

    fetchActiveBranchName(activeBranchIdState).catch(() => {});
  }, [isAdmin, activeBranchIdState, branchesState, branchNameState]);

  // ✅ derive displayable company logo URL
  const resolveCompanyLogoUrl = async (userId: string, logoValue: string | null) => {
    if (!logoValue) {
      safeSetCompanyLogoUrl(null);
      writeCachedCompanyLogoUrl(userId, null);
      return null;
    }

    if (isHttpUrl(logoValue)) {
      safeSetCompanyLogoUrl(logoValue);
      writeCachedCompanyLogoUrl(userId, logoValue);
      return logoValue;
    }

    try {
      const queryPromise = Promise.resolve(
        supabase.storage.from(LOGO_BUCKET).createSignedUrl(logoValue, SIGNED_URL_TTL)
      );

      const res = await withTimeout(queryPromise as any, 4500, "signCompanyLogoUrl");
      if ((res as any)?.error) throw (res as any).error;

      const signedUrl = (res as any)?.data?.signedUrl ?? null;

      safeSetCompanyLogoUrl(signedUrl);

      const expiresAtMs = Date.now() + (SIGNED_URL_TTL - 60) * 1000;
      writeCachedCompanyLogoUrl(userId, signedUrl, expiresAtMs);

      return signedUrl;
    } catch (e) {
      console.warn("[useAuth] signCompanyLogoUrl failed:", e);
      return null;
    }
  };

  const fetchCompany = async (
    userId: string,
    companyId: string | null
  ): Promise<CompanyMini | null> => {
    if (!companyId) {
      safeSetCompany(null);
      safeSetCompanyLogoUrl(null);
      writeCachedCompany(userId, null);
      writeCachedCompanyLogoUrl(userId, null);
      return null;
    }

    try {
      const queryPromise = Promise.resolve(
        supabase
          .from("companies")
          .select("id,name,address,phone,email,tax_id,receipt_footer,logo_url")
          .eq("id", companyId)
          .maybeSingle()
      );

      const { data, error } = await withTimeout(queryPromise, 4500, "fetchCompany");
      if (error) throw error;

      const c = (data as CompanyMini) || null;
      safeSetCompany(c);
      writeCachedCompany(userId, c);

      await resolveCompanyLogoUrl(userId, c?.logo_url ?? null);
      return c;
    } catch (e) {
      console.warn("[useAuth] company fetch failed:", e);
      return null;
    }
  };

  /**
   * ✅ IMPORTANT:
   * This upsert MUST be allowed to insert a profile with company_id NULL for new users.
   * If profiles.company_id is NOT NULL in DB, signup will fail with:
   * "null value in column company_id violates not-null constraint"
   */
  const ensureProfileRowExists = async (userId: string) => {
    try {
      const metaFullName =
        (user as any)?.user_metadata?.full_name ??
        (session as any)?.user?.user_metadata?.full_name ??
        null;

      const insertPromise = Promise.resolve(
        supabase.from("profiles").upsert(
          {
            user_id: userId,
            full_name: metaFullName,
            company_id: null,
            branch_id: null,
          } as any,
          { onConflict: "user_id" }
        )
      );

      const { error } = await withTimeout(insertPromise as any, 4000, "ensureProfileRowExists");
      if (error) throw error;
    } catch (e: any) {
      const msg = String(e?.message || "");
      console.warn("[useAuth] ensureProfileRowExists failed:", e);

      if (msg.includes("company_id") && msg.toLowerCase().includes("not-null")) {
        console.warn(
          "[useAuth] Your DB has profiles.company_id NOT NULL. New users cannot sign up until you drop that constraint."
        );
      }
    }
  };

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const fetchProfileWithRetry = async (userId: string) => {
    let lastErr: any = null;

    for (let attempt = 1; attempt <= PROFILE_FETCH_RETRIES; attempt++) {
      try {
        const queryPromise = Promise.resolve(
          supabase
            .from("profiles")
            .select(
              `
              id,
              user_id,
              full_name,
              phone,
              role,
              is_admin,
              company_id,
              branch_id,
              avatar_url,
              staff_code,
              is_attendance_manager,
              is_returns_handler,
              created_at,
              updated_at,
              deleted_at,
              deleted_by,
              deleted_reason
            `
            )
            .eq("user_id", userId)
            .maybeSingle()
        );

        const { data, error } = await withTimeout(
          queryPromise,
          12000,
          `fetchUserData(profiles) attempt ${attempt}`
        );

        if (error) throw error;
        return data;
      } catch (e) {
        lastErr = e;
        if (attempt < PROFILE_FETCH_RETRIES) await sleep(300 * attempt);
      }
    }

    throw lastErr;
  };

  const fetchUserData = async (userId: string) => {
    const mySeq = ++fetchSeq.current;

    const cachedProfile = readCachedProfile(userId);
    const cachedCompany = readCachedCompany(userId);
    const cachedLogoUrl = readCachedCompanyLogoUrl(userId);

    if (cachedProfile) {
      applyProfileState(cachedProfile);

      fetchBranchName((cachedProfile as any)?.branch_id ?? null).catch(() => {});

      const cId = (cachedProfile as any)?.company_id ?? null;
      if (cId) fetchBranches(cId).catch(() => {});
      if (cId) fetchCompany(userId, cId).catch(() => {});
    }

    if (cachedCompany) safeSetCompany(cachedCompany);

    if (cachedLogoUrl) {
      safeSetCompanyLogoUrl(cachedLogoUrl);
    } else if (cachedCompany?.logo_url) {
      resolveCompanyLogoUrl(userId, cachedCompany.logo_url).catch(() => {});
    }

    try {
      const data = await fetchProfileWithRetry(userId);
      if (mySeq !== fetchSeq.current) return null;

      if (!data) {
        await ensureProfileRowExists(userId);

        if (cachedProfile) return cachedProfile;

        const fallback = buildFallbackProfile(userId);
        applyProfileState(fallback);
        safeSetBranchName(null);

        safeSetCompany(null);
        safeSetCompanyLogoUrl(null);
        writeCachedCompany(userId, null);
        writeCachedCompanyLogoUrl(userId, null);

        safeSetBranches([]);
        safeSetActiveBranchName(null);

        return fallback;
      }

      if ((data as any)?.deleted_at) {
        console.warn("[useAuth] Deleted account blocked from login:", userId);

        await supabase.auth.signOut();

        fetchSeq.current++;
        lastFetchedUserIdRef.current = null;

        safeSetProfile(null);
        safeSetRoles([]);
        safeSetActiveBranch(null);
        safeSetBranchName(null);

        safeSetCompany(null);
        safeSetCompanyLogoUrl(null);

        safeSetBranches([]);
        safeSetActiveBranchName(null);

        clearCachedProfile();
        clearCachedCompany();

        return null;
      }

      applyProfileState(data);
      writeCachedProfile(userId, data);

      fetchBranchName((data as any)?.branch_id ?? null).catch(() => {});

      const cId = (data as any)?.company_id ?? null;
      fetchCompany(userId, cId).catch(() => {});
      if (cId) fetchBranches(cId).catch(() => {});

      return data as unknown as Profile | null;
    } catch (err) {
      console.error("[useAuth] Error fetching user data:", err);

      if (cachedProfile) return cachedProfile;

      if (mySeq === fetchSeq.current) {
        const fallback = buildFallbackProfile(userId);
        applyProfileState(fallback);
        safeSetBranchName(null);

        safeSetCompany(null);
        safeSetCompanyLogoUrl(null);
        writeCachedCompany(userId, null);
        writeCachedCompanyLogoUrl(userId, null);

        safeSetBranches([]);
        safeSetActiveBranchName(null);
      }

      return buildFallbackProfile(userId);
    } finally {
      if (mySeq === fetchSeq.current) {
        safeSetLoading(false);
        stopWatchdog();
      }
    }
  };

  const refreshProfile = async () => {
    if (!user?.id) return null;
    safeSetLoading(true);
    kickWatchdog();
    const p = await fetchUserData(user.id);
    return p as unknown as Profile | null;
  };

  const refreshCompany = async () => {
    if (!user?.id) return null;
    const cId = (profile as any)?.company_id ?? null;
    const updated = await fetchCompany(user.id, cId);
    return updated;
  };

  useEffect(() => {
    mountedRef.current = true;
    kickWatchdog();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      safeSetSession(nextSession);
      safeSetUser(nextSession?.user ?? null);

      if (nextSession?.user) {
        const uid = nextSession.user.id;

        if (lastFetchedUserIdRef.current === uid) return;
        lastFetchedUserIdRef.current = uid;

        safeSetLoading(true);
        kickWatchdog();
        await fetchUserData(uid);
      } else {
        fetchSeq.current++;
        lastFetchedUserIdRef.current = null;

        safeSetProfile(null);
        safeSetRoles([]);
        safeSetActiveBranch(null);
        safeSetBranchName(null);

        safeSetCompany(null);
        safeSetCompanyLogoUrl(null);

        safeSetBranches([]);
        safeSetActiveBranchName(null);

        clearCachedProfile();
        clearCachedCompany();

        try {
          localStorage.removeItem(ADMIN_ACTIVE_BRANCH_KEY);
        } catch {}

        safeSetLoading(false);
        stopWatchdog();
      }
    });

    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const initialSession = data.session;

        safeSetSession(initialSession);
        safeSetUser(initialSession?.user ?? null);

        if (initialSession?.user) {
          const uid = initialSession.user.id;

          if (lastFetchedUserIdRef.current === uid) {
            safeSetLoading(false);
            stopWatchdog();
            return;
          }

          lastFetchedUserIdRef.current = uid;

          safeSetLoading(true);
          kickWatchdog();
          await fetchUserData(uid);
        } else {
          safeSetLoading(false);
          stopWatchdog();
        }
      } catch (err) {
        console.error("[useAuth] getSession failed:", err);
        safeSetLoading(false);
        stopWatchdog();
      }
    })();

    return () => {
      mountedRef.current = false;
      subscription.unsubscribe();
      stopWatchdog();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error as Error };

    safeSetLoading(true);
    kickWatchdog();
    const p = await fetchUserData(data.user.id);
    const needsCompanySetup = !(p as any)?.company_id;

    return { error: null, needsCompanySetup };
  };

  /**
   * ✅ UPDATED:
   * Use VITE_SITE_URL for emailRedirectTo so confirmation links always open on Vercel,
   * even if signup was done on localhost.
   */
  const signUp = async (email: string, password: string, fullName: string) => {
    const redirectTo = `${getSiteUrl()}/`;

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectTo,
        data: { full_name: fullName },
      },
    });

    if (error) return { error: error as Error };

    // For email-confirm projects, session might be null until confirmed.
    // Still return needsCompanySetup=true (setup happens after they confirm + login).
    if (!data.user?.id) return { error: null, needsCompanySetup: true };

    // If Supabase instantly returns a session (email confirm off), hydrate.
    safeSetLoading(true);
    kickWatchdog();
    const p = await fetchUserData(data.user.id);
    const needsCompanySetup = !(p as any)?.company_id;

    return { error: null, needsCompanySetup };
  };

  // ✅ Use this everywhere we call Edge Functions
  const getFreshAccessToken = async () => {
    const { data: s1, error: e1 } = await supabase.auth.getSession();
    if (e1) throw e1;

    let sess = s1.session;
    if (!sess?.access_token) throw new Error("No session. Please log in again.");

    const expiresAtMs = (sess.expires_at ?? 0) * 1000;
    const msLeft = expiresAtMs - Date.now();

    if (expiresAtMs && msLeft < 60_000) {
      const { data: refreshed, error } = await supabase.auth.refreshSession();
      if (error) throw error;
      sess = refreshed.session ?? sess;
    }

    if (!sess?.access_token) throw new Error("No access token. Please log in again.");
    return sess.access_token;
  };

  const ensureTokenMatchesThisProject = (accessToken: string) => {
    const url = getSupabaseUrlFromEnv();
    if (!url) throw new Error("Missing VITE_SUPABASE_URL in .env");

    const envRef = getProjectRefFromUrl(url);
    const tokenRef = getTokenIssuerProjectRef(accessToken);

    if (envRef && tokenRef && envRef !== tokenRef) {
      throw new Error(
        `Invalid JWT for this project. Token belongs to "${tokenRef}" but app is calling "${envRef}". ` +
          `Sign out, clear site data, restart dev server, then login again.`
      );
    }
  };

  const callEdge = async <T,>(
    slug: string,
    body: unknown,
    opts?: { method?: "POST" | "PATCH" | "PUT" | "DELETE" }
  ): Promise<T> => {
    const token = await getFreshAccessToken();
    ensureTokenMatchesThisProject(token);

    const supabaseUrl = getSupabaseUrlFromEnv();
    const anonKey = getAnonKeyFromEnv();

    if (!supabaseUrl || !supabaseUrl.includes(".supabase.co")) {
      throw new Error("Invalid or missing VITE_SUPABASE_URL");
    }
    if (!anonKey) throw new Error("Missing VITE_SUPABASE_ANON_KEY");

    const res = await fetch(`${supabaseUrl}/functions/v1/${slug}`, {
      method: opts?.method ?? "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body ?? {}),
    });

    const raw = await res.text();
    let parsed: any = {};
    try {
      parsed = raw ? JSON.parse(raw) : {};
    } catch {
      parsed = { raw };
    }

    if (!res.ok) {
      throw new Error(parsed?.error || parsed?.message || `Edge error: ${res.status}`);
    }

    return parsed as T;
  };

  const createEmployee: AuthContextType["createEmployee"] = async (
    email,
    password,
    fullName,
    opts
  ) => {
    try {
      const companyId = (profile as any)?.company_id ?? null;
      if (!companyId) {
        return { error: new Error("Your account has no company_id yet. Set up company first.") };
      }

      const data = await callEdge<{ ok: boolean; user_id?: string }>("create-employee", {
        email,
        password,
        full_name: fullName,
        phone: opts?.phone ?? null,
        role: opts?.role ?? "staff",
        branch_id: opts?.branchId ?? null,
        company_id: companyId,
      });

      const userId = (data as any)?.user_id;
      if (!userId) return { error: new Error("No user_id returned from function") };

      return { error: null, userId };
    } catch (e: any) {
      return { error: e instanceof Error ? e : new Error(String(e)) };
    }
  };

  const deleteEmployee: AuthContextType["deleteEmployee"] = async (userId, opts) => {
    try {
      if (!userId) return { error: new Error("Missing userId") };

      await callEdge<{ ok: boolean }>("delete-employee", {
        userId: String(userId),
        mode: opts?.mode ?? "soft",
        reason: opts?.reason ?? "Deleted by admin",
      });

      return { error: null, ok: true };
    } catch (e: any) {
      return { error: e instanceof Error ? e : new Error(String(e)) };
    }
  };

  const repairMissingCompanyId: AuthContextType["repairMissingCompanyId"] = async () => {
    try {
      const payload = await callEdge<{ ok: boolean; repaired?: number }>(
        "repair-missing-company-id",
        {}
      );
      return { error: null, repaired: Number((payload as any)?.repaired ?? 0) };
    } catch (e: any) {
      return { error: e instanceof Error ? e : new Error(String(e)) };
    }
  };

  const updateEmployeeRoleBranch: AuthContextType["updateEmployeeRoleBranch"] = async (
    userId,
    role,
    branchId
  ) => {
    try {
      if (!userId) return { error: new Error("Missing userId") };
      if (!role) return { error: new Error("Missing role") };
      if (!branchId) return { error: new Error("Missing branchId") };

      await callEdge<{ ok: boolean }>("update-employee", { userId, role, branch_id: branchId });
      return { error: null, ok: true };
    } catch (e: any) {
      return { error: e instanceof Error ? e : new Error(String(e)) };
    }
  };

  const setEmployeeFlag: AuthContextType["setEmployeeFlag"] = async (userId, field, value) => {
    try {
      if (!userId) return { error: new Error("Missing userId") };
      if (!field) return { error: new Error("Missing field") };

      await callEdge<{ ok: boolean }>("update-employee", { userId, [field]: Boolean(value) });
      return { error: null, ok: true };
    } catch (e: any) {
      return { error: e instanceof Error ? e : new Error(String(e)) };
    }
  };

  const signOut = async () => {
    clearCachedProfile();
    clearCachedCompany();

    try {
      localStorage.removeItem(ADMIN_ACTIVE_BRANCH_KEY);
    } catch {}

    safeSetBranches([]);
    safeSetActiveBranchName(null);

    safeSetCompany(null);
    safeSetCompanyLogoUrl(null);
    await supabase.auth.signOut();
  };

  const hasRole = (role: AppRole) =>
    roles.includes(role) || (role === "admin" && (profile as any)?.is_admin === true);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        roles,

        company,
        companyName,
        companyLogoUrl,

        branchId,
        branchName,

        activeBranchId,
        activeBranchName: activeBranchNameState,
        branches: branchesState,
        refreshBranches,

        setActiveBranchId,

        loading,
        signIn,
        signUp,
        signOut,

        hasRole,
        isAdmin,
        isCashier,
        isWarehouse,

        isAttendanceManager,
        isReturnsHandler,

        refreshProfile,
        refreshCompany,

        createEmployee,
        deleteEmployee,
        repairMissingCompanyId,

        updateEmployeeRoleBranch,
        setEmployeeFlag,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}