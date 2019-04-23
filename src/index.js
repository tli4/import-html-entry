/**
 * @author Kuitos
 * @homepage https://github.com/kuitos/
 * @since 2018-08-15 11:37
 */

import processTpl, { genLinkReplaceSymbol } from './process-tpl';
import { getGlobalProp, noteGlobalProps } from './utils';

const styleCache = {};
const scriptCache = {};
const embedHTMLCache = {};

function getDomain(url) {
	try {
		// URL 构造函数不支持使用 // 前缀的 url
		const href = new URL(url.startsWith('//') ? `${location.protocol}${url}` : url);
		return href.origin;
	} catch (e) {
		return '';
	}
}

export default function importHTML(url) {

	return embedHTMLCache[url] || (embedHTMLCache[url] = fetch(url)
		.then(response => response.text())
		.then(html => {
			const { template, scripts, entry, styles } = processTpl(html, getDomain(url));

			function getEmbedHTML() {

				let emberHTML = template;

				return getExternalStyleSheets()
					.then(styleSheets => {
						emberHTML = styles.reduce((html, styleSrc, i) => {
							html = html.replace(genLinkReplaceSymbol(styleSrc), `<style>/* ${styleSrc} */${styleSheets[i]}</style>`);
							return html;
						}, emberHTML);

						return emberHTML;
					});
			}

			function getExternalStyleSheets() {
				return styleCache[url] ||
					(styleCache[url] = Promise.all(styles.map(styleLink => fetch(styleLink).then(response => response.text()))));

			}

			function getExternalScripts() {
				return scriptCache[url] ||
					(scriptCache[url] = Promise.all(scripts.map(script => fetch(script).then(response => response.text()))));
			}

			function execScripts(proxy = window) {

				return getExternalScripts()
					.then(scriptsText => {

						window.proxy = proxy;
						const geval = eval;

						function exec(scriptSrc, inlineScript, resolve) {

							const markName = `Evaluating script ${scriptSrc}`;
							const measureName = `Evaluating Time Consuming: ${scriptSrc}`;

							if (process.env.NODE_ENV === 'development') {
								performance.mark(markName);
							}

							if (scriptSrc === entry) {
								noteGlobalProps();

								try {
									geval(`;(function(window){;${inlineScript}\n})(window.proxy);`);
								} catch (e) {
									console.error(`error occurs while executing the entry ${scriptSrc}`);
									console.error(e);
								}

								const exports = proxy[getGlobalProp()] || {};
								resolve(exports);

							} else {
								try {
									geval(`;(function(window){;${inlineScript}\n})(window.proxy);`);
								} catch (e) {
									console.error(`error occurs while executing ${scriptSrc}`);
									console.error(e);
								}

							}

							if (process.env.NODE_ENV === 'development') {
								performance.measure(measureName, markName);
								performance.clearMarks(markName);
								performance.clearMeasures(measureName);
							}
						}

						function schedule(i, resolvePromise) {

							if (i < scripts.length) {
								const scriptSrc = scripts[i];
								const inlineScript = scriptsText[i];

								exec(scriptSrc, inlineScript, resolvePromise);
								schedule(i + 1, resolvePromise);
							}
						}

						return new Promise(resolve => schedule(0, resolve));
					});
			}

			return getEmbedHTML().then(embedHTML => ({
				template: embedHTML,
				getExternalScripts,
				getExternalStyleSheets,
				execScripts,
			}));
		}));
};
