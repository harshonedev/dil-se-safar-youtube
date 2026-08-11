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
  "PLxxxxxxxxxxxxxxxx";

const playlistUrl =
  process.env.NEXT_PUBLIC_YOUTUBE_PLAYLIST_URL ??
  `https://www.youtube.com/playlist?list=${playlistId}`;

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

  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [volume, setVolume] = useState(80);
  const [playerReady, setPlayerReady] = useState(false);
  const [clock, setClock] = useState("");
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
            setPlayerReady(true);
            event.target.setVolume(volume);
            event.target.playVideo();
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

      <header className="relative z-20 flex h-14 items-center justify-between px-4 sm:h-[68px] sm:px-[clamp(18px,3vw,52px)]">
        <div className="font-mono text-[11px] tracking-[0.08em] uppercase opacity-90">
          {clock || "—"}
        </div>

        <div className="flex items-center gap-2 text-[10px] sm:gap-[11px] sm:text-[11px]">
          <a
            className="inline-flex items-center gap-1.5 border-b border-cream/35 pb-0.5 text-inherit no-underline"
            href={playlistUrl}
            target="_blank"
            rel="noreferrer"
          >
            YouTube Music <ExternalLink size={12} />
          </a>
        </div>
      </header>

      <section className="relative z-[2] grid min-h-[calc(100svh-3.5rem)] grid-cols-1 items-center gap-8 px-4 pb-16 pt-10 sm:min-h-[calc(100svh-68px)] sm:px-6 sm:pt-[60px] lg:grid-cols-[1fr_auto] lg:gap-[clamp(25px,6vw,80px)] lg:px-[clamp(18px,3vw,48px)] lg:pb-[75px] lg:pl-[clamp(22px,10vw,160px)] lg:pt-[30px]">
        <div className="mx-auto w-full max-w-[540px] pt-[3vh] text-center lg:mx-0 lg:justify-self-start lg:text-left">
          <p className="mb-[18px] font-mono text-[10px] tracking-[0.08em] uppercase opacity-75">
            A DIL SE SAFAR
          </p>

          <h1 className="m-0 text-[clamp(2.875rem,15vw,4.5rem)] leading-[0.88] font-semibold tracking-[-0.065em] text-shadow-[0_8px_35px_rgba(34,12,4,0.32)] sm:text-[clamp(3.25rem,6.5vw,6.5rem)]">
            just me,
            <br />
            my playlist
            <br />
            <em className="font-display font-semibold tracking-[-0.07em] not-italic">
              & the city.
            </em>
          </h1>
        </div>

        <div className="relative mx-auto grid w-full max-w-[600px] place-items-center justify-self-center lg:mx-0 lg:w-auto lg:max-w-none lg:justify-self-end">
          <div className="relative z-[3] flex w-full max-w-[min(94vw,480px)] flex-row gap-3.5 rounded-[23px] border border-glass-border bg-[linear-gradient(145deg,rgba(255,255,255,0.13),rgba(255,255,255,0.025)),var(--color-glass)] p-4 shadow-[0_28px_90px_rgba(18,6,2,0.42),inset_0_1px_0_rgba(255,255,255,0.16)] backdrop-blur-2xl backdrop-saturate-[115%] sm:max-w-[380px] sm:flex-col sm:gap-0 sm:rounded-[28px] sm:p-5 sm:px-8 sm:pt-7 sm:pb-[22px]">
            <div
              className={`vinyl-disc relative mx-0 aspect-square w-[76px] shrink-0 self-start rounded-full sm:mx-auto sm:mb-[22px] sm:w-[120px] ${isPlaying ? "animate-spin-vinyl" : ""}`}
            >
              <div className="vinyl-grooves absolute inset-[6%] rounded-full opacity-55" />
              <div className="vinyl-shine pointer-events-none absolute inset-[5%] rounded-full blur-[3px]" />
              <div className="absolute inset-[31%] z-[2] overflow-hidden rounded-full shadow-[0_0_0_7px_#14110f,0_0_0_8px_rgba(255,255,255,0.08)]">
                <img
                  src={current.thumbnail}
                  alt=""
                  width={80}
                  height={80}
                  className="h-full w-full object-cover"
                  onError={(event) => {
                    event.currentTarget.src = "/images/auto-bg.png";
                  }}
                />
                <span className="absolute top-1/2 left-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/25 bg-[#1d1713]" />
              </div>
            </div>

            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="m-0 mb-1.5 font-mono text-[8px] tracking-[0.08em] uppercase opacity-50 sm:mb-2">
                    NOW PLAYING
                  </p>
                  <h2 className="m-0 line-clamp-2 text-base leading-[1.15] font-semibold tracking-[-0.03em] sm:text-[19px]">
                    {current.title}
                  </h2>
                  <p className="mt-1 text-[10px] text-cream/63 sm:mt-1.5 sm:text-[11px]">
                    {current.artist}
                  </p>
                </div>

                <button
                  type="button"
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-white/13 bg-white/8 p-0 text-inherit transition-opacity disabled:cursor-not-allowed disabled:opacity-35 sm:h-[31px] sm:w-[31px]"
                  onClick={() => changeVolume(volume > 0 ? 0 : 80)}
                  disabled={!playerReady}
                  aria-label={volume > 0 ? "Mute" : "Unmute"}
                >
                  {volume > 0 ? <Volume2 size={14} /> : <VolumeX size={14} />}
                </button>
              </div>

              <div className="mt-3 sm:mt-5">
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

                <div className="mt-1.5 flex justify-between font-mono text-[8px] opacity-48 sm:mt-2">
                  <span>{formatTime(position)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-center gap-3 sm:mt-[22px] sm:gap-[25px]">
                <button
                  className="grid h-8 w-8 place-items-center border-0 bg-transparent p-0 text-inherit opacity-55 transition-all duration-200 hover:-translate-y-0.5 hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:translate-y-0 sm:h-[35px] sm:w-[35px]"
                  onClick={previous}
                  disabled={!playerReady}
                  aria-label="Previous song"
                >
                  <SkipBack size={20} fill="currentColor" />
                </button>

                <button
                  className="grid h-10 w-10 place-items-center rounded-full border-0 bg-cream p-0 text-ink shadow-[0_7px_25px_rgba(0,0,0,0.25)] transition-all duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:translate-y-0 sm:h-[49px] sm:w-[49px]"
                  onClick={toggle}
                  disabled={!playerReady}
                  aria-label={isPlaying ? "Pause" : "Play"}
                >
                  {isPlaying ? (
                    <Pause size={21} fill="currentColor" />
                  ) : (
                    <Play size={21} fill="currentColor" />
                  )}
                </button>

                <button
                  className="grid h-8 w-8 place-items-center border-0 bg-transparent p-0 text-inherit opacity-55 transition-all duration-200 hover:-translate-y-0.5 hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:translate-y-0 sm:h-[35px] sm:w-[35px]"
                  onClick={next}
                  disabled={!playerReady}
                  aria-label="Next song"
                >
                  <SkipForward size={20} fill="currentColor" />
                </button>
              </div>
            </div>

            {!playerReady && (
              <div className="absolute right-0 bottom-2.5 left-0 text-center font-mono text-[8px] tracking-[0.1em] uppercase opacity-35 sm:block">
                preparing the ride…
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
