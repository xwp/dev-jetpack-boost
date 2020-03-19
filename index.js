const { chromium } = require('playwright-chromium');
const lighthouse = require('lighthouse');
const { URL } = require('url');

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
    // Initate Browser Server so that we can run both browser performance
    // and Lighthouse on same instance (different "tabs").
    const browserServer = await chromium.launchServer();
    const wsEndpoint = browserServer.wsEndpoint();

    // Connect Browser to Browser Server socket.
    const browser = await chromium.connect({ wsEndpoint });
    const context = await browser._defaultContext;
    const page = await context.newPage();

    // Navigate to URL.
    await page.goto(url);
    // await page.goto(url, { waitUntil: 'networkidle2' });

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

    // Parse "Total Size" from browser resources. (Equivalent to Network tab in Chrome Dev Tools)
    totalSize = () => {
        let totalSize = 0;
        perfEntries.forEach(entry => {
            if (entry.transferSize > 0) {
                totalSize += entry.transferSize;
            }
        });
        return totalSize;
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

    console.log("==== Total size ====")
    console.log(totalSize() / 1000 + 'KB');

    console.log("==== Lighthouse Category Scores ====")
    console.log(lhResults());
    console.log("==== Lighthouse Requested Audits ====")
    console.log(lhAudits(['first-contentful-paint', 'first-meaningful-paint']));

    await browserServer.close();
})(url);
