import { useEffect, useMemo, useState } from 'react';

type DemoSlide = {
  id: string;
  title: string;
  subtitle: string;
  image: string;
  accent: string;
};

type EagleImage = {
  id: string;
  name: string;
  ext: string;
  width: number | null;
  height: number | null;
  url: string;
  src: string;
};

type EagleImagesResponse = {
  images?: EagleImage[];
  error?: string;
};

type Slide = {
  id: string;
  title: string;
  subtitle: string;
  image: string;
  accent: string;
};

const demoSlides: DemoSlide[] = [
  {
    id: 'aurora',
    title: '夜色画廊',
    subtitle: '在确认应用设置之前，这里会先保留示例画面。',
    image:
      'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1800&q=80',
    accent: 'rgba(202, 210, 224, 0.92)'
  },
  {
    id: 'city',
    title: '灰黑夜间风格',
    subtitle: '只保留简介区和图片区，让画面更安静、更适合长期展示。',
    image:
      'https://images.unsplash.com/photo-1493246507139-91e8fad9978e?auto=format&fit=crop&w=1800&q=80',
    accent: 'rgba(168, 177, 191, 0.92)'
  },
  {
    id: 'studio',
    title: '确认后再加载',
    subtitle: '设置面板中只需要指定 Eagle 库路径，确认应用后就会轮播整个库中的图片。',
    image:
      'https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=1800&q=80',
    accent: 'rgba(150, 161, 176, 0.92)'
  }
];

const DEFAULT_LIBRARY_PATH = 'D:\\OneDrive\\参考\\李杰.library';
const ROTATE_MS = 8000;
const PATH_STORAGE_KEY = 'gallery-drift.eagle-library-path';

function buildSlides(images: EagleImage[]): Slide[] {
  return images.map((image) => ({
    id: image.id,
    title: image.name,
    subtitle: image.url || '来自 Eagle 库中的本地素材',
    image: image.src,
    accent: 'rgba(168, 177, 191, 0.92)'
  }));
}

export default function App() {
  const initialLibraryPath = localStorage.getItem(PATH_STORAGE_KEY) || DEFAULT_LIBRARY_PATH;

  const [activeIndex, setActiveIndex] = useState(0);
  const [slides, setSlides] = useState<Slide[]>(demoSlides);
  const [statusText, setStatusText] = useState('请先点击右上角“设置”，输入 Eagle 库路径，然后确认应用。');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [usingDemoSlides, setUsingDemoSlides] = useState(true);

  const [appliedLibraryPath, setAppliedLibraryPath] = useState(initialLibraryPath);
  const [loadVersion, setLoadVersion] = useState(0);

  const [draftLibraryPath, setDraftLibraryPath] = useState(initialLibraryPath);
  const [isApplying, setIsApplying] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState('请输入 Eagle 库路径，确认后将轮播整个库中的图片。');

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % slides.length);
    }, ROTATE_MS);

    return () => window.clearInterval(timer);
  }, [slides.length]);

  useEffect(() => {
    if (!appliedLibraryPath || loadVersion === 0) {
      return;
    }

    const fetchImages = async () => {
      setIsApplying(true);
      setStatusText('正在加载整个 Eagle 库中的真实图片…');

      try {
        const response = await fetch(`/api/eagle/images?libraryPath=${encodeURIComponent(appliedLibraryPath)}`);
        const data = (await response.json()) as EagleImagesResponse;

        if (!response.ok || data.error) {
          throw new Error(data.error || '读取 Eagle 图片失败。');
        }

        const images = data.images ?? [];
        if (images.length === 0) {
          setSlides(demoSlides);
          setUsingDemoSlides(true);
          setActiveIndex(0);
          setStatusText('当前库里没有可展示图片，当前显示示例图片。');
          return;
        }

        const nextSlides = buildSlides(images);

        setSlides(nextSlides);
        setUsingDemoSlides(false);
        setActiveIndex(0);
        setStatusText(`已加载整个库中的真实图片，共 ${images.length} 张（已自动排除缩略图）。`);
      } catch (error) {
        setSlides(demoSlides);
        setUsingDemoSlides(true);
        setActiveIndex(0);
        setStatusText(error instanceof Error ? `真实图片加载失败：${error.message}` : '真实图片加载失败。');
      } finally {
        setIsApplying(false);
      }
    };

    void fetchImages();
  }, [appliedLibraryPath, loadVersion]);

  const activeSlide = slides[activeIndex] ?? demoSlides[0];

  const progressStyle = useMemo(
    () => ({
      animationDuration: `${ROTATE_MS}ms`
    }),
    []
  );

  const openSettings = () => {
    setDraftLibraryPath(appliedLibraryPath || initialLibraryPath);
    setSettingsMessage('请输入 Eagle 库路径，确认后将轮播整个库中的图片。');
    setIsSettingsOpen(true);
  };

  const closeSettings = () => {
    setIsSettingsOpen(false);
  };

  const applySettings = () => {
    const nextPath = draftLibraryPath.trim();
    if (!nextPath) {
      setSettingsMessage('请先输入 Eagle 库路径。');
      return;
    }

    setAppliedLibraryPath(nextPath);
    setLoadVersion((current) => current + 1);
    localStorage.setItem(PATH_STORAGE_KEY, nextPath);
    setStatusText('设置已确认，正在重新加载整个库中的真实图片…');
    setIsSettingsOpen(false);
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark">Gallery Drift</div>
        <button className="settings-trigger" onClick={openSettings}>
          设置
        </button>
      </header>

      <section className="content-panel">
        <section className="intro-panel">
          <p className="eyebrow" style={{ color: activeSlide.accent }}>
            Gallery Drift
          </p>
          <h1>{activeSlide.title}</h1>
          <p className="subtitle">{activeSlide.subtitle}</p>
          <div className="status-card">
            <p className="status-label">当前状态</p>
            <p className="status-text">{statusText}</p>
          </div>
          <div className="meta-row">
            <span>{isApplying ? '加载中' : usingDemoSlides ? '示例图' : '真实图片'}</span>
            <span className="meta-dot" />
            <span>
              {String(activeIndex + 1).padStart(2, '0')} / {String(slides.length).padStart(2, '0')}
            </span>
          </div>
          <div className="progress-wrap">
            <div key={activeSlide.id} className="progress-bar" style={progressStyle} />
          </div>
        </section>

        <section className="gallery-panel">
          <div className="image-frame">
            {slides.map((slide, index) => (
              <div
                key={slide.id}
                className={`stage-image ${index === activeIndex ? 'is-active' : ''}`}
                style={{ backgroundImage: `url(${slide.image})` }}
              />
            ))}
            <div className="image-overlay" />
          </div>
        </section>
      </section>

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
                <h2>统一配置图片来源</h2>
              </div>
              <button className="ghost-button" onClick={closeSettings} aria-label="关闭设置面板">
                关闭
              </button>
            </div>

            <div className="settings-block">
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

            <p className="settings-message">{settingsMessage}</p>

            <div className="modal-actions">
              <button className="ghost-button" onClick={closeSettings}>
                取消
              </button>
              <button className="primary-button" onClick={applySettings}>
                确认应用
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
