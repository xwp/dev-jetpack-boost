const playwright = require('playwright-chromium');

(async () => {

    const browser = await playwright.chromium.launch();
    const context = await browser._defaultContext;
    const page = await context.newPage();

    const url = 'https://photo-calib.pantheonsite.io/';

    await page.goto(url);
    // await page.goto(url, { waitUntil: 'networkidle2' });

    const perfEntries = JSON.parse(
        await page.evaluate(() => JSON.stringify(performance.getEntries()))
    );

    // total size of the website:
    totalSize = () => {
        let totalSize = 0;
        perfEntries.forEach(entry => {
            if (entry.transferSize > 0) {
                totalSize += entry.transferSize;
            }
        });
        return totalSize;
    }

    // Zero when `waitUntil` is `networkidle2`.
    console.log("==== DOM Duration ====")
    console.log(perfEntries[0].duration);

    console.log("==== Total size ====")
    console.log(totalSize() / 1000 + 'KB');



    await browser.close();

})();
