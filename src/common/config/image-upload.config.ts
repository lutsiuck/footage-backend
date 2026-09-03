import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { rm } from 'fs/promises';
import { diskStorage } from 'multer';
import * as path from 'path';

export function imageUploadConfig(folder: string) {
  const destination = path.join(process.cwd(), 'uploads', folder);

  return {
    storage: diskStorage({
      destination: (req, file, cb) => {
        if (!existsSync(destination)) {
          mkdirSync(destination, { recursive: true });
        }
        cb(null, destination);
      },
      filename: (req, file, cb) => {
        cb(null, `${randomUUID()}${path.extname(file.originalname).toLowerCase()}`);
      },
    }),
  };
}

export function buildUploadedImagePath(folder: string, filename: string) {
  return `/uploads/${folder}/${filename}`;
}

export async function deleteUploadedImage(publicPath?: string | null) {
  if (!publicPath?.startsWith('/uploads/')) {
    return;
  }

  const relativePath = publicPath.replace('/uploads/', '');
  const absolutePath = path.resolve(process.cwd(), 'uploads', relativePath);

  if (!absolutePath.startsWith(path.resolve(process.cwd(), 'uploads'))) {
    return;
  }

  await rm(absolutePath, { force: true });
}
