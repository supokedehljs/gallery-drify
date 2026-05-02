import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

type EagleFolder = { id: string; name: string; children?: EagleFolder[] };
type EagleLibraryMetadata = { folders?: EagleFolder[] };
type EagleImageMetadata = {
  id: string;
  name: string;
  ext: string;
  width?: number;
  height?: number;
  folders?: string[];
  isDeleted?: boolean;
  url?: string;
  btime?: number;
};
type EagleImageItem = {
  itemId: string;
  metadataId: string;
  name: string;
  ext: string;
  width: number | null;
  height: number | null;
  btime: number;
  url: string;
  imagePath: string;
};

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif']);

function normalizeLibraryPath(input: string | null) {
  if (!input) return '';
  return path.resolve(input.trim());
}

function readJsonFile<T>(targetPath: string): T {
  return JSON.parse(fs.readFileSync(targetPath, 'utf8')) as T;
}

function flattenFolders(folders: EagleFolder[], depth = 0, parentPath = '') {
  return folders.flatMap((folder) => {
    const currentPath = parentPath ? `${parentPath} / ${folder.name}` : folder.name;
    const current = { id: folder.id, name: folder.name, depth, path: currentPath };
    return [current, ...flattenFolders(folder.children ?? [], depth + 1, currentPath)];
  });
}

function readLibraryFolders(libraryPath: string) {
  const metadataPath = path.join(libraryPath, 'metadata.json');
  return flattenFolders(readJsonFile<EagleLibraryMetadata>(metadataPath).folders ?? []);
}

function isThumbnailFileName(fileName: string) {
  const normalized = fileName.toLowerCase();
  return normalized.includes('_thumbnail') || normalized.includes('_ thumbnail');
}

function resolveImagePath(infoDir: string, metadata: EagleImageMetadata, ext: string) {
  const preferredFilename = `${metadata.name}.${metadata.ext}`;
  const preferredPath = path.join(infoDir, preferredFilename);

  if (fs.existsSync(preferredPath) && !isThumbnailFileName(preferredFilename)) {
    return preferredPath;
  }

  const fallback = fs
    .readdirSync(infoDir)
    .find((fileName) => fileName.toLowerCase().endsWith(`.${ext}`) && !isThumbnailFileName(fileName));

  return fallback ? path.join(infoDir, fallback) : null;
}

function readLibraryImages(libraryPath: string) {
  const imagesRoot = path.join(libraryPath, 'images');
  const entries = fs.readdirSync(imagesRoot, { withFileTypes: true });

  const items = entries
    .filter((entry) => entry.isDirectory() && entry.name.endsWith('.info'))
    .map((entry) => {
      try {
        const infoDir = path.join(imagesRoot, entry.name);
        const metadataPath = path.join(infoDir, 'metadata.json');
        if (!fs.existsSync(metadataPath)) {
          return null;
        }

        const metadata = readJsonFile<EagleImageMetadata>(metadataPath);
        const ext = metadata.ext?.toLowerCase();

        if (metadata.isDeleted || !ext || !IMAGE_EXTENSIONS.has(ext)) {
          return null;
        }

        const imagePath = resolveImagePath(infoDir, metadata, ext);
        if (!imagePath) {
          return null;
        }

        return {
          itemId: entry.name.replace(/\.info$/i, ''),
          metadataId: metadata.id,
          name: metadata.name,
          ext: metadata.ext,
          width: metadata.width ?? null,
          height: metadata.height ?? null,
          btime: metadata.btime ?? 0,
          url: metadata.url ?? '',
          imagePath
        } satisfies EagleImageItem;
      } catch {
        return null;
      }
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((a, b) => b.btime - a.btime);

  return items;
}

function createEaglePlugin(): Plugin {
  return {
    name: 'gallery-drift-eagle-api',
    configureServer(server) {
      server.middlewares.use('/api/eagle/folders', (req, res) => {
        try {
          const requestUrl = new URL(req.url ?? '', 'http://localhost');
          const libraryPath = normalizeLibraryPath(requestUrl.searchParams.get('libraryPath'));

          if (!libraryPath) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ error: 'Missing libraryPath.' }));
            return;
          }

          const folders = readLibraryFolders(libraryPath);
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ folders }));
        } catch (error) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
        }
      });

      server.middlewares.use('/api/eagle/images', (req, res) => {
        try {
          const requestUrl = new URL(req.url ?? '', 'http://localhost');
          const libraryPath = normalizeLibraryPath(requestUrl.searchParams.get('libraryPath'));

          if (!libraryPath) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ error: 'Missing libraryPath.' }));
            return;
          }

          const images = readLibraryImages(libraryPath).map((item) => ({
            id: item.metadataId,
            name: item.name,
            ext: item.ext,
            width: item.width,
            height: item.height,
            url: item.url,
            src: `/api/eagle/file?path=${encodeURIComponent(item.imagePath)}`
          }));

          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ images }));
        } catch (error) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
        }
      });

      server.middlewares.use('/api/eagle/file', (req, res) => {
        try {
          const requestUrl = new URL(req.url ?? '', 'http://localhost');
          const filePath = path.resolve(requestUrl.searchParams.get('path') ?? '');

          if (!filePath) {
            res.statusCode = 400;
            res.end('Missing path.');
            return;
          }

          if (!fs.existsSync(filePath)) {
            res.statusCode = 404;
            res.end('Image not found.');
            return;
          }

          const ext = path.extname(filePath).slice(1).toLowerCase();
          const mimeType =
            ext === 'png'
              ? 'image/png'
              : ext === 'webp'
                ? 'image/webp'
                : ext === 'gif'
                  ? 'image/gif'
                  : ext === 'bmp'
                    ? 'image/bmp'
                    : ext === 'avif'
                      ? 'image/avif'
                      : 'image/jpeg';

          res.statusCode = 200;
          res.setHeader('Content-Type', mimeType);
          fs.createReadStream(filePath).pipe(res);
        } catch (error) {
          res.statusCode = 500;
          res.end(error instanceof Error ? error.message : String(error));
        }
      });

      server.middlewares.use('/api/eagle/image', (req, res) => {
        try {
          const requestUrl = new URL(req.url ?? '', 'http://localhost');
          const libraryPath = normalizeLibraryPath(requestUrl.searchParams.get('libraryPath'));
          const itemId = requestUrl.searchParams.get('itemId') ?? '';

          if (!libraryPath || !itemId) {
            res.statusCode = 400;
            res.end('Missing libraryPath or itemId.');
            return;
          }

          const infoDir = path.join(libraryPath, 'images', `${itemId}.info`);
          const metadata = readJsonFile<EagleImageMetadata>(path.join(infoDir, 'metadata.json'));
          const ext = metadata.ext.toLowerCase();
          const finalPath = resolveImagePath(infoDir, metadata, ext);

          if (!finalPath || !fs.existsSync(finalPath)) {
            res.statusCode = 404;
            res.end('Image not found.');
            return;
          }

          const mimeType =
            ext === 'png'
              ? 'image/png'
              : ext === 'webp'
                ? 'image/webp'
                : ext === 'gif'
                  ? 'image/gif'
                  : ext === 'bmp'
                    ? 'image/bmp'
                    : ext === 'avif'
                      ? 'image/avif'
                      : 'image/jpeg';

          res.statusCode = 200;
          res.setHeader('Content-Type', mimeType);
          fs.createReadStream(finalPath).pipe(res);
        } catch (error) {
          res.statusCode = 500;
          res.end(error instanceof Error ? error.message : String(error));
        }
      });
    }
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), createEaglePlugin()],
  server: {
    host: '0.0.0.0',
    port: 4173
  }
});
