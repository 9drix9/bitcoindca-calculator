const https = require('https');

function fetchKraken(since) {
    return new Promise((resolve, reject) => {
        // 10080 = 1 week in minutes
        const url = `https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=10080&since=${since}`;
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
        // Test fetch from 2010 (1262304000)
        const result1 = await fetchKraken(1262304000);
        const pairKey = Object.keys(result1).find(k => k !== 'last');
        const candles1 = result1[pairKey];

        if (candles1.length > 0) {
            console.log(`Fetch count: ${candles1.length}`);
            console.log(`First candle: ${new Date(candles1[0][0] * 1000).toISOString()}`);
            console.log(`Last candle: ${new Date(candles1[candles1.length - 1][0] * 1000).toISOString()}`);

            // Log first few to see start date
            console.log('First 3 candles:', candles1.slice(0, 3).map(c => ({ date: new Date(c[0] * 1000).toISOString(), price: c[4] })));
        } else {
            console.log('No candles returned');
        }

    } catch (err) {
        console.error('Error:', err);
    }
})();
