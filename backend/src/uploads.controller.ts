import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
  ServiceUnavailableException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtService } from '@nestjs/jwt';
import { Request, Response } from 'express';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Db } from './db';
import { Actor, Principal, Public, Roles } from './auth/access';
const root = path.resolve('uploads');
function client() {
  return new S3Client({
    region: process.env.S3_REGION || 'auto',
    ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT, forcePathStyle: true } : {}),
    ...(process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
      ? {
          credentials: {
            accessKeyId: process.env.S3_ACCESS_KEY_ID,
            secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
          },
        }
      : {}),
  });
}
@Controller('uploads')
export class UploadsController {
  constructor(
    private db: Db,
    private jwt: JwtService,
  ) {}
  @Roles('VENDOR_OWNER')
  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  async upload(
    @Actor() u: Principal,
    @Query('scope') scope: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!['PRODUCT', 'KYC'].includes(scope) || !file)
      throw new BadRequestException('Choose a product image or KYC document');
    const b = file.buffer;
    let contentType = '',
      extension = '';
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
      contentType = 'image/jpeg';
      extension = 'jpg';
    } else if (b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
      contentType = 'image/png';
      extension = 'png';
    } else if (b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP') {
      contentType = 'image/webp';
      extension = 'webp';
    } else if (scope === 'KYC' && b.subarray(0, 5).toString() === '%PDF-') {
      contentType = 'application/pdf';
      extension = 'pdf';
    } else throw new BadRequestException('Only JPEG, PNG, WebP and KYC PDFs are accepted');
    const objectKey = `${scope.toLowerCase()}/${u.id}/${randomUUID()}.${extension}`;
    if (process.env.S3_BUCKET)
      await client().send(
        new PutObjectCommand({
          Bucket: process.env.S3_BUCKET,
          Key: objectKey,
          Body: b,
          ContentType: contentType,
          ServerSideEncryption: 'AES256',
        }),
      );
    else {
      if (process.env.NODE_ENV === 'production')
        throw new ServiceUnavailableException('Private object storage is not configured');
      const target = path.join(root, objectKey);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, b, { flag: 'wx' });
    }
    const record = await this.db.upload.create({
      data: { userId: u.id, scope, objectKey, contentType, size: b.length },
    });
    return { id: record.id, url: `/api/uploads/${record.id}` };
  }
  @Public() @Get(':id') async get(
    @Param('id') id: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const record = await this.db.upload.findUnique({ where: { id } });
    if (!record) throw new NotFoundException();
    if (record.scope === 'KYC') {
      try {
        const token = await this.jwt.verifyAsync(req.cookies?.session);
        const u = await this.db.user.findUniqueOrThrow({ where: { id: token.sub } });
        if (u.id !== record.userId && u.role !== 'PLATFORM_ADMIN') throw new Error();
      } catch {
        throw new ForbiddenException('This verification document is private');
      }
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="verification-${record.id}.${record.contentType === 'application/pdf' ? 'pdf' : 'image'}"`,
      );
    } else res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (process.env.S3_BUCKET)
      return res.redirect(
        await getSignedUrl(
          client(),
          new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: record.objectKey }),
          { expiresIn: 60 },
        ),
      );
    return res.type(record.contentType).sendFile(path.join(root, record.objectKey), (error) => {
      if (error && !res.headersSent) {
        res.setHeader('Cache-Control', 'no-store');
        res.status(404).json({ message: 'Uploaded file is unavailable' });
      }
    });
  }
}
