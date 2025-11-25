# Clear Protocol Analytics Dashboard

A real-time analytics dashboard for monitoring the Clear Protocol deployment on Arbitrum Sepolia testnet.

## Features

### Primary Metrics
- **Total Swap Volume** - Cumulative trading volume through the protocol
- **IOU Minted** - Total IOU tokens created during liquidity swaps
- **IOU Burned** - IOU tokens redeemed by users
- **Rebalance Volume** - Total value moved during vault rebalancing

### Additional Metrics
- **Total Value Locked (TVL)** - Sum of all deposits across vaults
- **IOU Outstanding Supply** - Current IOU tokens in circulation
- **Active Users** - Unique wallet addresses interacting with the protocol
- **Vaults Created** - Total number of vaults deployed
- **Protocol Fees** - Estimated fees collected from operations

### Visualizations
- **Daily Swap Volume Chart** - Line chart showing swap trends over time
- **Daily IOU Minted Chart** - Bar chart tracking IOU creation

## Tech Stack
- **React + TypeScript** - UI framework
- **Vite** - Build tool and dev server
- **ethers.js v6** - Blockchain interaction
- **Recharts** - Data visualization
- **Arbitrum Sepolia** - Testnet deployment

## Contract Addresses
```
Factory:    0x6f73CCe0210Fe9e1B8c650739C06E8a400d09E68
Swap:       0x5B69f9D067077c3FBb22Bd732d2c34A9731fC162
Vault:      0xD842772F0a6cB1276628f2C810f41B2893B717C4
IOU:        0x54E2F1eF78F386c7CBC5E353A4d49F353CBFca23
Oracle:     0x50c2584E2f32533e9307df9eE0Beb229fC20f517
```

## Installation

```bash
npm install
```

## Development

Start the development server:
```bash
npm run dev
```

The dashboard will be available at `http://localhost:5173` (or next available port).

## How It Works

The dashboard fetches on-chain data in real-time by:

1. **Querying Contract Events** - Listens for key events:
   - `LiquiditySwapExecuted` - Tracks swap volume
   - `ClearIOUMinted` - Tracks IOU creation
   - `ClearIOUBurned` - Tracks IOU redemptions
   - `Deposit` / `Withdraw` - Tracks vault activity
   - `NewClearVault` - Tracks vault creation

2. **Calculating Metrics** - Aggregates event data to compute:
   - Volume totals and trends
   - User activity statistics
   - TVL and outstanding balances

3. **Auto-Refresh** - Updates every 30 seconds automatically

## Data Service

The `dataService.ts` module handles all blockchain interactions:
- Connects to Arbitrum Sepolia RPC
- Fetches historical events from contracts
- Aggregates data for metrics calculation
- Provides type-safe interfaces for data

## Customization

### Update Contract Addresses
Edit `src/contracts.ts` to change monitored contracts.

### Adjust Refresh Rate
Modify the interval in `App.tsx`:
```typescript
// Auto-refresh every 30 seconds
const interval = setInterval(fetchData, 30000);
```

### Add More Metrics
Extend the `ProtocolMetrics` interface in `dataService.ts` and add corresponding UI elements in `App.tsx`.

## Production Build

```bash
npm run build
```

The optimized build will be in the `dist/` directory.

## Notes

- This dashboard is configured for **Arbitrum Sepolia testnet**
- All data is fetched directly from the blockchain (no backend required)
- Performance is optimized by limiting historical block range
- Charts will show "No data yet" until events are detected

## Future Enhancements

Suggested additions:
- **Vault-Specific Analytics** - Track individual vault performance
- **Price Charts** - Oracle price feeds visualization
- **Rebalance History** - Detailed rebalance transaction tracking
- **User Leaderboard** - Top users by volume/activity
- **Export Functionality** - Download metrics as CSV/JSON
- **Alert System** - Notifications for significant events
