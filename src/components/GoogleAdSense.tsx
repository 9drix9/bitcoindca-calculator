'use client';

import Script from 'next/script';

export const GoogleAdSense = () => {
    return (
        <Script
            async
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7196704678615727`}
            crossOrigin="anonymous"
            strategy="afterInteractive"
        />
    );
};
