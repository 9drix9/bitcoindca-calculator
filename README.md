# Bitcoin DCA Calculator

A static, SEO-friendly Bitcoin Dollar Cost Averaging (DCA) calculator built with [Next.js](https://nextjs.org/), TypeScript, and Tailwind CSS.

## Features

- **Price Prediction**: Project potential portfolio value based on future Bitcoin price targets.
- **DCA Calculation**: Calculate potential returns from recurring Bitcoin purchases.
- **Live Price Data**: Fetches historical daily prices from Kraken Public API.
- **Mobile-First Design**: Optimized layout for clean mobile usage (iPhone/Android).
- **AdSense Integration**: Built-in support for Google AdSense monetization.
- **Interactive Charts**: Visualize "Total Invested" vs "Portfolio Value" over time using Recharts.

## Getting Started

### Prerequisites

- Node.js 18.17 or later
- npm (or pnpm/yarn)

### Installation

1.  Clone the repository:
    ```bash
    git clone https://github.com/yourusername/bitcoin-dca-calculator.git
    cd bitcoin-dca-calculator
    ```

2.  Install dependencies:
    ```bash
    npm install
    # or
    pnpm install
    ```

3.  Run the development server:
    ```bash
    npm run dev
    ```

4.  Open [http://localhost:3000](http://localhost:3000) with your browser.

## Configuration

To configure AdSense, update the Client ID in `src/components/AdSlot.tsx` and `src/app/layout.tsx`.

## Verification

The calculator includes comprehensive types and tests for the calculation logic.
You can run the build process to verify type safety:

```bash
npm run build
```

## Deployment

This app is optimized for static export or Node.js deployment.
The easiest way to deploy is using [Vercel](https://vercel.com/):

1.  Push your code to GitHub.
2.  Import the project in Vercel.
3.  Add environment variables (e.g., `NEXT_PUBLIC_ADSENSE_CLIENT`).
4.  Deploy.

## Technologies Used

-   **Framework**: Next.js 14 (App Router)
-   **Language**: TypeScript
-   **Styling**: Tailwind CSS v4
-   **Charts**: Recharts
-   **Utilities**: date-fns, lucide-react

## License

MIT
