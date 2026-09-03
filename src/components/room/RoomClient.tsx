"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useSocket } from "@/lib/socket/client";
import { useClockOffset } from "@/hooks/useClockOffset";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { WaitingRoom } from "@/components/room/WaitingRoom";
import { CountdownOverlay } from "@/components/room/CountdownOverlay";
import { QuestionScreen } from "@/components/room/QuestionScreen";
import { Podium } from "@/components/room/Podium";
import { CorrectionScreen } from "@/components/room/CorrectionScreen";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import type {
  ChatMessagePayload,
  CorrectionShowPayload,
  QuestionShowPayload,
  RoomFinishedPayload,
  RoomPhase,
  RoomPlayerView,
  RoomStateView,
} from "@/server/socket/events";

export function RoomClient({ code, currentUserId }: { code: string; currentUserId: string }) {
  const router = useRouter();
  const { socket, connected } = useSocket();
  const clockOffset = useClockOffset(socket);
  const reducedMotion = useReducedMotion();

  const [state, setState] = useState<RoomStateView | null>(null);
  // room:state is a one-shot snapshot sent only to the (re)joining socket — every phase
  // transition after that arrives as its own event (question:show/lock, correction:show,
  // room:finished), never as another full snapshot. So `phase` is tracked locally here, driven
  // by whichever of those events last arrived, not read off `state`.
  const [phase, setPhase] = useState<RoomPhase>("lobby");
  const [joinError, setJoinError] = useState<string | null>(null);
  const [activeQuestion, setActiveQuestion] = useState<QuestionShowPayload | null>(null);
  const [answeredUserIds, setAnsweredUserIds] = useState<Set<string>>(new Set());
  const [correction, setCorrection] = useState<CorrectionShowPayload | null>(null);
  const [finished, setFinished] = useState<RoomFinishedPayload | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessagePayload[]>([]);
  const [banner, setBanner] = useState<string | null>(null);

  // Warms GeoMap's dynamic chunk (isolated from the main bundle per CLAUDE.md — never a static
  // import here) and its 110m topology fetch during idle lobby/countdown time. Without this,
  // the first geo question in a room pays for both a chunk load and a topology fetch with no
  // head start, right as the question needs to render — the ~2s gap before a find_capital/
  // name_country question's highlighted country shows up. Fire-and-forget: both are already
  // deduped/cached at the module level (topology.ts's own cache, next/dynamic itself), so this
  // is safe to fire on every room mount, geo questions or not.
  useEffect(() => {
    void import("@/components/map").catch(() => {});
    void import("@/components/map/topology")
      .then((m) => m.loadWorldTopology("110m"))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!connected) return;

    socket.emit("room:join", { code }, (result) => {
      if ("error" in result) setJoinError(result.error);
    });

    const onState = (s: RoomStateView) => {
      setState(s);
      setPhase(s.phase);
      if (s.phase === "question" && s.currentQuestion && s.deadlineMs) {
        setActiveQuestion({
          position: s.position,
          total: s.total,
          question: s.currentQuestion,
          deadlineMs: s.deadlineMs,
          serverNowMs: s.serverNowMs,
        });
      }
    };
    const onCountdown = () => {
      setPhase("countdown");
    };
    const onQuestionShow = (payload: QuestionShowPayload) => {
      setPhase("question");
      setActiveQuestion(payload);
      setAnsweredUserIds(new Set());
    };
    const onAnswered = ({ userId }: { userId: string }) =>
      setAnsweredUserIds((prev) => new Set(prev).add(userId));
    const onQuestionLock = () => setPhase("locked");
    const onCorrectionShow = (payload: CorrectionShowPayload) => {
      setPhase("correction");
      setCorrection(payload);
    };
    /** Broadcast to the whole room, so a non-host watching sees the toggles flip live. */
    const onCorrectionVerdict = ({
      position,
      userId,
      awarded,
    }: {
      position: number;
      userId: string;
      awarded: number;
    }) => {
      setCorrection((prev) =>
        prev && prev.position === position
          ? {
              ...prev,
              answers: prev.answers.map((a) => (a.userId === userId ? { ...a, awarded } : a)),
            }
          : prev,
      );
    };
    const onFinished = (payload: RoomFinishedPayload) => {
      setPhase("finished");
      setFinished(payload);
    };
    const onChat = (msg: ChatMessagePayload) => setChatMessages((prev) => [...prev, msg]);
    const onError = (payload: { code: string; messageFr: string }) => setBanner(payload.messageFr);

    // room:join's room:state snapshot is sent only to the (re)joining socket — every other
    // already-connected client only learns about membership changes via these incremental
    // events, so they have to update `state.players` themselves rather than waiting for
    // another full snapshot that isn't coming.
    const onPlayerJoined = (player: RoomPlayerView) => {
      setState((prev) =>
        prev
          ? {
              ...prev,
              players: [...prev.players.filter((p) => p.userId !== player.userId), player],
            }
          : prev,
      );
    };
    const onPlayerLeft = ({ userId }: { userId: string }) => {
      // Mirrors the server: during a running game a departed player keeps their score (brief
      // §11.3) and is shown disconnected, not removed; in the lobby they'll simply stay absent
      // once a fresh room:player_joined doesn't arrive to re-add them.
      setState((prev) =>
        prev
          ? {
              ...prev,
              players: prev.players.map((p) =>
                p.userId === userId ? { ...p, connected: false } : p,
              ),
            }
          : prev,
      );
    };
    const onPlayerKicked = ({ userId }: { userId: string }) => {
      if (userId === currentUserId) {
        router.push("/accueil");
        return;
      }
      setState((prev) =>
        prev ? { ...prev, players: prev.players.filter((p) => p.userId !== userId) } : prev,
      );
    };
    const onHostChanged = ({ hostId }: { hostId: string }) => {
      setState((prev) => (prev ? { ...prev, hostId } : prev));
    };

    socket.on("room:state", onState);
    socket.on("room:player_joined", onPlayerJoined);
    socket.on("room:player_left", onPlayerLeft);
    socket.on("room:player_kicked", onPlayerKicked);
    socket.on("room:host_changed", onHostChanged);
    socket.on("room:countdown", onCountdown);
    socket.on("question:show", onQuestionShow);
    socket.on("question:answered", onAnswered);
    socket.on("question:lock", onQuestionLock);
    socket.on("correction:show", onCorrectionShow);
    socket.on("correction:verdict", onCorrectionVerdict);
    socket.on("room:finished", onFinished);
    socket.on("chat:message", onChat);
    socket.on("error", onError);

    return () => {
      socket.off("room:state", onState);
      socket.off("room:player_joined", onPlayerJoined);
      socket.off("room:player_left", onPlayerLeft);
      socket.off("room:player_kicked", onPlayerKicked);
      socket.off("room:host_changed", onHostChanged);
      socket.off("question:show", onQuestionShow);
      socket.off("question:answered", onAnswered);
      socket.off("question:lock", onQuestionLock);
      socket.off("room:countdown", onCountdown);
      socket.off("correction:show", onCorrectionShow);
      socket.off("correction:verdict", onCorrectionVerdict);
      socket.off("room:finished", onFinished);
      socket.off("chat:message", onChat);
      socket.off("error", onError);
      socket.emit("room:leave", { code });
    };
  }, [socket, connected, code, currentUserId, router]);

  if (!connected) {
    return <ConnectionBanner />;
  }

  if (joinError) {
    return (
      <EmptyState
        title="Impossible de rejoindre ce salon."
        description={joinError}
        action={
          <button
            type="button"
            onClick={() => router.push("/accueil")}
            className="text-14 text-moss-glow underline"
          >
            Retour à l&apos;accueil
          </button>
        }
      />
    );
  }

  if (!state) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  // "question" and "locked" share a view key — they're the same QuestionScreen instance with a
  // `locked` prop flipped, not a new screen, so they shouldn't fade-transition against each other.
  const viewKey =
    phase === "finished" && finished
      ? "finished"
      : phase === "lobby"
        ? "lobby"
        : phase === "countdown"
          ? "countdown"
          : (phase === "question" || phase === "locked") && activeQuestion
            ? "question"
            : phase === "correction" && correction
              ? "correction"
              : "loading";

  return (
    <div className="flex flex-col gap-6">
      {banner && (
        <p className="rounded-md border border-clay-deep bg-clay-deep/20 px-4 py-2 text-14 text-clay-soft">
          {banner}
        </p>
      )}

      <AnimatePresence mode="wait">
        <motion.div
          key={viewKey}
          initial={reducedMotion ? undefined : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reducedMotion ? undefined : { opacity: 0 }}
          transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
        >
          {viewKey === "finished" && finished ? (
            <Podium payload={finished} state={state} />
          ) : viewKey === "lobby" ? (
            <WaitingRoom
              state={state}
              socket={socket}
              code={code}
              currentUserId={currentUserId}
              chatMessages={chatMessages}
            />
          ) : viewKey === "countdown" ? (
            <CountdownOverlay />
          ) : viewKey === "question" && activeQuestion ? (
            <QuestionScreen
              socket={socket}
              code={code}
              active={activeQuestion}
              answeredCount={answeredUserIds.size}
              totalPlayers={state.players.filter((p) => p.connected).length}
              locked={phase === "locked"}
              clockOffset={clockOffset}
              showDifficulty={state.config.showDifficulty}
              isSpectator={
                state.players.find((p) => p.userId === currentUserId)?.isSpectator ?? false
              }
            />
          ) : viewKey === "correction" && correction ? (
            <CorrectionScreen
              socket={socket}
              code={code}
              payload={correction}
              isHost={state.hostId === currentUserId}
            />
          ) : (
            <Skeleton className="h-40 w-full" />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function ConnectionBanner() {
  return (
    <p
      className="rounded-md border border-gold-deep bg-gold-deep/20 px-4 py-2 text-14 text-gold-soft"
      role="status"
    >
      Connexion perdue — reconnexion…
    </p>
  );
}
