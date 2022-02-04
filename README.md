# @ivorgri/sveltekit-adapter-static-local-image
Adaption of the standard static adapter from the Sveltekit team, including download of image within generated pages (for example, when using a separate CMS). For the basic usage of the Adapter, [please view the static adapter documentation on the SvelteKit website](https://kit.svelte.dev/docs#adapters).

## Usage

Install with `npm i -D @ivorgri/sveltekit-adapter-static-local-image`, then add the adapter to your `svelte.config.js`:

```js
// svelte.config.js
import adapter from '@ivorgri/sveltekit-adapter-static-local-image';

export default {
	kit: {
		adapter: adapter({
			// default options provided by regular static adapter
			pages: 'build',
			assets: 'build',
			fallback: null,
			precompress: false,
            // Add domain static image downloader
            cmsUrls: ["your.domain.com/potential/sub/route"]
		})
	}
};
```
## Options

### cmsUrls

A list of strings containing the URLs from which you would like to download the images. The adapter will take these URLs and start going through the generated files. Once it finds a complete link, including an image extension, it will download the files into the "img" folder inside the folder that provided for "assets". Once all the files are downloaded, the URL in the generated files with be replaced with a relative link to the "img" folder. 

Be aware: the adapter looks for the base URL which is similar for ALL images. Any dynamic routing (i.e. date sub directories) are added to the "img" folder. 

For example, if you have the following URL:
```
    https://your.domain.com/upload/folder/2022/02/02/image.jpg
```

You should provide the following URL:

```
    https://your.domain.com/upload/folder
```

The adapter will then create the following directory in the "img" folder:

```
img
└─── 2022
     └─── 02
          └─── 02
               |   image.jpg
```

## Changelog

[The Changelog for this package is available on GitHub](https://github.com/ivorgri/sveltekit-adapter-static-local-image/CHANGELOG.md).

## License

[MIT](LICENSE)
