import { Adapter } from '@sveltejs/kit';

interface AdapterOptions {
	pages?: string;
	assets?: string;
	fallback?: string;
	precompress?: boolean;
	cmsUrls?: string[]
}

declare function plugin(options?: AdapterOptions): Adapter;
export = plugin;
