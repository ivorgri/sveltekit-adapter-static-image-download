import { createReadStream, createWriteStream, statSync, mkdir } from 'fs';
import { pipeline } from 'stream';
import glob from 'tiny-glob';
import { promisify } from 'util';
import zlib from 'zlib';
import { promises as fs } from 'fs';
import * as https from 'https';
import url from 'url';

const pipe = promisify(pipeline);

/** @type {import('.')} */
export default function ({ pages = 'build', assets = pages, fallback, precompress = false, cmsUrls = [] } = {}) {
	return {
		name: '@sveltejs/adapter-static',

		async adapt(builder) {
			builder.rimraf(assets);
			builder.rimraf(pages);

			builder.writeStatic(assets);
			builder.writeClient(assets);

			await builder.prerender({
				fallback,
				all: !fallback,
				dest: pages
			});

			if (cmsUrls) {
				builder.log(`Checking generated files on image URL's`)
				await download(builder, pages, assets, cmsUrls);
			}

			if (precompress) {
				if (pages === assets) {
					builder.log.minor('Compressing assets and pages');
					await compress(assets);
				} else {
					builder.log.minor('Compressing assets');
					await compress(assets);

					builder.log.minor('Compressing pages');
					await compress(pages);
				}
			}

			if (pages === assets) {
				builder.log(`Wrote site to "${pages}"`);
			} else {
				builder.log(`Wrote pages to "${pages}" and assets to "${assets}"`);
			}
		}
	};
}

/**
 * @param {Builder} builder
 * @param {string} pagesDirectory
 * @param {string} assetsDirectory
 * @param {string[]} cmsUrls
 */
async function download(builder, pagesDirectory, assetsDirectory, cmsUrls) {
	const files = await glob('**/*', {
		cwd: pagesDirectory,
		dot: true,
		absolute: true,
		filesOnly: true
	});

	for (let index = 0; index < files.length; index++) {
		const file = files[index];
		const fileContent = await fs.readFile(file, 'utf8');
		await download_image_files(builder,file,fileContent,assetsDirectory, cmsUrls)
		await replace_cms_links(builder,file,fileContent,cmsUrls)
	}
	return;
}

/**
 * @param {Builder} builder
 * @param {string} filePath
 * @param {string} fileContent
 * @param {string} assetsDirectory
 * @param {string[]} cmsUrls
 */
async function download_image_files(builder,filePath, fileContent, assetsDirectory, cmsUrls) {
	for (let index = 0; index < cmsUrls.length; index++) {
		const cmsUrl = cmsUrls[index];
		const imageUrls = await find_image_urls(fileContent,cmsUrl,true);
		if (imageUrls.length > 0) {
			builder.log.minor(`Downloading images for file: ${filePath}`)
		}
		for (let imageUrlIndex = 0; imageUrlIndex < imageUrls.length; imageUrlIndex++) {
			const imageUrl = imageUrls[imageUrlIndex];
			await download_image_file(builder,imageUrl,assetsDirectory,cmsUrl);
		}
	}
}

/**
 * @param {string} fileContent
 * @param {string} cmsUrl
 * @param {boolean} includeImageExtension
 */
 async function find_image_urls(fileContent, cmsUrl, includeImageExtension = false) {
	let imageUrlRegexString = cmsUrl.replace(/\//g,"(?:\\/|\\\\u002F)");
	imageUrlRegexString = imageUrlRegexString + (includeImageExtension ? "(?:.+?)(?:png|jpg|jpeg|gif))" : ")" );
	imageUrlRegexString = "(" + imageUrlRegexString;
	const imageUrlRegex = new RegExp(imageUrlRegexString,"g");
	const imageUrls = [];
	let imageUrl;
	while ((imageUrl = imageUrlRegex.exec(fileContent))) {
		imageUrls.push(imageUrl[1]);
	}
	return imageUrls;
}

/**
 * @param {Builder} builder
 * @param {string} imageUrl
 * @param {string} assetsDirectory
 * @param {string} cmsUrl
 */
async function download_image_file(builder,imageUrl, assetsDirectory, cmsUrl) {
	const cleanedImageUrl = imageUrl.replace(/\\u002F/g, "/");
	const buildImagePath = cleanedImageUrl.replace(cmsUrl, `${process.cwd()}/${assetsDirectory}/img`);
	const buildImagePathArray = buildImagePath.split("/");
	const fileName = buildImagePathArray[buildImagePathArray.length - 1];
	const newAssetPath = buildImagePath.replace(fileName, "");
	const q = url.parse(cleanedImageUrl, true);
	const options = {
		hostname: q.hostname,
		port: q.port,
		path: q.path,
		method: 'GET',
		headers: {
			'X-Forwarded-For': 'xxx',
			'User-Agent': 'Mozilla/5.0 (X11; CrOS x86_64 14324.80.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/97.0.4692.102 Safari/537.36'
		}
	};
	
	await download_file(newAssetPath,buildImagePath,options)
	builder.log.minor(`Download complete: ${cleanedImageUrl}. File was added in ${buildImagePath}`)
}

/**
 * @param {string} newAssetPath
 * @param {string} buildImagePath
 * @param {Object} options
 * @return {Promise<any>} a promise of request
 */
 async function download_file(newAssetPath,buildImagePath,options) {
	return new Promise((resolve, reject) => {
		mkdir(newAssetPath, { recursive: true }, async (error) => {
			if (error) throw error;
			const destination = createWriteStream(buildImagePath);
			const response = await perform_download_request(options);
			response.pipe(destination);
			destination.on('finish',resolve);
			destination.on('error',reject)
		})
	})
 }

/**
 * Do a request with options provided.
 *
 * @param {Object} options
 * @return {Promise<any>} a promise of request
 */
async function perform_download_request(options) {
	return new Promise((resolve, reject) => {
		const request = https.get(options);
		request.on('response', response => {
			resolve(response);
		})
		request.on('error', error => {
			reject(error);
		})
	})
}

/**
 * @param {Builder} builder
 * @param {string} filePath
 * @param {string} fileContent
 * @param {string[]} cmsUrls
 */
async function replace_cms_links(builder,filePath, fileContent, cmsUrls) {
	for (let index = 0; index < cmsUrls.length; index++) {
		const cmsUrl = cmsUrls[index];
		const imageUrls = await find_image_urls(fileContent,cmsUrl);
		if (imageUrls.length > 0) {
			let replacedFileContent = fileContent;
			for (let imageUrlIndex = 0; imageUrlIndex < imageUrls.length; imageUrlIndex++) {
				const imageUrl = imageUrls[imageUrlIndex];
				replacedFileContent = await replace_cms_link(imageUrl,replacedFileContent);
			}
			await fs.writeFile(filePath,replacedFileContent);
			builder.log.minor(`Links updated in file: ${filePath}.`)
		}		
	}
}

/**
 * @param {string} imageUrl
 * @param {string} fileContent
 */
 async function replace_cms_link(imageUrl, fileContent) {
	const seperatorRegex = /\\u002F/g;
	const imgDirectory = seperatorRegex.test(imageUrl) ? "\\\\u002Fimg": "/img";
	const replacedFileContent = fileContent.replace(imageUrl,imgDirectory);
	return replacedFileContent;
}

/**
 * @param {string} directory
 */
async function compress(directory) {
	const files = await glob('**/*.{html,js,json,css,svg,xml}', {
		cwd: directory,
		dot: true,
		absolute: true,
		filesOnly: true
	});

	await Promise.all(
		files.map((file) => Promise.all([compress_file(file, 'gz'), compress_file(file, 'br')]))
	);
}

/**
 * @param {string} file
 * @param {'gz' | 'br'} format
 */
async function compress_file(file, format = 'gz') {
	const compress =
		format == 'br'
			? zlib.createBrotliCompress({
				params: {
					[zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT,
					[zlib.constants.BROTLI_PARAM_QUALITY]: zlib.constants.BROTLI_MAX_QUALITY,
					[zlib.constants.BROTLI_PARAM_SIZE_HINT]: statSync(file).size
				}
			})
			: zlib.createGzip({ level: zlib.constants.Z_BEST_COMPRESSION });

	const source = createReadStream(file);
	const destination = createWriteStream(`${file}.${format}`);

	await pipe(source, compress, destination);
}
