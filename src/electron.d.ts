export {};

type GalleryDriftImage = {
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

type GalleryDriftImagesResponse = {
  images?: GalleryDriftImage[];
  error?: string;
};

declare global {
  interface Window {
    galleryDrift?: {
      toggleFullscreen: () => Promise<boolean>;
      isFullscreen: () => Promise<boolean>;
      moveWindow: (deltaX: number, deltaY: number) => Promise<boolean>;
      loadImages: (libraryPath: string) => Promise<GalleryDriftImagesResponse>;
      deleteItem: (libraryPath: string, itemId: string) => Promise<{ success: boolean }>;
      onOpenSettings: (callback: () => void) => () => void;
    };
  }
}
