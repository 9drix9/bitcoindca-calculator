const https = require('https');

function fetchKraken(since) {
    return new Promise((resolve, reject) => {
        const url = `https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=1440&since=${since}`;
        console.log(`Fetching: ${url}`);

        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.error && json.error.length) {
                        reject(json.error);
                    } else {
                        resolve(json.result);
                    }
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

(async () => {
    try {
        // Test fetch from 2015 (1420070400)
        const result1 = await fetchKraken(1420070400);
        const pairKey = Object.keys(result1).find(k => k !== 'last');
        const candles1 = result1[pairKey];

        console.log(`First fetch count: ${candles1.length}`);
        console.log(`First candle: ${new Date(candles1[0][0] * 1000).toISOString()}`);
        console.log(`Last candle: ${new Date(candles1[candles1.length - 1][0] * 1000).toISOString()}`);
        console.log(`Next 'last' pointer: ${result1.last}`);

        // If pagination works, we should be able to fetch from 'last'
        if (candles1.length > 0) {
            const nextSince = result1.last;
            console.log(`\nFetching next batch from: ${nextSince}`);
            const result2 = await fetchKraken(nextSince);
            const candles2 = result2[Object.keys(result2).find(k => k !== 'last')];
            console.log(`Second fetch count: ${candles2.length}`);
            if (candles2.length > 0) {
                console.log(`First candle batch 2: ${new Date(candles2[0][0] * 1000).toISOString()}`);
            }
        }

    } catch (err) {
        console.error('Error:', err);
    }
})();
