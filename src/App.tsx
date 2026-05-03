import { useEffect, useMemo, useRef, useState } from 'react';

type AudioMode = 'muted' | 'sound';

type DemoSlide = {
  id: string;
  title: string;
  annotation: string;
  mediaType: 'image' | 'video';
  image: string;
};

type EagleImage = {
  id: string;
  name: string;
  ext: string;
  width: number | null;
  height: number | null;
  url: string;
  annotation: string;
  mediaType: 'image' | 'video';
  src: string;
};

type EagleImagesResponse = {
  images?: EagleImage[];
  error?: string;
};

type Slide = {
  id: string;
  title: string;
  annotation: string;
  image: string;
  mediaType: 'image' | 'video';
};

const demoSlides: DemoSlide[] = [
  {
    id: 'aurora',
    title: 'Aurora',
    annotation: '夜色、薄雾与缓慢轮播的画面更适合长时间展示。',
    mediaType: 'image',
    image:
      'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1800&q=80'
  },
  {
    id: 'city',
    title: 'City',
    annotation: '当真实图片尚未载入时，这里会先保留示例图与说明文字。',
    mediaType: 'image',
    image:
      'https://images.unsplash.com/photo-1493246507139-91e8fad9978e?auto=format&fit=crop&w=1800&q=80'
  },
  {
    id: 'studio',
    title: 'Studio',
    annotation: '如果图片在 Eagle 中写了注释，这里会优先显示注释而不是图片名字。',
    mediaType: 'image',
    image:
      'https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=1800&q=80'
  }
];

const AUTO_REFRESH_MS = 15000;
const DEFAULT_LIBRARY_PATH = 'D:\\OneDrive\\参考\\李杰.library';
const DEFAULT_ROTATE_SECONDS = 8;
const DEFAULT_SHOW_CLOCK = true;
const PATH_STORAGE_KEY = 'gallery-drift.eagle-library-path';
const DURATION_STORAGE_KEY = 'gallery-drift.slide-duration-seconds';
const CLOCK_STORAGE_KEY = 'gallery-drift.show-clock';
const AUDIO_MODE_STORAGE_KEY = 'gallery-drift.audio-mode';

function clampDurationSeconds(value: number) {
  if (!Number.isFinite(value)) {
    return DEFAULT_ROTATE_SECONDS;
  }

  return Math.min(3600, Math.max(2, Math.round(value)));
}

function shuffleSlides(items: Slide[]) {
  return [...items]
    .map((item) => ({ item, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ item }) => item);
}

function buildSlides(images: EagleImage[]): Slide[] {
  return shuffleSlides(
    images.map((image) => ({
      id: image.id,
      title: image.name?.trim() || '未命名图片',
      annotation: image.annotation.trim(),
      mediaType: image.mediaType,
      image: image.src
    }))
  );
}

export default function App() {
  const initialLibraryPath = localStorage.getItem(PATH_STORAGE_KEY) || DEFAULT_LIBRARY_PATH;
  const initialDurationSeconds = clampDurationSeconds(Number(localStorage.getItem(DURATION_STORAGE_KEY)) || DEFAULT_ROTATE_SECONDS);
  const initialShowClock = localStorage.getItem(CLOCK_STORAGE_KEY);
  const initialAudioMode = (localStorage.getItem(AUDIO_MODE_STORAGE_KEY) as AudioMode | null) ?? 'muted';

  const [activeIndex, setActiveIndex] = useState(0);
  const [slides, setSlides] = useState<Slide[]>(demoSlides);
  const [isPaused, setIsPaused] = useState(false);
  const [isVideoHold, setIsVideoHold] = useState(false);
  const [lastLibrarySignature, setLastLibrarySignature] = useState('');
  const [statusText, setStatusText] = useState('右键打开菜单，选择“设置”后输入 Eagle 库路径。');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [usingDemoSlides, setUsingDemoSlides] = useState(true);

  const [appliedLibraryPath, setAppliedLibraryPath] = useState(initialLibraryPath);
  const [loadVersion, setLoadVersion] = useState(1);

  const [draftLibraryPath, setDraftLibraryPath] = useState(initialLibraryPath);
  const [slideDurationSeconds, setSlideDurationSeconds] = useState(initialDurationSeconds);
  const [showClock, setShowClock] = useState(initialShowClock === null ? DEFAULT_SHOW_CLOCK : initialShowClock === 'true');
  const [audioMode, setAudioMode] = useState<AudioMode>(initialAudioMode === 'sound' ? 'sound' : 'muted');
  const [clockText, setClockText] = useState('');
  const [clockAngles, setClockAngles] = useState({ hour: 0, minute: 0 });
  const [draftSlideDurationSeconds, setDraftSlideDurationSeconds] = useState(String(initialDurationSeconds));
  const [draftShowClock, setDraftShowClock] = useState(initialShowClock === null ? DEFAULT_SHOW_CLOCK : initialShowClock === 'true');
  const [openAtLogin, setOpenAtLogin] = useState(false);
  const [draftOpenAtLogin, setDraftOpenAtLogin] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState('请输入 Eagle 库路径，确认后将轮播整个库中的图片。');
  const rotateMs = slideDurationSeconds * 1000;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const activeIndexRef = useRef(activeIndex);
  const slidesRef = useRef(slides);

  const setActiveVideoRef = (element: HTMLVideoElement | null, isActive: boolean) => {
    if (isActive) {
      videoRef.current = element;
      return;
    }

    if (element) {
      element.pause();
      element.currentTime = 0;
      element.muted = true;
    }
  };

  const goToNextSlide = () => {
    setActiveIndex((current) => (current + 1) % slides.length);
  };

  const toggleAudioMode = () => {
    setAudioMode((current) => {
      const nextMode: AudioMode = current === 'sound' ? 'muted' : 'sound';
      localStorage.setItem(AUDIO_MODE_STORAGE_KEY, nextMode);
      return nextMode;
    });
  };

  const goToPreviousSlide = () => {
    setActiveIndex((current) => (current - 1 + slides.length) % slides.length);
  };

  useEffect(() => {
    const activeSlide = slides[activeIndex];
    if (isPaused || !activeSlide || activeSlide.mediaType === 'video') {
      return;
    }

    const timer = window.setTimeout(() => {
      goToNextSlide();
    }, rotateMs);

    return () => window.clearTimeout(timer);
  }, [activeIndex, isPaused, rotateMs, slides]);


  useEffect(() => {
    activeIndexRef.current = activeIndex;
    slidesRef.current = slides;
  }, [activeIndex, slides]);

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const formatter = new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
      const hours = now.getHours() % 12;
      const minutes = now.getMinutes();
      setClockText(formatter.format(now));
      setClockAngles({
        hour: hours * 30 + minutes * 0.5,
        minute: minutes * 6
      });
    };

    updateClock();
    const timer = window.setInterval(updateClock, 10000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    void window.galleryDrift?.getStartupSetting().then((state) => {
      setOpenAtLogin(Boolean(state?.openAtLogin));
      setDraftOpenAtLogin(Boolean(state?.openAtLogin));
    });
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === 'a') {
        event.preventDefault();
        goToPreviousSlide();
      } else if (key === 'd') {
        event.preventDefault();
        goToNextSlide();
      } else if (key === 's') {
        event.preventDefault();
        if ((slides[activeIndex] ?? demoSlides[0]).mediaType === 'video') {
          setIsVideoHold((current) => !current);
        } else {
          setIsPaused((current) => !current);
        }
      } else if (key === 'delete') {
        event.preventDefault();
        const currentSlide = slides[activeIndex] ?? demoSlides[0];
        if (!currentSlide || !appliedLibraryPath || usingDemoSlides) {
          return;
        }

        void window.galleryDrift?.deleteItem(appliedLibraryPath, currentSlide.id).then(() => {
          setLoadVersion((current) => current + 1);
        });
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeIndex, slides]);

  useEffect(() => {
    const video = videoRef.current;
    const currentSlide = slides[activeIndex] ?? demoSlides[0];
    if (!video || currentSlide.mediaType !== 'video') {
      return;
    }

    video.loop = isVideoHold;
    video.muted = audioMode !== 'sound';
    void video.play().catch(() => undefined);
  }, [activeIndex, audioMode, isVideoHold, slides]);

  useEffect(() => {
    const currentSlide = slides[activeIndex] ?? demoSlides[0];
    if (currentSlide.mediaType !== 'video' && isVideoHold) {
      setIsVideoHold(false);
    }
  }, [activeIndex, isVideoHold, slides]);

  useEffect(() => {
    const dispose = window.galleryDrift?.onOpenSettings(() => {
      setDraftLibraryPath(appliedLibraryPath || initialLibraryPath);
      setDraftSlideDurationSeconds(String(slideDurationSeconds));
      setDraftShowClock(showClock);
      setDraftOpenAtLogin(openAtLogin);
      setSettingsMessage('请输入 Eagle 库路径，并设置每张图片停留时间。');
      setIsSettingsOpen(true);
    });

    return () => {
      dispose?.();
    };
  }, [appliedLibraryPath, initialLibraryPath, showClock, slideDurationSeconds]);

  useEffect(() => {
    if (!appliedLibraryPath) {
      return;
    }

    let isCancelled = false;

    const fetchImages = async (isBackgroundRefresh = false) => {
      if (!isBackgroundRefresh) {
        setIsApplying(true);
        setStatusText('正在加载整个 Eagle 库中的真实图片…');
      }

      try {
        const data = window.galleryDrift?.loadImages
          ? await window.galleryDrift.loadImages(appliedLibraryPath)
          : await fetch(`/api/eagle/images?libraryPath=${encodeURIComponent(appliedLibraryPath)}`).then(async (response) => {
              const payload = (await response.json()) as EagleImagesResponse;
              if (!response.ok) {
                throw new Error(payload.error || '读取 Eagle 图片失败。');
              }

              return payload;
            });

        if (data.error) {
          throw new Error(data.error || '读取 Eagle 图片失败。');
        }

        if (isCancelled) {
          return;
        }

        const images = data.images ?? [];
        if (images.length === 0) {
          setSlides(demoSlides);
          setUsingDemoSlides(true);
          setActiveIndex(0);
          setLastLibrarySignature('');
          setStatusText('当前库里没有可展示图片，当前显示示例图片。');
          return;
        }

        const signature = images.map((image) => image.id).sort().join('|');
        if (isBackgroundRefresh && signature === lastLibrarySignature) {
          return;
        }

        const nextSlides = buildSlides(images);
        const currentSlideId = slidesRef.current[activeIndexRef.current]?.id;
        const nextActiveIndex = currentSlideId ? nextSlides.findIndex((slide) => slide.id === currentSlideId) : -1;

        setSlides(nextSlides);
        setUsingDemoSlides(false);
        setActiveIndex(nextActiveIndex >= 0 ? nextActiveIndex : 0);
        setLastLibrarySignature(signature);
        setStatusText(
          isBackgroundRefresh
            ? `图片库已自动刷新，共 ${images.length} 张。`
            : `已加载整个库中的真实图片，共 ${images.length} 张（已自动排除缩略图）。`
        );
      } catch (error) {
        if (isCancelled) {
          return;
        }

        setSlides(demoSlides);
        setUsingDemoSlides(true);
        setActiveIndex(0);
        setLastLibrarySignature('');
        setStatusText(error instanceof Error ? `真实图片加载失败：${error.message}` : '真实图片加载失败。');
      } finally {
        if (!isCancelled && !isBackgroundRefresh) {
          setIsApplying(false);
        }
      }
    };

    void fetchImages(false);
    const refreshTimer = window.setInterval(() => {
      void fetchImages(true);
    }, AUTO_REFRESH_MS);

    return () => {
      isCancelled = true;
      window.clearInterval(refreshTimer);
    };
  }, [appliedLibraryPath, lastLibrarySignature, loadVersion]);

  const activeSlide = slides[activeIndex] ?? demoSlides[0];
  const hasAnnotation = Boolean(activeSlide.annotation.trim());
  const isVideoActive = activeSlide.mediaType === 'video';
  const showPausedBadge = isVideoActive ? isVideoHold : isPaused;
  const playbackBadgeText = '∞';
  const isAudioEnabled = audioMode === 'sound';
  const audioButtonLabel = isAudioEnabled ? '关闭声音' : '打开声音';
  const clockNumbers = Array.from({ length: 12 }, (_, index) => index + 1);

  const progressStyle = useMemo(
    () => ({
      animationDuration: `${rotateMs}ms`
    }),
    [rotateMs]
  );

  const closeSettings = () => {
    setIsSettingsOpen(false);
  };

  const applySettings = () => {
    const nextPath = draftLibraryPath.trim();
    if (!nextPath) {
      setSettingsMessage('请先输入 Eagle 库路径。');
      return;
    }

    const nextDurationSeconds = clampDurationSeconds(Number(draftSlideDurationSeconds));

    setAppliedLibraryPath(nextPath);
    setSlideDurationSeconds(nextDurationSeconds);
    setShowClock(draftShowClock);
    setOpenAtLogin(draftOpenAtLogin);
    void window.galleryDrift?.setStartupSetting(draftOpenAtLogin);
    setLoadVersion((current) => current + 1);
    localStorage.setItem(PATH_STORAGE_KEY, nextPath);
    localStorage.setItem(DURATION_STORAGE_KEY, String(nextDurationSeconds));
    localStorage.setItem(CLOCK_STORAGE_KEY, String(draftShowClock));
    setStatusText('设置已确认，正在重新加载整个库中的真实图片…');
    setIsSettingsOpen(false);
  };

  return (
    <main className="app-shell">
      <header className="titlebar" aria-hidden="true">
        <div className="titlebar-drag-region" />
      </header>

      <section className="content-panel no-annotation">
        <section className="gallery-panel">
          <div className="image-frame">
            {slides.map((slide, index) => (
              <div key={slide.id} className={`slide-layer ${index === activeIndex ? 'is-active' : ''}`}>
                {slide.mediaType === 'video' ? (
                  <>
                    <video
                      className="stage-backdrop-video"
                      src={slide.image}
                      muted
                      loop
                      autoPlay={index === activeIndex}
                      playsInline
                    />
                    <video
                      ref={(element) => setActiveVideoRef(element, index === activeIndex)}
                      className="stage-video"
                      src={slide.image}
                      muted={audioMode !== 'sound'}
                      autoPlay={index === activeIndex}
                      playsInline
                      onEnded={goToNextSlide}
                    />
                  </>
                ) : (
                  <>
                    <div className="stage-backdrop" style={{ backgroundImage: `url(${slide.image})` }} />
                    <div className="stage-image" style={{ backgroundImage: `url(${slide.image})` }} />
                  </>
                )}
              </div>
            ))}
            <div className="image-overlay" />
            {showClock ? <div className="clock-corner-gradient" aria-hidden="true" /> : null}
            {showPausedBadge ? <div className="playback-badge">{playbackBadgeText}</div> : null}
            <div className="image-caption">
              <div className="image-title-wrap">
                <div className="image-title-shell">
                  <button
                    type="button"
                    className="audio-toggle-button audio-toggle-button-inline"
                    onClick={toggleAudioMode}
                    aria-label={audioButtonLabel}
                    aria-pressed={isAudioEnabled}
                    title={audioButtonLabel}
                  >
                    <span className="audio-toggle-glyph" aria-hidden="true">
                      <span className="audio-toggle-speaker" />
                      {!isAudioEnabled ? <span className="audio-toggle-mute-slash" /> : null}
                    </span>
                  </button>
                  <div className="image-title">{activeSlide.title}</div>
                </div>
              </div>
              {hasAnnotation ? <div className="image-annotation">{activeSlide.annotation}</div> : null}
            </div>
            {showClock ? (
              <div className="image-clock" aria-label={clockText}>
                {clockNumbers.map((number) => (
                  <span
                    key={number}
                    className="clock-number"
                    style={{ transform: `translate(-50%, -50%) rotate(${number * 30}deg) translateY(-78px) rotate(-${number * 30}deg)` }}
                  >
                    {number}
                  </span>
                ))}
                <div className="clock-hand clock-hand-hour" style={{ transform: `translateX(-50%) rotate(${clockAngles.hour}deg)` }} />
                <div className="clock-hand clock-hand-minute" style={{ transform: `translateX(-50%) rotate(${clockAngles.minute}deg)` }} />
                <div className="clock-center-dot" />
              </div>
            ) : null}
          </div>
        </section>
      </section>

      <div className="bottom-progress" aria-hidden="true">
        <div key={activeSlide.id} className="bottom-progress-bar" style={progressStyle} />
      </div>

      {isSettingsOpen ? (
        <div className="modal-backdrop" onClick={closeSettings}>
          <section
            className="settings-modal"
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            <div className="modal-header">
              <div>
                <p className="modal-eyebrow">设置</p>
                <h2>Gallery Drift</h2>
                <p className="modal-subtitle">集中管理图片来源、播放节奏与系统行为。</p>
              </div>
              <button className="ghost-button" onClick={closeSettings} aria-label="关闭设置面板">
                关闭
              </button>
            </div>

            <div className="settings-grid">
              <div className="settings-card settings-card-wide">
                <label className="settings-label" htmlFor="library-path">
                  Eagle 库路径
                </label>
                <input
                  id="library-path"
                  className="text-input"
                  value={draftLibraryPath}
                  onChange={(event) => setDraftLibraryPath(event.target.value)}
                  placeholder="输入 Eagle 库路径"
                />
              </div>

              <div className="settings-card">
                <label className="settings-label" htmlFor="slide-duration">
                  停留时间
                </label>
                <input
                  id="slide-duration"
                  className="text-input"
                  type="number"
                  min="2"
                  max="3600"
                  step="1"
                  value={draftSlideDurationSeconds}
                  onChange={(event) => setDraftSlideDurationSeconds(event.target.value)}
                  placeholder="例如 8"
                />
                <p className="settings-help">单位：秒，仅对图片生效。</p>
              </div>

              <label className="settings-card toggle-card" htmlFor="show-clock">
                <div>
                  <span className="settings-label">显示时钟</span>
                  <p className="settings-help">在右下角显示钟表。</p>
                </div>
                <input
                  id="show-clock"
                  className="toggle-input"
                  type="checkbox"
                  checked={draftShowClock}
                  onChange={(event) => setDraftShowClock(event.target.checked)}
                />
              </label>

              <label className="settings-card toggle-card" htmlFor="open-at-login">
                <div>
                  <span className="settings-label">开机启动</span>
                  <p className="settings-help">登录 Windows 后自动打开软件。</p>
                </div>
                <input
                  id="open-at-login"
                  className="toggle-input"
                  type="checkbox"
                  checked={draftOpenAtLogin}
                  onChange={(event) => setDraftOpenAtLogin(event.target.checked)}
                />
              </label>
            </div>

            <p className="settings-message">{settingsMessage}</p>

            <div className="modal-actions">
              <button className="secondary-button" onClick={closeSettings}>
                取消
              </button>
              <button className="primary-button" onClick={applySettings} disabled={isApplying}>
                {isApplying ? '处理中…' : '保存设置'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
