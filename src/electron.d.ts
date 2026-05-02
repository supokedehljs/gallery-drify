export {};

declare global {
  interface Window {
    galleryDrift?: {
      toggleFullscreen: () => Promise<boolean>;
      isFullscreen: () => Promise<boolean>;
    };
  }
}
