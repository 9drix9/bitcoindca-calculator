async function test() {
    try {
        // Coinbase Exchange Public API (Candles)
        const url = 'https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=86400';
        console.log('Fetching:', url);
        const res = await fetch(url, {
            headers: { 'User-Agent': 'node' }
        });
        if (!res.ok) {
            console.error('Error:', res.status, await res.text());
        } else {
            const json = await res.json();
            console.log('Success. Rows:', json.length);
            console.log('Sample:', json[0]);
        }
    } catch (e) {
        console.error(e);
    }
}
test();
