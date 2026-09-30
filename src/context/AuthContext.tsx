"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { AVATAR_PALETTE } from "@/lib/utils";
import {
  PASSWORD_MIN_LENGTH,
  faNum,
  isStrongEnoughPassword,
  isValidStudentCode,
  persianAuthError,
  roleOf,
  studentCodeToEmail,
  type Role,
} from "@/lib/auth";

export interface AuthContextValue {
  user: User | null;
  session: Session | null;
  /** From user_metadata.role — rewritten server-side by the signup trigger. */
  role: Role | null;
  isTeacher: boolean;
  displayName: string;
  avatar: string;
  ready: boolean;
  needsProfile: boolean;
  /** Auth methods resolve to a Persian error message, or null on success. */
  signInStudent: (code: string, password: string) => Promise<string | null>;
  signUpStudent: (input: { code: string; fullName: string; password: string }) => Promise<string | null>;
  signInTeacher: (email: string, password: string) => Promise<string | null>;
  signUpTeacher: (input: {
    email: string;
    fullName: string;
    password: string;
    inviteCode: string;
  }) => Promise<string | null>;
  signOut: () => Promise<void>;
  saveProfile: (name: string, avatar: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const nameKey = (uid: string) => `displayName_${uid}`;
const avatarKey = (uid: string) => `userAvatar_${uid}`;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [avatar, setAvatar] = useState("");
  const [ready, setReady] = useState(false);
  const profileFor = useRef<string | null>(null);

  // Name/avatar live in `user_profiles`, so the same account looks the same on
  // every device; localStorage is only a per-device fallback.
  const loadProfile = useCallback(async (u: User) => {
    if (profileFor.current === u.id) return;
    profileFor.current = u.id;
    let serverName = "";
    let serverAvatar = "";
    try {
      const { data } = await supabase
        .from("user_profiles")
        .select("display_name, avatar")
        .eq("user_id", u.id)
        .maybeSingle();
      serverName = data?.display_name || "";
      serverAvatar = data?.avatar || "";
    } catch {
      /* profile table unreachable — fall back to metadata/localStorage */
    }
    const metaName = typeof u.user_metadata?.full_name === "string" ? u.user_metadata.full_name : "";
    const localName = localStorage.getItem(nameKey(u.id)) || "";
    let localAvatar = localStorage.getItem(avatarKey(u.id)) || "";
    if (!localAvatar) {
      localAvatar = AVATAR_PALETTE[Math.floor(Math.random() * AVATAR_PALETTE.length)];
      localStorage.setItem(avatarKey(u.id), localAvatar);
    }
    setDisplayName(serverName || metaName || localName);
    setAvatar(serverAvatar || localAvatar);
  }, []);

  const applyUser = useCallback(
    (u: User | null, s: Session | null) => {
      setUser(u);
      setSession(s);
      if (u) void loadProfile(u);
      else {
        profileFor.current = null;
        setDisplayName("");
        setAvatar("");
      }
    },
    [loadProfile]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // NO anonymous sign-in: you are either logged in or you are not.
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      applyUser(data.session?.user ?? null, data.session);
      setReady(true);
    })();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      if (cancelled) return;
      applyUser(s?.user ?? null, s);
      setReady(true);
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [applyUser]);

  /** Re-reads the user from the server (the signup trigger may rewrite role). */
  const refreshFromServer = useCallback(
    async (s: Session | null) => {
      const { data } = await supabase.auth.getUser();
      applyUser(data.user ?? s?.user ?? null, s);
    },
    [applyUser]
  );

  const signInStudent = useCallback(
    async (code: string, password: string): Promise<string | null> => {
      const trimmed = code.trim();
      if (!trimmed) return "کد دانشجویی رو وارد کن";
      if (!isValidStudentCode(trimmed)) return "کد دانشجویی معتبر نیست";
      if (!password) return "رمز عبور رو وارد کن";
      const { data, error } = await supabase.auth.signInWithPassword({
        email: studentCodeToEmail(trimmed),
        password,
      });
      if (error) return persianAuthError(error.message, true);
      await refreshFromServer(data.session);
      return null;
    },
    [refreshFromServer]
  );

  const signUpStudent = useCallback(
    async ({
      code,
      fullName,
      password,
    }: {
      code: string;
      fullName: string;
      password: string;
    }): Promise<string | null> => {
      const trimmed = code.trim();
      const name = fullName.trim();
      if (!trimmed) return "کد دانشجویی رو وارد کن";
      if (!isValidStudentCode(trimmed))
        return "کد دانشجویی معتبر نیست (فقط حروف انگلیسی، عدد، نقطه و خط تیره)";
      if (!name) return "نام کامل رو وارد کن";
      if (!isStrongEnoughPassword(password)) return `رمز عبور حداقل ${faNum(PASSWORD_MIN_LENGTH)} کاراکتره`;

      const email = studentCodeToEmail(trimmed);
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { role: "student", full_name: name, student_code: trimmed.toLowerCase() },
        },
      });
      if (error) return persianAuthError(error.message, true);

      if (data.session) {
        await refreshFromServer(data.session);
        return null;
      }
      // Email confirmation is on: try to sign in right away (our SQL
      // auto-confirms @students.local addresses, so this normally succeeds).
      const { data: signIn, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        const msg = persianAuthError(signInError.message, true);
        if (msg.includes("اشتباه")) return "این کد دانشجویی قبلاً ثبت شده؛ اگه مال توئه وارد شو";
        return msg;
      }
      await refreshFromServer(signIn.session);
      return null;
    },
    [refreshFromServer]
  );

  const signInTeacher = useCallback(
    async (email: string, password: string): Promise<string | null> => {
      const mail = email.trim();
      if (!mail) return "ایمیل رو وارد کن";
      if (!mail.includes("@")) return "ساختار ایمیل معتبر نیست";
      if (!password) return "رمز عبور رو وارد کن";
      const { data, error } = await supabase.auth.signInWithPassword({ email: mail, password });
      if (error) return persianAuthError(error.message, false);
      await refreshFromServer(data.session);
      return null;
    },
    [refreshFromServer]
  );

  const signUpTeacher = useCallback(
    async ({
      email,
      fullName,
      password,
      inviteCode,
    }: {
      email: string;
      fullName: string;
      password: string;
      inviteCode: string;
    }): Promise<string | null> => {
      const mail = email.trim();
      const name = fullName.trim();
      const invite = inviteCode.trim();
      if (!mail || !mail.includes("@")) return "ایمیل معتبر وارد کن";
      if (mail.toLowerCase().endsWith("@students.local"))
        return "برای معلم باید ایمیل واقعی بدهی، نه کد دانشجویی";
      if (!name) return "نام کامل رو وارد کن";
      if (!isStrongEnoughPassword(password)) return `رمز عبور حداقل ${faNum(PASSWORD_MIN_LENGTH)} کاراکتره`;
      if (!invite) return "کد دعوت معلم رو وارد کن";

      const { data, error } = await supabase.auth.signUp({
        email: mail,
        password,
        options: {
          data: { role: "teacher", full_name: name, invite_code: invite },
        },
      });
      if (error) return persianAuthError(error.message, false);

      if (!data.session) {
        const { data: signIn, error: signInError } = await supabase.auth.signInWithPassword({
          email: mail,
          password,
        });
        if (signInError) {
          const msg = persianAuthError(signInError.message, false);
          if (msg.includes("اشتباه")) return "این ایمیل قبلاً ثبت شده؛ وارد شو";
          return msg;
        }
        await refreshFromServer(signIn.session);
      } else {
        await refreshFromServer(data.session);
      }
      return null;
    },
    [refreshFromServer]
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    applyUser(null, null);
  }, [applyUser]);

  const saveProfile = useCallback(
    async (name: string, newAvatar: string) => {
      if (!user) return;
      const oldName = displayName;
      const nameChanged = name !== oldName && oldName !== "";

      if (nameChanged) {
        await Promise.all([
          supabase.from("cells").update({ author_name: name }).eq("author_id", user.id),
          supabase.from("team_members").update({ display_name: name }).eq("user_id", user.id),
          supabase.from("comments").update({ author_name: name }).eq("author_id", user.id),
        ]);
      }

      // Only these columns are user-writable (role/email/username/full_name
      // are locked by column-level GRANTs — see supabase/auth_migration.sql).
      await supabase.from("user_profiles").upsert(
        {
          user_id: user.id,
          display_name: name,
          avatar: newAvatar,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

      localStorage.setItem(nameKey(user.id), name);
      localStorage.setItem(avatarKey(user.id), newAvatar);
      profileFor.current = user.id;
      setDisplayName(name);
      setAvatar(newAvatar);
    },
    [user, displayName]
  );

  const role = roleOf(user);
  const value: AuthContextValue = {
    user,
    session,
    role,
    isTeacher: role === "teacher",
    displayName,
    avatar,
    ready,
    needsProfile: ready && !!user && !displayName,
    signInStudent,
    signUpStudent,
    signInTeacher,
    signUpTeacher,
    signOut,
    saveProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}


