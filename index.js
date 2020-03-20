// const { chromium } = require('playwright-chromium');
const puppeteer = require('puppeteer');

const lighthouse = require('lighthouse');
const { URL } = require('url');
const getCriticalCSS = require('./critical');

if (!process.argv[2]) {
    console.log('Usage: npm|yarn start <URL>');
    return;
}

let url = '';
try {
    url = new URL(process.argv[2]);
} catch (error) {
    console.log('Please specify a VALID URL.');
    return;
}

(async ({ href: url }) => {

    const browser = await puppeteer.launch();
    const wsEndpoint = browser.wsEndpoint();
    const context = await browser._defaultContext;
    const page = await context.newPage();

    // Coverage
    await page.coverage.startCSSCoverage()

    // Navigate to URL.
    await page.goto(url);
    // await page.goto(url, { waitUntil: 'networkidle2' });

    const [cssCoverage] = await Promise.all([
        page.coverage.stopCSSCoverage()
    ])

    const criticalCss = await getCriticalCSS(cssCoverage, { page })

    // Get Browser Performance Entries.
    const perfEntries = JSON.parse(
        await page.evaluate(() => JSON.stringify(performance.getEntries()))
    );

    // Connect Lighthouse Audit to Browser Server.
    const { lhr } = await lighthouse(url, {
        port: (new URL(wsEndpoint)).port,
        output: 'json',
        logLevel: 'info',
    },
        // {
        //     extends: 'lighthouse:default',
        //     settings: {
        //         onlyAudits: [
        //             'first-meaningful-paint',
        //             'speed-index',
        //             'first-cpu-idle',
        //             'interactive',
        //         ],
        //     },
        // }
    );

    // Get formatted bytes.
    const formatBytes = (bytes, decimals = 2) => {
        if (bytes === 0) return '0 Bytes';

        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    // Parse "Total Size" from browser resources. (Equivalent to Network tab in Chrome Dev Tools)
    const getSizes = () => {
        let totalSize = 0;
        let cssSize = 0;
        perfEntries.forEach(entry => {
            if (entry.transferSize > 0) {
                if (entry.initiatorType == 'css') {
                    cssSize += entry.transferSize;
                }
                totalSize += entry.transferSize;
            }
        });
        return { totalSize, cssSize };
    }

    // Parse Lighthouse results against given audits and stringify.
    const lhAudits = (audits) => {
        let lhAudits = []
        Object.values(lhr.audits).forEach(a => {
            if (audits.indexOf(a.id) >= 0) {
                lhAudits.push(`${a.title} (${a.score}): ${a.displayValue}`)
            }
        })
        return lhAudits.join("\n");
    }

    // Parse Lighthouse categories and stringify.
    const lhResults = () => {
        let lhResults = [];
        Object.values(lhr.categories).forEach(c => {
            lhResults.push(`${c.title}: ${c.score * 100}%`)
        })

        return lhResults.join("\n");
    }

    // Zero when `waitUntil` is `networkidle2`.
    console.log("==== DOM Duration ====")
    console.log(perfEntries[0].duration);

    console.log("==== Resources size ====")
    const { totalSize, cssSize } = getSizes();
    console.log("Total Size: " + totalSize / 1000 + 'KB');
    console.log("CSS Size: " + cssSize / 1000 + 'KB');
    console.log("Viewport Critical CSS: " + formatBytes((new TextEncoder().encode(criticalCss)).length));

    console.log("==== Lighthouse Category Scores ====")
    console.log(lhResults());
    console.log("==== Lighthouse Requested Audits ====")
    console.log(lhAudits(['first-contentful-paint', 'first-meaningful-paint']));

    await browser.close();
})(url);
