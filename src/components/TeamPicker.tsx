"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ToastProvider";
import { initials } from "@/lib/utils";
import type { Team } from "@/lib/types";
import { ListSkeleton } from "@/components/Skeleton";
import Icon from "@/components/Icon";

const TEAM_PALETTE = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4",
  "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6", "#f43f5e",
];

export interface CurrentTeam {
  id: string;
  name: string;
  color: string;
}

export default function TeamPicker({
  open,
  onClose,
  classId,
  currentTeam,
  onTeamChange,
}: {
  open: boolean;
  onClose: () => void;
  classId: string;
  currentTeam: CurrentTeam | null;
  onTeamChange: (team: CurrentTeam | null) => void;
}) {
  const { user, displayName } = useAuth();
  const toast = useToast();
  const [teams, setTeams] = useState<Team[]>([]);
  const [members, setMembers] = useState<Record<string, { user_id: string; display_name: string }[]>>({});
  const [loading, setLoading] = useState(true);
  const [newTeamName, setNewTeamName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data: teamRows } = await supabase
      .from("teams")
      .select("*")
      .eq("class_id", classId)
      .order("created_at", { ascending: true });
    const list = teamRows || [];
    setTeams(list);
    if (list.length) {
      const ids = list.map((t) => t.id);
      const { data: memberRows } = await supabase
        .from("team_members")
        .select("team_id, user_id, display_name")
        .in("team_id", ids);
      const map: Record<string, { user_id: string; display_name: string }[]> = {};
      (memberRows || []).forEach((r) => {
        if (!r.team_id || !r.display_name) return;
        if (!map[r.team_id]) map[r.team_id] = [];
        map[r.team_id].push({ user_id: r.user_id, display_name: r.display_name });
      });
      setMembers(map);
    } else {
      setMembers({});
    }
    setLoading(false);
  };

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, classId]);

  if (!open) return null;

  const joinTeam = async (team: { id: string; name: string; color: string }) => {
    if (!user) return;
    if (currentTeam && currentTeam.id !== team.id) {
      if (!confirm(`از «${currentTeam.name}» به «${team.name}» منتقل می‌شی؟`)) return;
      await supabase.from("team_members").delete().eq("team_id", currentTeam.id).eq("user_id", user.id);
    }
    await supabase.from("team_members").upsert(
      { team_id: team.id, user_id: user.id, display_name: displayName },
      { onConflict: "team_id,user_id" }
    );
    const t = { id: team.id, name: team.name, color: team.color };
    onTeamChange(t);
    toast(`به تیم «${team.name}» پیوستی`, "ok");
    onClose();
  };

  const leaveTeam = async () => {
    if (!currentTeam || !user) return;
    if (!confirm(`از تیم «${currentTeam.name}» خارج می‌شوی؟`)) return;
    await supabase.from("team_members").delete().eq("team_id", currentTeam.id).eq("user_id", user.id);
    toast(`از تیم «${currentTeam.name}» خارج شدی.`, "info");
    onTeamChange(null);
    onClose();
  };

  const createTeam = async () => {
    const name = newTeamName.trim();
    if (!name || name.length < 2) return toast("نام تیم رو وارد کن (حداقل ۲ حرف)", "err");
    if (teams.some((t) => t.name.toLowerCase() === name.toLowerCase()))
      return toast("این نام گرفته شده", "err");
    setBusy(true);
    const color = TEAM_PALETTE[Math.floor(Math.random() * TEAM_PALETTE.length)];
    const { data, error } = await supabase
      .from("teams")
      .insert({ class_id: classId, name, color })
      .select()
      .single();
    setBusy(false);
    if (error || !data) return toast("خطا: " + error?.message, "err");
    setNewTeamName("");
    await joinTeam(data);
  };

  return (
    <div
      className="fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur-sm anim-fade flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-2xl anim-pop w-full max-w-md max-h-[85vh] overflow-y-auto p-6">
        <h2 className="text-lg font-extrabold mb-4 flex items-center gap-2">
          <Icon name="users" className="w-5 h-5 text-primary" />
          تیم‌ها
        </h2>

        <div className="flex gap-2 mb-4">
          <input
            value={newTeamName}
            onChange={(e) => setNewTeamName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createTeam()}
            placeholder="نام تیم جدید…"
            className="flex-1 border border-line rounded-xl px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <button
            disabled={busy}
            onClick={createTeam}
            className="px-4 py-2 rounded-xl text-sm font-bold text-white bg-gradient-to-br from-primary to-primary2 disabled:opacity-50"
          >
            ساخت
          </button>
        </div>

        {loading ? (
          <ListSkeleton rows={3} pill={false} />
        ) : teams.length === 0 ? (
          <div className="text-center text-sm text-muted py-10">هنوز تیمی نیست.</div>
        ) : (
          <div className="space-y-2.5">
            {teams.map((t) => {
              const tm = members[t.id] || [];
              const isMine = currentTeam?.id === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => !isMine && joinTeam(t)}
                  className={`w-full text-right rounded-xl p-3 border transition ${
                    isMine ? "border-primary bg-indigo-50" : "border-line hover:border-primary/40"
                  }`}
                  style={{ borderInlineEndWidth: 4, borderInlineEndColor: t.color }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-full grid place-items-center text-white font-bold text-xs shrink-0"
                      style={{ background: t.color }}
                    >
                      {initials(t.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm truncate">
                        {t.name} {isMine && <span className="text-xs text-primary">(تیم شما)</span>}
                      </div>
                      <div className="text-xs text-muted">{tm.length} عضو</div>
                    </div>
                    <div className="text-xs font-bold text-primary shrink-0">
                      {isMine ? "✓ انتخاب شده" : "پیوستن ←"}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {currentTeam && (
          <button
            onClick={leaveTeam}
            className="w-full mt-4 text-center text-sm font-bold text-danger py-2"
          >
            خروج از تیم «{currentTeam.name}»
          </button>
        )}

        <button onClick={onClose} className="w-full text-center text-xs text-muted mt-2 hover:text-ink">
          بستن
        </button>
      </div>
    </div>
  );
}
