"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ExternalLink,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from "lucide-react";

type YouTubePlayer = {
  playVideo: () => void;
  pauseVideo: () => void;
  nextVideo: () => void;
  previousVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  setVolume: (volume: number) => void;
  mute: () => void;
  unMute: () => void;
  isMuted: () => boolean;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  getVideoData?: () => {
    video_id: string;
    title: string;
    author: string;
  };
  destroy?: () => void;
};

type YouTubeNamespace = {
  Player: new (
    element: HTMLElement | string,
    options: {
      width?: string | number;
      height?: string | number;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (event: { target: YouTubePlayer }) => void;
        onStateChange?: (event: { data: number }) => void;
        onError?: (event: { data: number }) => void;
      };
    }
  ) => YouTubePlayer;
  PlayerState: {
    UNSTARTED: number;
    ENDED: number;
    PLAYING: number;
    PAUSED: number;
    BUFFERING: number;
    CUED: number;
  };
};

declare global {
  interface Window {
    YT?: YouTubeNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const playlistId =
  process.env.NEXT_PUBLIC_YOUTUBE_PLAYLIST_ID ??
  "PLUVarmNUqoqA";

const playlistUrl =
  process.env.NEXT_PUBLIC_YOUTUBE_PLAYLIST_URL ??
  "https://music.youtube.com/playlist?list=PLUVarmNUqoqA";

const DEMO_TRACK = {
  title: "Dil Se Safar",
  artist: "YouTube Playlist",
  thumbnail: "/images/auto-bg.png",
  videoId: "",
};

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export default function Home() {
  const playerRef = useRef<YouTubePlayer | null>(null);
  const progressTimer = useRef<number | null>(null);
  const apiReadyRef = useRef(false);
  const awaitingSoundUnlock = useRef(false);

  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [volume, setVolume] = useState(80);
  const [playerReady, setPlayerReady] = useState(false);
  const [clock, setClock] = useState("");
  const [onlineCount, setOnlineCount] = useState(1);
  const [current, setCurrent] = useState(DEMO_TRACK);

  const progress = useMemo(
    () => (duration > 0 ? Math.min(100, (position / duration) * 100) : 0),
    [position, duration]
  );

  useEffect(() => {
    const update = () => {
      setClock(
        new Intl.DateTimeFormat("en-IN", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        }).format(new Date())
      );
    };

    update();
    const id = window.setInterval(update, 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const sessionId = crypto.randomUUID();

    async function heartbeat() {
      try {
        const response = await fetch("/api/presence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });

        if (!response.ok) return;

        const data = (await response.json()) as { count?: number };
        if (typeof data.count === "number") {
          setOnlineCount(data.count);
        }
      } catch {
        // Ignore transient network errors.
      }
    }

    heartbeat();
    const id = window.setInterval(heartbeat, 15_000);
    return () => window.clearInterval(id);
  }, []);

  function ensureIframeAutoplayPermissions(container: HTMLElement) {
    const iframe = container.querySelector("iframe");
    if (!iframe) return;

    iframe.setAttribute(
      "allow",
      "autoplay; encrypted-media; fullscreen; picture-in-picture"
    );
  }

  function tryAutoplay(player: YouTubePlayer) {
    player.setVolume(volume);
    player.unMute();
    player.playVideo();

    window.setTimeout(() => {
      if (!playerRef.current || playerRef.current !== player) return;

      const state = player.getPlayerState();
      const playing =
        state === window.YT?.PlayerState.PLAYING ||
        state === window.YT?.PlayerState.BUFFERING;

      if (playing) {
        awaitingSoundUnlock.current = false;
        return;
      }

      player.mute();
      player.playVideo();
      awaitingSoundUnlock.current = true;
    }, 400);
  }

  function unlockSound() {
    const player = playerRef.current;
    if (!player || !awaitingSoundUnlock.current) return;

    player.unMute();
    player.setVolume(volume);
    player.playVideo();
    awaitingSoundUnlock.current = false;
  }

  useEffect(() => {
    const unlockOnInteraction = () => unlockSound();
    document.addEventListener("pointerdown", unlockOnInteraction);
    document.addEventListener("keydown", unlockOnInteraction);

    return () => {
      document.removeEventListener("pointerdown", unlockOnInteraction);
      document.removeEventListener("keydown", unlockOnInteraction);
    };
  }, [volume]);

  useEffect(() => {
    const scriptId = "youtube-iframe-api";
    let cancelled = false;

    const initialize = () => {
      if (cancelled || !window.YT?.Player || apiReadyRef.current) return;

      const element = document.getElementById("youtube-player");
      if (!element) return;

      apiReadyRef.current = true;

      playerRef.current = new window.YT.Player(element, {
        width: "1",
        height: "1",
        playerVars: {
          autoplay: 1,
          controls: 0,
          enablejsapi: 1,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
          modestbranding: 1,
          mute: 0,
          playsinline: 1,
          rel: 0,
          ...(typeof window !== "undefined"
            ? { origin: window.location.origin }
            : {}),
          listType: "playlist",
          list: playlistId,
        },
        events: {
          onReady: (event) => {
            if (cancelled) return;
            ensureIframeAutoplayPermissions(element);
            setPlayerReady(true);
            tryAutoplay(event.target);
            syncNowPlaying();
            startProgressLoop();
          },
          onStateChange: (event) => {
            if (cancelled || !window.YT) return;

            if (event.data === window.YT.PlayerState.PLAYING) {
              setIsPlaying(true);
              setDuration(playerRef.current?.getDuration() ?? 0);
              syncNowPlaying();
              startProgressLoop();
            } else if (
              event.data === window.YT.PlayerState.PAUSED ||
              event.data === window.YT.PlayerState.ENDED
            ) {
              setIsPlaying(false);
            }
          },
          onError: (event) => {
            console.warn("YouTube player error:", event.data);
          },
        },
      });
    };

    if (window.YT?.Player) {
      initialize();
    } else {
      window.onYouTubeIframeAPIReady = initialize;

      if (!document.getElementById(scriptId)) {
        const script = document.createElement("script");
        script.id = scriptId;
        script.src = "https://www.youtube.com/iframe_api";
        script.async = true;
        document.body.appendChild(script);
      }
    }

    return () => {
      cancelled = true;

      if (progressTimer.current) {
        window.clearInterval(progressTimer.current);
        progressTimer.current = null;
      }

      playerRef.current?.destroy?.();
      playerRef.current = null;
      apiReadyRef.current = false;
      awaitingSoundUnlock.current = false;
      window.onYouTubeIframeAPIReady = undefined;
      setPlayerReady(false);
      setIsPlaying(false);
    };
  }, []);

  function startProgressLoop() {
    if (progressTimer.current) return;

    progressTimer.current = window.setInterval(() => {
      const player = playerRef.current;
      if (!player) return;

      const nextPosition = player.getCurrentTime?.() ?? 0;
      const nextDuration = player.getDuration?.() ?? 0;

      setPosition(nextPosition);
      setDuration(nextDuration);
    }, 250);
  }

  function syncNowPlaying() {
    const data = playerRef.current?.getVideoData?.();
    if (!data?.video_id) return;

    setCurrent({
      title: data.title || DEMO_TRACK.title,
      artist: data.author || DEMO_TRACK.artist,
      thumbnail: `https://i.ytimg.com/vi/${data.video_id}/hqdefault.jpg`,
      videoId: data.video_id,
    });
  }

  function play() {
    unlockSound();
    playerRef.current?.playVideo();
  }

  function pause() {
    playerRef.current?.pauseVideo();
  }

  function toggle() {
    if (!playerRef.current || !playerReady) return;
    isPlaying ? pause() : play();
  }

  function previous() {
    if (!playerRef.current || !playerReady) return;
    playerRef.current.previousVideo();
  }

  function next() {
    if (!playerRef.current || !playerReady) return;
    playerRef.current.nextVideo();
  }

  function seek(value: number) {
    setPosition(value);
    playerRef.current?.seekTo(value, true);
  }

  function changeVolume(value: number) {
    setVolume(value);
    playerRef.current?.setVolume(value);
    if (value > 0) {
      playerRef.current?.unMute();
      awaitingSoundUnlock.current = false;
    }
  }

  return (
    <main className="relative isolate min-h-svh overflow-hidden text-cream">
      <div
        className="pointer-events-none fixed inset-0 -z-[4] scale-[1.02] bg-cover bg-center"
        style={{
          backgroundImage:
            'linear-gradient(90deg, rgba(20, 12, 7, 0.23), rgba(20, 12, 7, 0.03)), url("/images/auto-bg.png")',
        }}
      />
      <div className="pointer-events-none fixed inset-0 -z-[3] bg-[radial-gradient(circle_at_64%_47%,rgba(248,183,112,0.13),transparent_32%),linear-gradient(180deg,rgba(21,13,8,0.22),rgba(31,15,8,0.48))]" />
      <div className="grain-overlay pointer-events-none fixed inset-0 z-40 mix-blend-soft-light opacity-[0.09]" />

      <div
        className="pointer-events-none fixed -left-5 -top-5 z-[-1] h-px w-px overflow-hidden opacity-0"
        aria-hidden="true"
      >
        <div id="youtube-player" />
      </div>

      <div className="fixed top-[max(1rem,env(safe-area-inset-top,0px))] left-1/2 z-30 w-[min(calc(100vw-2rem),380px)] -translate-x-1/2 sm:top-[max(1.25rem,env(safe-area-inset-top,0px))] lg:left-auto lg:right-[clamp(18px,3vw,52px)] lg:translate-x-0">
        <div className="relative flex w-full flex-col items-center rounded-[18px] border border-glass-border bg-[linear-gradient(145deg,rgba(255,255,255,0.13),rgba(255,255,255,0.025)),var(--color-glass)] p-3 shadow-[0_20px_60px_rgba(18,6,2,0.38),inset_0_1px_0_rgba(255,255,255,0.16)] backdrop-blur-2xl backdrop-saturate-[115%] max-[380px]:gap-0 max-[380px]:p-2.5 landscape:max-h-[480px]:gap-0 landscape:max-h-[480px]:p-2.5 sm:gap-0 sm:rounded-[20px] sm:p-3.5">
            <div className="flex w-full flex-row items-center gap-2.5 sm:gap-3">
              <div
                className={`vinyl-disc relative mx-0 aspect-square w-[48px] shrink-0 self-center rounded-full max-[380px]:w-[44px] landscape:max-h-[480px]:w-[44px] sm:w-[60px] ${isPlaying ? "animate-spin-vinyl" : ""}`}
              >
                <div className="vinyl-grooves absolute inset-[6%] rounded-full opacity-55" />
                <div className="vinyl-shine pointer-events-none absolute inset-[5%] rounded-full blur-[2px]" />
                <div className="absolute inset-[31%] z-[2] overflow-hidden rounded-full shadow-[0_0_0_5px_#14110f,0_0_0_6px_rgba(255,255,255,0.08)]">
                  <img
                    src={current.thumbnail}
                    alt=""
                    width={56}
                    height={56}
                    className="h-full w-full object-cover"
                    onError={(event) => {
                      event.currentTarget.src = "/images/auto-bg.png";
                    }}
                  />
                  <span className="absolute top-1/2 left-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/25 bg-[#1d1713]" />
                </div>
              </div>
              <div className="flex w-full min-w-0 justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="m-0 mb-0.5 font-mono text-[7px] tracking-[0.08em] uppercase opacity-50">
                    NOW PLAYING
                  </p>
                  <h2 className="m-0 line-clamp-1 text-[13px] leading-[1.15] font-semibold tracking-[-0.03em] sm:text-[14px]">
                    {current.title}
                  </h2>
                  <p className="mt-0.5 truncate text-[9px] text-cream/63 sm:text-[10px]">
                    {current.artist}
                  </p>
                </div>
                <button
                  type="button"
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-white/13 bg-white/8 p-0 text-inherit transition-opacity disabled:cursor-not-allowed disabled:opacity-35 sm:h-7 sm:w-7"
                  onClick={() => changeVolume(volume > 0 ? 0 : 80)}
                  disabled={!playerReady}
                  aria-label={volume > 0 ? "Mute" : "Unmute"}
                >
                  {volume > 0 ? <Volume2 size={12} /> : <VolumeX size={12} />}
                </button>
              </div>
            </div>

            <div className="flex w-full min-w-0 flex-col">
              <div className="px-2">
                <input
                  type="range"
                  className="progress-range"
                  min="0"
                  max={duration || 1}
                  step="0.1"
                  value={Math.min(position, duration || 1)}
                  onChange={(event) => seek(Number(event.target.value))}
                  style={
                    {
                      "--progress": `${progress}%`,
                    } as React.CSSProperties
                  }
                  aria-label="Song progress"
                />

                <div className="mt-1 flex justify-between font-mono text-[7px] opacity-48">
                  <span>{formatTime(position)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>

              <div className="flex items-center justify-center gap-2.5 sm:gap-3">
                <button
                  className="grid h-7 w-7 place-items-center border-0 bg-transparent p-0 text-inherit opacity-55 transition-all duration-200 hover:-translate-y-0.5 hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:translate-y-0 sm:h-8 sm:w-8"
                  onClick={previous}
                  disabled={!playerReady}
                  aria-label="Previous song"
                >
                  <SkipBack size={16} fill="currentColor" />
                </button>

                <button
                  className="grid h-8 w-8 place-items-center rounded-full border-0 bg-cream p-0 text-ink shadow-[0_5px_18px_rgba(0,0,0,0.22)] transition-all duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:translate-y-0 sm:h-9 sm:w-9"
                  onClick={toggle}
                  disabled={!playerReady}
                  aria-label={isPlaying ? "Pause" : "Play"}
                >
                  {isPlaying ? (
                    <Pause size={17} fill="currentColor" />
                  ) : (
                    <Play size={17} fill="currentColor" />
                  )}
                </button>

                <button
                  className="grid h-7 w-7 place-items-center border-0 bg-transparent p-0 text-inherit opacity-55 transition-all duration-200 hover:-translate-y-0.5 hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:translate-y-0 sm:h-8 sm:w-8"
                  onClick={next}
                  disabled={!playerReady}
                  aria-label="Next song"
                >
                  <SkipForward size={16} fill="currentColor" />
                </button>
              </div>
            </div>

            {!playerReady && (
              <div className="absolute right-0 bottom-1.5 left-0 text-center font-mono text-[7px] tracking-[0.1em] uppercase opacity-35">
                preparing the ride…
              </div>
            )}
        </div>
      </div>

      <section className="relative z-[2] min-h-svh">
        <p className="pointer-events-none absolute inset-x-0 bottom-[calc(3.75rem+env(safe-area-inset-bottom,0px))] z-10 m-0 px-4 text-center font-hindi text-[clamp(1.85rem,9vw,5.5rem)] leading-[0.95] font-bold tracking-[-0.02em] text-cream/90 text-shadow-[0_8px_35px_rgba(34,12,4,0.32)] [-webkit-text-stroke:0.5px_currentColor] landscape:max-h-[480px]:bottom-[calc(3.25rem+env(safe-area-inset-bottom,0px))] landscape:max-h-[480px]:text-[clamp(1.65rem,7vw,3.25rem)] sm:bottom-[calc(4.25rem+env(safe-area-inset-bottom,0px))] sm:px-6 md:px-8">
          बैडी राइड.
        </p>
      </section>

      <footer className="fixed inset-x-0 bottom-0 z-20 flex h-11 items-center justify-between gap-2 px-4 pb-[env(safe-area-inset-bottom,0px)] sm:h-12 sm:gap-3 sm:px-[clamp(18px,3vw,52px)]">
        <div className="shrink-0 font-mono text-[9px] tracking-[0.08em] uppercase opacity-90 sm:text-[10px]">
          {clock || "—"}
        </div>

        <div className="flex min-w-0 items-center gap-2 text-[8px] sm:gap-3 sm:text-[9px]">
          <span className="inline-flex shrink-0 items-center gap-1 font-mono tracking-[0.06em] uppercase opacity-70 sm:gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/90 shadow-[0_0_6px_rgba(52,211,153,0.65)]" />
            <span className="max-[360px]:hidden">{onlineCount} online</span>
            <span className="hidden max-[360px]:inline">{onlineCount}</span>
          </span>
          <a
            className="inline-flex shrink-0 items-center gap-1 border-b border-cream/35 pb-0.5 text-inherit no-underline"
            href={playlistUrl}
            target="_blank"
            rel="noreferrer"
          >
            <span className="hidden min-[400px]:inline">YouTube Music</span>
            <span className="sr-only min-[400px]:hidden">YouTube Music</span>
            <ExternalLink size={10} className="shrink-0" />
          </a>
        </div>
      </footer>
    </main>
  );
}
