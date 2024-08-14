![npm](https://img.shields.io/npm/dt/lightning-pages)
# LightningPages Documentation

## Introduction
LightningPages is a Node.js package designed for creating high-speed, optimized landing pages with enhanced features such as automated image processing, CDN integration, and security enhancements. It's ideal for marketing landing pages, rapid web development, and anyone looking to host fast and efficient landing pages for advertising purposes.
 
## Installation
```bash
npm install lightning-pages
```
or using Yarn:
```bash
yarn add lightning-pages
```

## Importing LightningPages
```typescript
import { LightningPages } from 'lightning-pages';
```

## Configuration and Setup
### Environment Variables
- `CDN_REGION`: The region of your DigitalOcean space.
- `CDN_ACCESS_KEY`: Your DigitalOcean access key.
- `CDN_ACCESS_SECRET`: Your DigitalOcean access secret.
- `CDN_BUCKET_NAME`: The name of your DigitalOcean bucket.
- `SGTM_URL`: URL for server-side Google Tag Manager.
- `PORT`: The port number your server will listen on.

### Creating a DigitalOcean CDN
1. Sign up for DigitalOcean and create a Space.
2. Set up a CDN for the Space and note down the endpoint.
3. Generate and store your access keys securely.

### Initializing the LightningPages Application
```typescript
const LPApp = new LightningPages({
  script_sources: ['https://www.googletagmanager.com', 'https://connect.facebook.net', "https://script-cdn.example.com"],
  img_sources: [
    'https://www.facebook.com', // for facebook tracking
    'https://images.somecdn.com' // some image cdn example
  ],
  connect_sources: [
    'https://analytics.google.com', // google analytics
    'https://www.google-analytics.com', // google analytics
    "https://some-api-service.example.com" // example api service
  ],
  compression: { threshold: 1024 },
  cdn_baseurl: 'https://bucket-name.region.digitaloceanspaces.com',
  projectRoot: __dirname // optional, defaults to process.cwd()
});
```

## Core Features
### Image Handling
- Automatically watches the `/public/images` folder.
- Converts new images to WebP format for optimized loading.
- Synchronizes with DigitalOcean CDN for global distribution.

### Compression and Performance
- Uses `@fastify/compress` for compressing responses.
- Improves loading times and PageSpeed score.

### Security with Helmet
- Implements `@fastify/helmet` for basic security setups.
- Configures Content Security Policy (CSP) directives for scripts, images, and connections.

### CSS Cache Buster
- Watches CSS file for changes.
- Updates the global CSS cache on modification.

## Creating Custom Endpoints for EJS Templates

### Serving a Static EJS Page
```typescript
LPApp.page('/about', async (req, reply) => {
  const data = {
    domain: 'Your Domain',
    title: 'About Us',
    css: LPApp.getPageCSS(),
    otherData: 'Additional data if needed'
  };

  return reply.view('views/about.ejs', data);
});
```
In this example, the `/about` route serves a static EJS page named `about.ejs`. We pass an object containing data like domain, title, and CSS, which the EJS template can use.

### Dynamic Page Rendering Based on URL Parameters
```typescript
LPApp.page('/:filename', async (req, reply) => {
  // Retrieve filename from the URL parameter
  // @ts-expect-error
  const filename = `${req.params.filename}.ejs`;

  // Additional logic to determine domain and title based on the filename or other criteria
  const { domain, title } = someFunctionToDetermineDomainAndTitle(filename);

  // Checking if the file exists
  const fullFilePath = path.join(LPApp.projectRoot, 'views', filename);
  const exists = fs.existsSync(fullFilePath);

  if (exists) {
    return reply.view(filename, {
      domain,
      title,
      env: process.env,
      css: LPApp.getPageCSS()
    });
  } else {
    // Fallback if the requested file does not exist
    return reply.code(404).send('Page not found');
  }
});
```
Here, the `/:filename` route dynamically serves EJS files based on the URL parameter. The `filename` is extracted from the URL and used to render the corresponding EJS file. If the file doesn't exist, it returns a 404 error.

## Starting the Server
```typescript
LPApp.start();
```
Listens on the specified port and starts serving your landing pages.

## Frequently Asked Questions
### How do I create my own landing page?
Initialize the LightningPages application, configure routes, and start the server.

### Can I build a landing page for free?
Yes, with LightningPages and a Node.js environment, you can create landing pages for free.

### What app can I use to create a landing page?
Use the LightningPages package in a Node.js environment.

### What is the cheapest way to create a landing page?
Hosting a landing page on a Node.js server using LightningPages is very cost-effective.

### Can you have a landing page without a website?
Yes, LightningPages allows you to host standalone landing pages.

### How much does a landing page cost?
Costs vary based on hosting and CDN usage, but LightningPages itself is free.

### How do I make my page speed faster?
Utilize LightningPages' compression, image optimization, and CDN integration.

### How to get 100 page speed?
Optimize images, use efficient CSS/JS, and leverage caching and CDN features of LightningPages.

### How do I increase my PageSpeed score?
Optimize resource loading, minimize CSS/JS, and use LightningPages' performance features.

### How do I reduce page loading time?
Utilize LightningPages' automated image processing, CDN integration, and server-side optimizations.
