var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
var IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif']);
function normalizeLibraryPath(input) {
    if (!input)
        return '';
    return path.resolve(input.trim());
}
function readJsonFile(targetPath) {
    return JSON.parse(fs.readFileSync(targetPath, 'utf8'));
}
function flattenFolders(folders, depth, parentPath) {
    if (depth === void 0) { depth = 0; }
    if (parentPath === void 0) { parentPath = ''; }
    return folders.flatMap(function (folder) {
        var _a;
        var currentPath = parentPath ? "".concat(parentPath, " / ").concat(folder.name) : folder.name;
        var current = { id: folder.id, name: folder.name, depth: depth, path: currentPath };
        return __spreadArray([current], flattenFolders((_a = folder.children) !== null && _a !== void 0 ? _a : [], depth + 1, currentPath), true);
    });
}
function readLibraryFolders(libraryPath) {
    var _a;
    var metadataPath = path.join(libraryPath, 'metadata.json');
    return flattenFolders((_a = readJsonFile(metadataPath).folders) !== null && _a !== void 0 ? _a : []);
}
function isThumbnailFileName(fileName) {
    var normalized = fileName.toLowerCase();
    return normalized.includes('_thumbnail') || normalized.includes('_ thumbnail');
}
function resolveImagePath(infoDir, metadata, ext) {
    var preferredFilename = "".concat(metadata.name, ".").concat(metadata.ext);
    var preferredPath = path.join(infoDir, preferredFilename);
    if (fs.existsSync(preferredPath) && !isThumbnailFileName(preferredFilename)) {
        return preferredPath;
    }
    var fallback = fs
        .readdirSync(infoDir)
        .find(function (fileName) { return fileName.toLowerCase().endsWith(".".concat(ext)) && !isThumbnailFileName(fileName); });
    return fallback ? path.join(infoDir, fallback) : null;
}
function readLibraryImages(libraryPath) {
    var imagesRoot = path.join(libraryPath, 'images');
    var entries = fs.readdirSync(imagesRoot, { withFileTypes: true });
    var items = entries
        .filter(function (entry) { return entry.isDirectory() && entry.name.endsWith('.info'); })
        .map(function (entry) {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        try {
            var infoDir = path.join(imagesRoot, entry.name);
            var metadataPath = path.join(infoDir, 'metadata.json');
            if (!fs.existsSync(metadataPath)) {
                return null;
            }
            var metadata = readJsonFile(metadataPath);
            var ext = (_a = metadata.ext) === null || _a === void 0 ? void 0 : _a.toLowerCase();
            if (metadata.isDeleted || !ext || !IMAGE_EXTENSIONS.has(ext)) {
                return null;
            }
            var imagePath = resolveImagePath(infoDir, metadata, ext);
            if (!imagePath) {
                return null;
            }
            return {
                itemId: entry.name.replace(/\.info$/i, ''),
                metadataId: metadata.id,
                name: metadata.name,
                ext: metadata.ext,
                width: (_b = metadata.width) !== null && _b !== void 0 ? _b : null,
                height: (_c = metadata.height) !== null && _c !== void 0 ? _c : null,
                btime: (_d = metadata.btime) !== null && _d !== void 0 ? _d : 0,
                url: (_e = metadata.url) !== null && _e !== void 0 ? _e : '',
                annotation: (_h = (_g = (_f = metadata.annotation) !== null && _f !== void 0 ? _f : metadata.comments) !== null && _g !== void 0 ? _g : metadata.description) !== null && _h !== void 0 ? _h : '',
                imagePath: imagePath
            };
        }
        catch (_j) {
            return null;
        }
    })
        .filter(function (item) { return Boolean(item); })
        .sort(function (a, b) { return b.btime - a.btime; });
    return items;
}
function createEaglePlugin() {
    return {
        name: 'gallery-drift-eagle-api',
        configureServer: function (server) {
            server.middlewares.use('/api/eagle/folders', function (req, res) {
                var _a;
                try {
                    var requestUrl = new URL((_a = req.url) !== null && _a !== void 0 ? _a : '', 'http://localhost');
                    var libraryPath = normalizeLibraryPath(requestUrl.searchParams.get('libraryPath'));
                    if (!libraryPath) {
                        res.statusCode = 400;
                        res.setHeader('Content-Type', 'application/json; charset=utf-8');
                        res.end(JSON.stringify({ error: 'Missing libraryPath.' }));
                        return;
                    }
                    var folders = readLibraryFolders(libraryPath);
                    res.setHeader('Content-Type', 'application/json; charset=utf-8');
                    res.end(JSON.stringify({ folders: folders }));
                }
                catch (error) {
                    res.statusCode = 500;
                    res.setHeader('Content-Type', 'application/json; charset=utf-8');
                    res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
                }
            });
            server.middlewares.use('/api/eagle/images', function (req, res) {
                var _a;
                try {
                    var requestUrl = new URL((_a = req.url) !== null && _a !== void 0 ? _a : '', 'http://localhost');
                    var libraryPath = normalizeLibraryPath(requestUrl.searchParams.get('libraryPath'));
                    if (!libraryPath) {
                        res.statusCode = 400;
                        res.setHeader('Content-Type', 'application/json; charset=utf-8');
                        res.end(JSON.stringify({ error: 'Missing libraryPath.' }));
                        return;
                    }
                    var images = readLibraryImages(libraryPath).map(function (item) { return ({
                        id: item.metadataId,
                        name: item.name,
                        ext: item.ext,
                        width: item.width,
                        height: item.height,
                        url: item.url,
                        annotation: item.annotation,
                        src: "/api/eagle/file?path=".concat(encodeURIComponent(item.imagePath))
                    }); });
                    res.setHeader('Content-Type', 'application/json; charset=utf-8');
                    res.end(JSON.stringify({ images: images }));
                }
                catch (error) {
                    res.statusCode = 500;
                    res.setHeader('Content-Type', 'application/json; charset=utf-8');
                    res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
                }
            });
            server.middlewares.use('/api/eagle/file', function (req, res) {
                var _a, _b;
                try {
                    var requestUrl = new URL((_a = req.url) !== null && _a !== void 0 ? _a : '', 'http://localhost');
                    var filePath = path.resolve((_b = requestUrl.searchParams.get('path')) !== null && _b !== void 0 ? _b : '');
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
                    var ext = path.extname(filePath).slice(1).toLowerCase();
                    var mimeType = ext === 'png'
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
                }
                catch (error) {
                    res.statusCode = 500;
                    res.end(error instanceof Error ? error.message : String(error));
                }
            });
            server.middlewares.use('/api/eagle/image', function (req, res) {
                var _a, _b;
                try {
                    var requestUrl = new URL((_a = req.url) !== null && _a !== void 0 ? _a : '', 'http://localhost');
                    var libraryPath = normalizeLibraryPath(requestUrl.searchParams.get('libraryPath'));
                    var itemId = (_b = requestUrl.searchParams.get('itemId')) !== null && _b !== void 0 ? _b : '';
                    if (!libraryPath || !itemId) {
                        res.statusCode = 400;
                        res.end('Missing libraryPath or itemId.');
                        return;
                    }
                    var infoDir = path.join(libraryPath, 'images', "".concat(itemId, ".info"));
                    var metadata = readJsonFile(path.join(infoDir, 'metadata.json'));
                    var ext = metadata.ext.toLowerCase();
                    var finalPath = resolveImagePath(infoDir, metadata, ext);
                    if (!finalPath || !fs.existsSync(finalPath)) {
                        res.statusCode = 404;
                        res.end('Image not found.');
                        return;
                    }
                    var mimeType = ext === 'png'
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
                }
                catch (error) {
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
        port: 4173,
        strictPort: false
    }
});
