const { URL } = require('url');
const css = require('css');
const cssSelectorExtract = require('css-selector-extract');
const csso = require('csso');


const getFromRangeOrText = (entry, url) => {
    let criticalCss = '';

    if (entry.ranges.length > 0) {
        entry.ranges.forEach((range) => {
            const str = "\n" + entry.text.substring(range.start, range.end).replace("url('", `url('${url.origin}`);
            if (str.replace('\n', '').trim().length > 0) {
                criticalCss += str;
            }
        });
    } else {
        if (entry.text.length > 0) {
            criticalCss += entry.text;
        }
    }
    return criticalCss
}

const critical = async (cssCoverage, options) => {

    const opt = Object.assign({
        page: null,
        cssSelectorFilter: [],
        excludeCssFiles: [],
        includeCssFiles: [],
    }, options);

    let criticalCss = '';

    for (const entry of cssCoverage) {
        const url = new URL(entry.url);
        const criticalCssByUrl = {};

        // @todo Inclusion/Exclusion could be better.
        // Include matching CSS files.
        if (opt.includeCssFiles.find((cssFile) => url.href.includes(cssFile))) {
            criticalCssByUrl[url.pathname] = criticalCssByUrl[url.pathname] | '';
            const cssText = getFromRangeOrText(entry, url);
            if (cssText.length > 0) {
                criticalCss += cssText;
                criticalCssByUrl[url.pathname] += cssText;
            }
        } else {
            // If not in the included CSS files, make sure its not in the exclude files.
            if (!opt.excludeCssFiles.find((cssFile) => url.href.includes(cssFile))) {
                criticalCssByUrl[url.pathname] = criticalCssByUrl[url.pathname] | '';
                const cssText = getFromRangeOrText(entry, url);
                if (cssText.length > 0) {
                    criticalCss += cssText;
                    criticalCssByUrl[url.pathname] += cssText;
                }

            }
        }

        if (!opt.page) {
            return criticalCss;
        }

        // Parse critical CSS.
        const criticalStyles = css.parse(criticalCss);
        const cssSelectors = [];

        // Get CSS rules.
        criticalStyles.stylesheet.rules
            .filter((selectorElem) => selectorElem.type == 'rule')
            .forEach((selectorElem) => selectorElem.selectors.forEach((elem) => cssSelectors.push(elem)));

        // Get CSS selectors.
        cssSelectors
            .filter((cssSelector, index, self) => self.indexOf(cssSelector) === index)
            .map((cssSelector) => cssSelector.trim())

        // Get all page elements for selectors.
        const elementsBySelector = {};
        let promises = [];
        cssSelectors.forEach((cssSelector) => {
            promises.push(
                opt.page
                    .$$(cssSelector)
                    .then((elements) => {
                        elementsBySelector[cssSelector] = elements;
                    })
                    .catch((err) => {
                        // console.error(err);
                    })
            )
        });

        // Do them all at the "same time".
        await Promise.all(promises);

        // Check if selected elements are in the viewport.
        promises = [];
        const criticalCssSelectors = [];
        Object.keys(elementsBySelector).forEach((cssSelector) => {
            elementsBySelector[cssSelector].forEach((element) => {
                promises.push(
                    element
                        .isIntersectingViewport()
                        .then((isIntersectingViewport) => {
                            if (isIntersectingViewport && !criticalCssSelectors.includes(cssSelector)) {
                                criticalCssSelectors.push(cssSelector);
                            }
                        })
                        .catch((err) => {
                            // console.error(err);
                        })
                );
            });
        });
        await Promise.all(promises);

        // Add all elements to an array we will extract below.
        Object.keys(elementsBySelector).forEach((cssSelector) => {
            if (options.cssSelectorFilter && options.cssSelectorFilter.length > 0) {
                if (options.cssSelectorFilter.find((filter) => !criticalCssSelectors.includes(cssSelector) && filter.test(cssSelector))) {
                    criticalCssSelectors.push(cssSelector.trim());
                }
            }
        });

        // Use library to extract CSS.
        const cssSelectorExtractOptions = {
            css: criticalCss,
            filters: criticalCssSelectors
        };
        await cssSelectorExtract.process(cssSelectorExtractOptions)
            .then((extractedCss) => {
                criticalCss = extractedCss;
            })
            .catch((err) => {
                // console.error(err);
            });
    }
    return csso.minify(criticalCss, {}).css;
};

module.exports = critical;
