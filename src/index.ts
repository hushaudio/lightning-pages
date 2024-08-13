import Fastify, { FastifyReply, type FastifyInstance, type FastifyRequest, type RouteHandlerMethod } from 'fastify'
import * as path from 'path'
import * as fs from 'fs'
import helmet from '@fastify/helmet'
import pointOfView from '@fastify/view' //@ts-ignore
import * as ejs from 'ejs'
import staticPlugin from '@fastify/static'
import * as dotenv from 'dotenv'
import * as chokidar from 'chokidar'
import fetch from 'node-fetch'
import compress from '@fastify/compress'
import { brotliCompressSync } from 'zlib' // Use built-in zlib for Brotli compression

import * as zlib from 'zlib'

import { DeleteObjectCommand, PutObjectCommandInput, S3Client } from '@aws-sdk/client-s3'
import { Upload } from "@aws-sdk/lib-storage";

//@ts-ignore
import webp from 'webp-converter';
interface LightningPagesOptions {
  projectRoot?: string
  port?: number
  cdn_baseurl?: string
  script_sources?: string[]
  img_sources?: string[]
  connect_sources?: string[]
  compression?: any
  production: boolean // default: false
}

dotenv.config()

const debounce = (func: Function, delay: number) => {
  let inDebounce: NodeJS.Timeout
  return function (this: any, ...args: any[]) {
    clearTimeout(inDebounce)
    inDebounce = setTimeout(() => func.apply(this, args), delay)
  }
}

export class LightningPages {

  constructor (options: LightningPagesOptions) {
    const { projectRoot, port, script_sources = [], img_sources = [], connect_sources = [], compression, cdn_baseurl = this.CDN_ROOT_URI } = options;
    
    this.projectRoot = projectRoot || process.cwd();
    const isCDNConfigured = process.env.CDN_REGION && process.env.CDN_ACCESS_KEY && process.env.CDN_ACCESS_SECRET && process.env.CDN_BUCKET_NAME && cdn_baseurl;

    if (isCDNConfigured) {
      console.log("passed the condition for cdn");
      this.cdn = new DigitalOceanCDN(cdn_baseurl);
    } else {
      console.log("cdn not available");
    }

    this.images = new ImageHandler(this.cdn);

    // Set port
    const portNumber = port || process.env.PORT || 8000;
    this.port = typeof portNumber === 'string' ? parseInt(portNumber) : portNumber;
    this.fastify = Fastify({ logger: true });

    const directives = {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", ...script_sources],
      imgSrc: ["'self'", 'data:', ...img_sources],
      connectSrc: ["'self'", ...connect_sources]
    };

    // Register Helmet for Basic Security
    this.fastify.register(helmet, {
      contentSecurityPolicy: {
        directives
      }
    });

    // Register View Engine
    this.fastify.register(pointOfView, {
      engine: { ejs },
      root: path.join(this.projectRoot, 'views'),
      viewExt: 'ejs',
      defaultContext: {
        dev: options.production || process.env.NODE_ENV === "development", // Inside your templates, `dev` will be `true` if the expression evaluates to true
      },
      // options: { filename: path.join(this.projectRoot, 'views') }
    });

    this.fastify.register(compress, compression || {
      threshold: 1024, // Only compress responses that are at least 1KB
      brotli: {
        params: {
          [zlib.constants.BROTLI_PARAM_QUALITY]: 4,
        }
      }
    });

    // Serve Static Files
    this.fastify.register(staticPlugin, {
      root: path.join(this.projectRoot, 'public'),
      prefix: '/', // Ensure the prefix is set correctly
    });

    this.fastify.get('/css/cache/bust', async (req, reply) => {
      this.globalCSS = this.getRawCSSCached();
      reply.send('OK!');
    });

    if (isCDNConfigured) {
      this.fastify.get('/cdn/*', (req: FastifyRequest<{ Params: any }>, reply) => {
        // Capture the full path after /cdn/
        // @ts-ignore
        const fullPath = req.params['*'];
        // Construct the CDN URL with the full path
        const cdnUrl = `${options.cdn_baseurl}/${fullPath}`;
        // Redirect the request to the CDN URL
        console.log({ cdnUrl });
        reply.redirect(cdnUrl);
      });

      // Middleware to check for file extension and redirect to CDN
      this.fastify.addHook('onRequest', (request: FastifyRequest, reply: FastifyReply, done: Function) => {
        const url = request.raw.url as string;
        if (/\.\w+$/.test(url) && !url.endsWith('.ico')) { // Regex to check if URL ends with a file extension
          const newUrl = cdn_baseurl + url;
          reply.redirect(newUrl);
        } else {
          done();
        }
      });
    }

    if (process.env.SGTM_URL) {
      this.fastify.all('/s-g-t-m/*', async (req: FastifyRequest, reply: FastifyReply) => {
        // Convert IncomingHttpHeaders to a compatible format for fetch
        const headersInit: Record<string, string> = {};
        Object.entries(req.raw.headers).forEach(([key, value]) => {
          if (value) {
            // Join array of strings into a single comma-separated string
            headersInit[key] = Array.isArray(value) ? value.join(', ') : value;
          }
        });

        // Read body from the request
        const requestBody = await req.body; // Assuming body parsing is enabled in Fastify
        const url = process.env.SGTM_URL as string + req.raw.url?.replace('/s-g-t-m', '');
        console.log({ url, options: {
          method: req.raw.method,
          headers: headersInit,
          body: JSON.stringify(requestBody) // Convert body to string if necessary
        } });
        
        try {
          const response = await fetch(url, {
            method: req.raw.method,
            headers: headersInit,
            body: JSON.stringify(requestBody) // Convert body to string if necessary
          });

          // Process the response from fetch and send it back to the client
          const responseBody = await response.text();
          reply.type(response.headers.get('content-type') || 'text/plain').send(responseBody);
        } catch (error) {
          reply.send(error);
        }
      });
    }

    this.watchCSSFile();
    this.watchImageFolder();
    this.globalCSS = this.getRawCSSCached();
    this.debouncedGetRawCSSCached = debounce(this.getRawCSSCached.bind(this), 1000);
  }
  
  public CDN_ROOT_URI = `https://${process.env.CDN_BUCKET_NAME}.${process.env.CDN_REGION}.digitaloceanspaces.com`
  public projectRoot = path.join(__dirname, '../../')
  public cdn?: DigitalOceanCDN
  public images:ImageHandler

  private readonly port: number
  private readonly fastify: FastifyInstance
  private readonly defaultCSSPath: string = path.join(this.projectRoot, 'public', 'css', 'style.css')
  private readonly debouncedGetRawCSSCached: Function

  private cssFileWatcher: chokidar.FSWatcher | null = null
  private globalCSS: string
  private cssUpdateTime?: Date

  public page (url: string, callback: RouteHandlerMethod) {
    this.fastify.get(url, callback)
  }

  getPageCSS(){
    return this.globalCSS
  }

  private async getRawCSS (cssPath?: string): Promise<string> {
    return await new Promise((resolve, reject) => {
      const path = cssPath || this.defaultCSSPath
      fs.readFile(path, 'utf8', (err, data) => {
        if (err) { reject(err); return }
        resolve(data)
      })
    })
  }

  private getRawCSSCached (cssPath?: string): string {
    if (!cssPath) cssPath = this.defaultCSSPath

    if (fs.existsSync(cssPath) && (!this.cssUpdateTime || this.cssUpdateTime < fs.statSync(cssPath).mtime)) {
      console.log('\x1b[33m%s\x1b[0m', '[CACHE] Updating CSS')
      this.globalCSS = fs.readFileSync(cssPath, 'utf8')
      this.setCSSUpdateTime(fs.statSync(cssPath).mtime)
    }
    return this.globalCSS
  }

  private setCSSUpdateTime (mtime: Date, cssPath?: string) {
    this.cssUpdateTime = mtime || fs.statSync(cssPath || this.defaultCSSPath).mtime
  }

  private watchCSSFile () {
    if (this.cssFileWatcher) {
      this.cssFileWatcher.close()
      console.log('Previous CSS file watcher closed.')
    }

    this.cssFileWatcher = chokidar.watch(this.defaultCSSPath, {
      ignored: /(^|[\/\\])\../,
      persistent: true
    })

    this.cssFileWatcher
      .on('change', path => {
        this.debouncedGetRawCSSCached()
      })
      .on('error', error => { console.error(`Watcher error: ${error}`) })

    console.log('Watching for CSS file changes...')
  }

  public async start (port: number = this.port) {
    try {
      await this.fastify.listen({ port }) // @ts-expect-error
      this.fastify.log.info(`server listening on ${this.fastify.server.address()?.port}`)
    } catch (err) {
      this.fastify.log.error(err)
      process.exit(1)
    }
  }

  watchImageFolder () {
    const imageFolder = path.join(this.projectRoot, 'public', 'images')

    const watcher = chokidar.watch(imageFolder, {
      ignored: /(^|[\/\\])\../, // ignore dotfiles
      persistent: true,
      ignoreInitial: false
    })
    
    watcher
    .on('add', filePath => { this.images.updateImageFolder(filePath) })
    .on('change', filePath => { this.images.updateImageFolder(filePath) })
    .on('unlink', filePath => { this.images.cdn?.removeFromBucket(filePath) })
    .on('error', error => { console.error(`Watcher error: ${error}`) })
    
    console.log('Watching for image file changes...')
  }
}


export class ImageHandler {
  constructor(
    public cdn?: DigitalOceanCDN
  ) { }

  public async updateImageFolder(filepath: string) { 
    const webpImage = await this.convertToWebP(filepath) as string;
    if (typeof webpImage !== 'string') return;

    // Upload original image
    let originalCdnFilepath = path.normalize(filepath).split('public')[1].replace(/\\/g, '/');
    originalCdnFilepath = originalCdnFilepath.startsWith('/') ? originalCdnFilepath.slice(1) : originalCdnFilepath;
    if (this.cdn?.uploadImage) await this.cdn.uploadImage(fs.readFileSync(filepath), originalCdnFilepath).catch(console.error);

    // Upload WebP image
    let webpCdnFilepath = path.normalize(webpImage).split('public')[1].replace(/\\/g, '/');
    webpCdnFilepath = webpCdnFilepath.startsWith('/') ? webpCdnFilepath.slice(1) : webpCdnFilepath;
    if (this.cdn?.uploadImage) await this.cdn.uploadImage(fs.readFileSync(webpImage), webpCdnFilepath).catch(console.error);
  }

  public async convertToWebP (filePath: string) {
    const validExtensions = ['.jpg', '.jpeg', '.png', '.gif']
    const fileExtension = path.extname(filePath).toLowerCase()

    if (!validExtensions.includes(fileExtension)) {
      return // Skip if not a valid image type
    }

    const webpPath = filePath.split('.')
    webpPath.pop()

    const outputFilePath = `${webpPath.join()}.webp`

    try{
      await webp.cwebp(filePath, outputFilePath, '-q 80')
      return outputFilePath
    } catch (error) {
    }
  }
}

export class DigitalOceanCDN {
  private s3Client: S3Client;
  constructor(full_bucket_url:string) {
    const endpoint = `https://${process.env.CDN_REGION}.digitaloceanspaces.com`;
    this.s3Client = new S3Client({
      endpoint: endpoint,
      region: process.env.CDN_REGION,
      credentials: {
        accessKeyId: process.env.CDN_ACCESS_KEY!,
        secretAccessKey: process.env.CDN_ACCESS_SECRET!
      }
    });
  }

  public async uploadImage(file: Buffer, fileName: string): Promise<string|undefined> {

    const uploadParams = {
        Bucket: process.env.CDN_BUCKET_NAME, // Change to your space name
        Key: fileName,
        Body: file,
        ACL: 'public-read',
        CacheControl: 'max-age=31536000'
    } as PutObjectCommandInput;

    try {
        const parallelUploads3 = new Upload({
            client: this.s3Client,
            params: uploadParams
        }); 

        const result = await parallelUploads3.done();
        return result.Key;
    } catch (error) {
        console.error('Error uploading image:', error);
        throw error;
    }
  }

  public async removeFromBucket(filePath: string): Promise<void> {
    // Normalize and construct the path for the CDN
    let cdnFilepath = path.normalize(filePath).split('public')[1].replace(/\\/g, '/');
    cdnFilepath = cdnFilepath.startsWith('/') ? cdnFilepath.slice(1) : cdnFilepath;

    const deleteParams = {
      Bucket: process.env.CDN_BUCKET_NAME,
      Key: cdnFilepath,
    };

    try {
      await this.s3Client.send(new DeleteObjectCommand(deleteParams));
      console.log(`File deleted successfully: ${cdnFilepath}`);
    } catch (error) {
      console.error('Error deleting file:', error);
      throw error;
    }
  }
}