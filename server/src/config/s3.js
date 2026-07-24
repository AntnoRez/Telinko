import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';

// S3-совместимый клиент для MinIO (self-hosted рядом с приложением, приватный на localhost).
// endpoint/креды — из .env. forcePathStyle обязателен для MinIO (bucket в пути, не в поддомене).
export const BUCKET = process.env.S3_BUCKET;

export const s3 = new S3Client({
  region: process.env.S3_REGION || 'us-east-1',
  endpoint: process.env.S3_ENDPOINT, // напр. http://localhost:9000
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY,
  },
});

// Залить объект (буфер из multer) под ключом key.
export function putObject(key, body, contentType) {
  return s3.send(
    new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: contentType })
  );
}

// Забрать объект. range (опц.) — строка вида "bytes=0-1023" для перемотки видео.
// Ответ: { Body: Readable, ContentType, ContentLength, ContentRange, AcceptRanges }.
export function getObject(key, range) {
  return s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key, Range: range }));
}

// Батч-удаление (при очистке опустевшей комнаты). Пустой список — ничего не делаем.
export function deleteObjects(keys) {
  if (!keys || keys.length === 0) return Promise.resolve();
  return s3.send(
    new DeleteObjectsCommand({
      Bucket: BUCKET,
      Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
    })
  );
}
