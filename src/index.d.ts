// index.d.ts
import { RouteHandlerMethod, FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { S3Client } from '@aws-sdk/client-s3';

import chokidar from 'chokidar';

export interface LightningPageOptions {
  port?: number;
  cdn_baseurl?: string;
  script_sources?: string[];
  img_sources?: string[];
  connect_sources?: string[];
  compression?: any;
}

export class LightningPages {
  public CDN_ROOT_URI: string;
  public projectRoot: string;
  public cdn?: DigitalOceanCDN;
  public images: ImageHandler;
  private readonly port: number;
  private readonly fastify: FastifyInstance;
  private readonly defaultCSSPath: string;
  private readonly debouncedGetRawCSSCached: Function;
  private cssFileWatcher: chokidar.FSWatcher | null;
  private globalCSS: string;
  private cssUpdateTime?: Date;

  constructor(options: LightningPageOptions);
  public page(url: string, callback: RouteHandlerMethod): void;
  getPageCSS(): string;
  private getRawCSS(cssPath?: string): Promise<string>;
  private getRawCSSCached(cssPath?: string): string;
  private setCSSUpdateTime(mtime: Date, cssPath?: string): void;
  private watchCSSFile(): void;
  public start(port?: number): Promise<void>;
  watchImageFolder(): void;
}

export class ImageHandler {
  public cdn?: DigitalOceanCDN;
  constructor(cdn?: DigitalOceanCDN);
  public updateImageFolder(filepath: string): Promise<void>;
  public convertToWebP(filePath: string): Promise<string | void>;
}

export class DigitalOceanCDN {
  private s3Client: S3Client;
  constructor(full_bucket_url: string);
  public uploadImage(file: Buffer, fileName: string): Promise<string | undefined>;
  public removeFromBucket(filePath: string): Promise<void>;
}
