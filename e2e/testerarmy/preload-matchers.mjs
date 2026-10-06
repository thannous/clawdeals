import { createRequire } from 'node:module';
createRequire(new URL('../../package.json', import.meta.url))('@playwright/test');
