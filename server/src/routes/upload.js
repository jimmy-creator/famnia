import { Router } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { protect, admin } from '../middleware/auth.js';
import { uploadsDir } from '../config/uploadsDir.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const storage = multer.memoryStorage(); // Use memory for processing

const fileFilter = (req, file, cb) => {
  const allowedMime = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (allowedMime.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only image files (jpg, png, webp, gif) are allowed'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB input (will be compressed)
});

// Process and save image as optimized WebP + thumbnail
async function processImage(buffer, maxWidth = 1200) {
  const uniqueName = crypto.randomBytes(12).toString('hex');
  const filename = `${uniqueName}.webp`;
  const thumbFilename = `${uniqueName}_thumb.webp`;
  const filepath = path.join(uploadsDir, filename);
  const thumbPath = path.join(uploadsDir, thumbFilename);

  await Promise.all([
    sharp(buffer)
      .resize(maxWidth, null, { withoutEnlargement: true, fit: 'inside' })
      .webp({ quality: 80 })
      .toFile(filepath),
    sharp(buffer)
      .resize(480, null, { withoutEnlargement: true, fit: 'inside' })
      .webp({ quality: 72 })
      .toFile(thumbPath),
  ]);

  return { url: `/uploads/${filename}`, thumb: `/uploads/${thumbFilename}`, filename };
}

// Generate thumbnail for an existing image (on-demand)
async function getOrCreateThumb(filename) {
  const baseName = filename.replace(/\.webp$/, '');
  const thumbFilename = `${baseName}_thumb.webp`;
  const thumbPath = path.join(uploadsDir, thumbFilename);

  if (fs.existsSync(thumbPath)) return thumbFilename;

  const originalPath = path.join(uploadsDir, filename);
  if (!fs.existsSync(originalPath)) return null;

  await sharp(originalPath)
    .resize(480, null, { withoutEnlargement: true, fit: 'inside' })
    .webp({ quality: 72 })
    .toFile(thumbPath);

  return thumbFilename;
}

// Generate a JPEG social-preview (OG) image for an existing .webp (on-demand).
// WhatsApp/Facebook crawlers don't reliably render WebP og:images, so we serve
// a flattened JPEG sized for link previews, cached on disk.
async function getOrCreateOg(filename) {
  const baseName = filename.replace(/\.(webp|jpe?g|png)$/i, '');
  const ogFilename = `${baseName}_og.jpg`;
  const ogPath = path.join(uploadsDir, ogFilename);

  if (fs.existsSync(ogPath)) return ogFilename;

  const originalPath = path.join(uploadsDir, `${baseName}.webp`);
  if (!fs.existsSync(originalPath)) return null;

  await sharp(originalPath)
    .resize(1200, 1200, { withoutEnlargement: true, fit: 'inside' })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 82 })
    .toFile(ogPath);

  return ogFilename;
}

const router = Router();

// Upload single image
router.post('/', protect, admin, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No image file provided' });
    }

    // Determine max width based on usage
    const maxWidth = req.body.type === 'hero' ? 1920 : req.body.type === 'category' ? 400 : 1200;
    const result = await processImage(req.file.buffer, maxWidth);
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: 'Image processing failed' });
  }
});

// Upload multiple images (up to 5)
router.post('/multiple', protect, admin, upload.array('images', 5), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No image files provided' });
    }
    const results = [];
    for (const file of req.files) {
      const result = await processImage(file.buffer);
      results.push(result);
    }
    res.json(results);
  } catch (error) {
    res.status(500).json({ message: 'Image processing failed' });
  }
});

// Serve JPEG OG/social preview — generates on first request, cached on disk
router.get('/og/:filename', async (req, res) => {
  try {
    const ogFilename = await getOrCreateOg(req.params.filename);
    if (!ogFilename) return res.status(404).json({ message: 'Image not found' });

    res.type('image/jpeg').setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.sendFile(path.join(uploadsDir, ogFilename));
  } catch (error) {
    res.status(500).json({ message: 'OG image generation failed' });
  }
});

// Serve thumbnail — generates on first request, then cached on disk
router.get('/thumb/:filename', async (req, res) => {
  try {
    const thumbFilename = await getOrCreateThumb(req.params.filename);
    if (!thumbFilename) return res.status(404).json({ message: 'Image not found' });

    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.sendFile(path.join(uploadsDir, thumbFilename));
  } catch (error) {
    res.status(500).json({ message: 'Thumbnail generation failed' });
  }
});

export default router;
