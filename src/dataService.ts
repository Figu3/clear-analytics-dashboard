import { ethers } from 'ethers';
import { CONTRACTS, RPC_URL, ABIS, START_BLOCK } from './contracts';

export interface OraclePrice {
  asset: string;
  price: number;
  decimals: number;
  symbol: string;
}

export interface RouteStatus {
  fromSymbol: string;
  toSymbol: string;
  fromAsset: string;
  toAsset: string;
  isOpen: boolean;
  depegPercentage: number; // How much the from token is depegged relative to the to token
  threshold: number; // The depeg threshold (e.g., 0.05%)
}

export interface RouteOpenEvent {
  id: string;
  route: string; // e.g., "GHO -> USDC"
  openedAt: number; // timestamp
  closedAt: number | null; // null if still open
  durationMs: number | null; // null if still open
}

export interface RouteStatusMetrics {
  routes: RouteStatus[];
  depegThreshold: number; // from contract (e.g., 9995 = 0.05%)
  anyRouteOpen: boolean;
  // Historical metrics (from localStorage)
  routeOpenEvents: RouteOpenEvent[];
  totalTimesOpened: number;
  averageOpenDurationMs: number | null;
  totalOpenDurationMs: number;
}

export interface ReserveBalance {
  symbol: string;
  balance: string;
  balanceUSD: string;
}

export interface TVLDataPoint {
  date: string;
  GHO: number;
  USDC: number;
  total: number;
}

export interface VaultTokenAllocation {
  symbol: string;
  name: string;
  address: string;
  balance: string;
  balanceUSD: string;
  decimals: number;
  adapter: string;
  adapterName: string;
}

export interface ProtocolMetrics {
  // Primary Metrics (all in USD)
  totalSwapVolumeUSD: string;
  totalIOUMinted: string;
  totalIOUBurned: string;
  rebalanceVolumeUSD: string;

  // Additional Metrics
  totalValueLockedUSD: string;
  reserveBalances: ReserveBalance[];
  tokenAllocations: VaultTokenAllocation[];
  numberOfVaults: number;
  numberOfRebalances: number;
  activeUsers: number;
  totalTransactions: number;
  iouOutstandingSupply: string;
  protocolFeesUSD: string;

  // Time series data
  dailySwapVolume: { date: string; volumeUSD: string }[];
  dailyIOUMinted: { date: string; amount: string }[];
  tvlHistory: TVLDataPoint[];

  // Price data from oracles
  oraclePrices: OraclePrice[];
  ethPrice: number;

  // Latest block processed
  lastBlock: number;
}

export interface SwapEvent {
  from: string;
  to: string;
  receiver: string;
  amountIn: bigint;
  tokenAmountOut: bigint;
  iouAmountOut: bigint;
  blockNumber: number;
  timestamp: number;
  txHash: string;
}

export interface IOUMintEvent {
  to: string;
  amount: bigint;
  blockNumber: number;
  timestamp: number;
  txHash: string;
}

class DataService {
  private provider: ethers.JsonRpcProvider;
  private factoryContract: ethers.Contract;
  private vaultContract: ethers.Contract;
  private iouContract: ethers.Contract;

  constructor() {
    this.provider = new ethers.JsonRpcProvider(RPC_URL);

    this.factoryContract = new ethers.Contract(
      CONTRACTS.ClearFactory,
      ABIS.ClearFactory,
      this.provider
    );

    this.vaultContract = new ethers.Contract(
      CONTRACTS.ClearVault,
      ABIS.ClearVault,
      this.provider
    );

    this.iouContract = new ethers.Contract(
      CONTRACTS.ClearIOU,
      ABIS.ClearIOU,
      this.provider
    );
  }

  async getLatestBlock(): Promise<number> {
    return await this.provider.getBlockNumber();
  }

  async getSwapEvents(fromBlock: number, toBlock: number): Promise<SwapEvent[]> {
    try {
      const filter = this.vaultContract.filters.LiquiditySwapExecuted();
      const events = await this.vaultContract.queryFilter(filter, fromBlock, toBlock);

      const swapEvents: SwapEvent[] = [];

      for (const event of events) {
        if (!('args' in event)) continue;
        const block = await event.getBlock();
        const args = event.args;

        swapEvents.push({
          from: args.from,
          to: args.to,
          receiver: args.receiver,
          amountIn: args.amountIn,
          tokenAmountOut: args.tokenAmountOut,
          iouAmountOut: args.iouAmountOut,
          blockNumber: event.blockNumber,
          timestamp: block.timestamp,
          txHash: event.transactionHash,
        });
      }

      return swapEvents;
    } catch (error) {
      console.error('Error fetching swap events:', error);
      return [];
    }
  }

  async getIOUMintEvents(fromBlock: number, toBlock: number): Promise<IOUMintEvent[]> {
    // IOU mints are Transfer events from address(0)
    const filter = this.iouContract.filters.Transfer(ethers.ZeroAddress, null);
    const events = await this.iouContract.queryFilter(filter, fromBlock, toBlock);

    const mintEvents: IOUMintEvent[] = [];

    for (const event of events) {
      if (!('args' in event)) continue;
      const block = await event.getBlock();
      const args = event.args;

      mintEvents.push({
        to: args.to,
        amount: args.value,
        blockNumber: event.blockNumber,
        timestamp: block.timestamp,
        txHash: event.transactionHash,
      });
    }

    return mintEvents;
  }

  async getIOUBurnEvents(fromBlock: number, toBlock: number) {
    // IOU burns are Transfer events to address(0)
    const filter = this.iouContract.filters.Transfer(null, ethers.ZeroAddress);
    const events = await this.iouContract.queryFilter(filter, fromBlock, toBlock);

    let totalBurned = 0n;

    for (const event of events) {
      if (!('args' in event)) continue;
      const args = event.args;
      totalBurned += args.value;
    }

    return totalBurned;
  }

  async getVaultCreationEvents(fromBlock: number, toBlock: number) {
    const filter = this.factoryContract.filters.NewClearVault();
    const events = await this.factoryContract.queryFilter(filter, fromBlock, toBlock);
    return events.length;
  }

  async getDepositEvents(fromBlock: number, toBlock: number) {
    const filter = this.vaultContract.filters.Deposit();
    const events = await this.vaultContract.queryFilter(filter, fromBlock, toBlock);

    let totalDeposits = 0n;
    const uniqueUsers = new Set<string>();

    for (const event of events) {
      if (!('args' in event)) continue;
      const args = event.args;
      totalDeposits += args.assets;
      uniqueUsers.add(args.sender.toLowerCase());
    }

    return { totalDeposits, uniqueUsers };
  }

  async getIOUTotalSupply(): Promise<bigint> {
    try {
      return await this.iouContract.totalSupply();
    } catch (error) {
      console.error('Error fetching IOU total supply:', error);
      return 0n;
    }
  }

  async getVaultTotalAssets(): Promise<bigint> {
    try {
      return await this.vaultContract.totalAssets();
    } catch (error) {
      console.error('Error fetching vault total assets:', error);
      return 0n;
    }
  }

  async getReserveBalances(oraclePrices: OraclePrice[]): Promise<ReserveBalance[]> {
    const ERC20_ABI = ['function balanceOf(address) view returns (uint256)'];
    const reserves: ReserveBalance[] = [];

    // Token configs: address, symbol, decimals
    const tokens = [
      { address: CONTRACTS.MockGHO, symbol: 'GHO', decimals: 18 },
      { address: '0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d', symbol: 'USDC', decimals: 6 },
    ];

    for (const token of tokens) {
      try {
        const tokenContract = new ethers.Contract(token.address, ERC20_ABI, this.provider);
        const balance = await tokenContract.balanceOf(CONTRACTS.ClearVault);
        const formattedBalance = ethers.formatUnits(balance, token.decimals);

        // Find oracle price for this token
        const oracle = oraclePrices.find(o => o.symbol === token.symbol);
        const price = oracle?.price || 1; // Default to 1 for stablecoins

        reserves.push({
          symbol: token.symbol,
          balance: formattedBalance,
          balanceUSD: (parseFloat(formattedBalance) * price).toFixed(2),
        });
      } catch (error) {
        console.error(`Error fetching ${token.symbol} balance:`, error);
      }
    }

    return reserves;
  }

  async getEthPrice(): Promise<number> {
    try {
      const response = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd'
      );
      const data = await response.json();
      return data.ethereum?.usd || 0;
    } catch (error) {
      console.error('Error fetching ETH price:', error);
      return 0;
    }
  }

  async getRebalanceCount(): Promise<number> {
    try {
      const response = await fetch('https://api-arb-sepolia-clear.trevee.xyz/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `query { clearLiquidityRebalances { id } }`
        })
      });
      const data = await response.json();
      return data.data?.clearLiquidityRebalances?.length || 0;
    } catch (error) {
      console.error('Error fetching rebalance count:', error);
      return 0;
    }
  }

  async getOraclePrices(): Promise<OraclePrice[]> {
    try {
      const response = await fetch('https://api-arb-sepolia-clear.trevee.xyz/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `query { clearOracles { asset assetDecimals oracleDecimals price } }`
        })
      });
      const data = await response.json();

      // Map known addresses to symbols
      const symbolMap: Record<string, string> = {
        '0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d': 'USDC',
        '0x69cac783c212bfae06e3c1a9a2e6ae6b17ba0614': 'GHO',
      };

      return data.data?.clearOracles?.map((oracle: { asset: string; oracleDecimals: string; price: string }) => ({
        asset: oracle.asset,
        price: parseInt(oracle.price) / Math.pow(10, parseInt(oracle.oracleDecimals)),
        decimals: parseInt(oracle.oracleDecimals),
        symbol: symbolMap[oracle.asset.toLowerCase()] || 'Unknown',
      })) || [];
    } catch (error) {
      console.error('Error fetching oracle prices:', error);
      return [];
    }
  }

  async getDepegThreshold(): Promise<number> {
    try {
      const response = await fetch('https://api-arb-sepolia-clear.trevee.xyz/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `query { clearStatuses { swapDepegTreshold } }`
        })
      });
      const data = await response.json();
      return parseInt(data.data?.clearStatuses?.[0]?.swapDepegTreshold || '9995');
    } catch (error) {
      console.error('Error fetching depeg threshold:', error);
      return 9995; // Default
    }
  }

  calculateRouteStatus(oraclePrices: OraclePrice[], depegThreshold: number): RouteStatus[] {
    const routes: RouteStatus[] = [];
    const thresholdPercent = (10000 - depegThreshold) / 100; // e.g., 9995 -> 0.05%

    // Check all possible routes between tokens
    for (let i = 0; i < oraclePrices.length; i++) {
      for (let j = 0; j < oraclePrices.length; j++) {
        if (i === j) continue;

        const fromToken = oraclePrices[i];
        const toToken = oraclePrices[j];

        // Route is open if: fromPrice <= toPrice * threshold / 10000
        // This means the from token is depegged by more than the threshold
        const maxFromPrice = (toToken.price * depegThreshold) / 10000;
        const isOpen = fromToken.price <= maxFromPrice;

        // Calculate depeg percentage: how much lower fromPrice is compared to toPrice
        const depegPercentage = ((toToken.price - fromToken.price) / toToken.price) * 100;

        routes.push({
          fromSymbol: fromToken.symbol,
          toSymbol: toToken.symbol,
          fromAsset: fromToken.asset,
          toAsset: toToken.asset,
          isOpen,
          depegPercentage,
          threshold: thresholdPercent,
        });
      }
    }

    return routes;
  }

  async getRouteStatusMetrics(oraclePrices: OraclePrice[]): Promise<RouteStatusMetrics> {
    const depegThreshold = await this.getDepegThreshold();
    const routes = this.calculateRouteStatus(oraclePrices, depegThreshold);
    const anyRouteOpen = routes.some(r => r.isOpen);

    // Load historical events from localStorage
    const storedEvents = this.loadRouteEvents();

    // Update events based on current status
    const now = Date.now();
    const updatedEvents = this.updateRouteEvents(storedEvents, routes, now);

    // Save updated events
    this.saveRouteEvents(updatedEvents);

    // Calculate statistics
    const closedEvents = updatedEvents.filter(e => e.closedAt !== null);
    const totalTimesOpened = updatedEvents.length;
    const totalOpenDurationMs = closedEvents.reduce((sum, e) => sum + (e.durationMs || 0), 0);
    const averageOpenDurationMs = closedEvents.length > 0
      ? totalOpenDurationMs / closedEvents.length
      : null;

    return {
      routes,
      depegThreshold,
      anyRouteOpen,
      routeOpenEvents: updatedEvents,
      totalTimesOpened,
      averageOpenDurationMs,
      totalOpenDurationMs,
    };
  }

  private loadRouteEvents(): RouteOpenEvent[] {
    try {
      const stored = localStorage.getItem('clear_route_events');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  private saveRouteEvents(events: RouteOpenEvent[]): void {
    try {
      localStorage.setItem('clear_route_events', JSON.stringify(events));
    } catch (error) {
      console.error('Error saving route events:', error);
    }
  }

  private updateRouteEvents(
    existingEvents: RouteOpenEvent[],
    currentRoutes: RouteStatus[],
    now: number
  ): RouteOpenEvent[] {
    const events = [...existingEvents];

    for (const route of currentRoutes) {
      const routeName = `${route.fromSymbol} -> ${route.toSymbol}`;

      // Find the most recent event for this route
      const lastEvent = events
        .filter(e => e.route === routeName)
        .sort((a, b) => b.openedAt - a.openedAt)[0];

      if (route.isOpen) {
        // Route is currently open
        if (!lastEvent || lastEvent.closedAt !== null) {
          // No previous event or last event was closed - create new open event
          events.push({
            id: `${routeName}-${now}`,
            route: routeName,
            openedAt: now,
            closedAt: null,
            durationMs: null,
          });
        }
        // If last event is still open, do nothing (it's ongoing)
      } else {
        // Route is currently closed
        if (lastEvent && lastEvent.closedAt === null) {
          // Close the open event
          lastEvent.closedAt = now;
          lastEvent.durationMs = now - lastEvent.openedAt;
        }
      }
    }

    return events;
  }

  async getVaultTokenAllocations(oraclePrices: OraclePrice[]): Promise<{ allocations: VaultTokenAllocation[]; totalAssetsUSD: string }> {
    try {
      const response = await fetch('https://api-arb-sepolia-clear.trevee.xyz/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `query { clearVaults { totalAssets tokens { address name symbol decimals balance adapter } } }`
        })
      });
      const data = await response.json();

      const vault = data.data?.clearVaults?.[0];
      if (!vault) return { allocations: [], totalAssetsUSD: '0' };

      const allocations: VaultTokenAllocation[] = vault.tokens.map((token: {
        address: string;
        name: string;
        symbol: string;
        decimals: string;
        balance: string;
        adapter: string;
      }) => {
        const decimals = parseInt(token.decimals);
        const balance = parseFloat(token.balance) / Math.pow(10, decimals);

        // Find oracle price for this token
        const oracle = oraclePrices.find(o => o.symbol === token.symbol);
        const price = oracle?.price || 1;

        // Determine adapter name
        let adapterName = 'Vault (Direct)';
        if (token.adapter !== '0x0000000000000000000000000000000000000000') {
          adapterName = 'Aave V3 Adapter';
        }

        return {
          symbol: token.symbol,
          name: token.name,
          address: token.address,
          balance: balance.toFixed(decimals === 6 ? 2 : 4),
          balanceUSD: (balance * price).toFixed(2),
          decimals,
          adapter: token.adapter,
          adapterName,
        };
      });

      // Calculate total from allocations
      const totalUSD = allocations.reduce((sum, a) => sum + parseFloat(a.balanceUSD), 0);

      return { allocations, totalAssetsUSD: totalUSD.toFixed(2) };
    } catch (error) {
      console.error('Error fetching vault token allocations:', error);
      return { allocations: [], totalAssetsUSD: '0' };
    }
  }

  async getAllMetrics(): Promise<ProtocolMetrics> {
    const latestBlock = await this.getLatestBlock();
    const fromBlock = START_BLOCK;

    // Fetch all events and prices in parallel
    const [
      swapEvents,
      mintEvents,
      burnedAmount,
      vaultCount,
      depositData,
      iouSupply,
      ethPrice,
      oraclePrices,
      rebalanceCount,
    ] = await Promise.all([
      this.getSwapEvents(fromBlock, latestBlock),
      this.getIOUMintEvents(fromBlock, latestBlock),
      this.getIOUBurnEvents(fromBlock, latestBlock),
      this.getVaultCreationEvents(fromBlock, latestBlock),
      this.getDepositEvents(fromBlock, latestBlock),
      this.getIOUTotalSupply(),
      this.getEthPrice(),
      this.getOraclePrices(),
      this.getRebalanceCount(),
    ]);

    // Fetch reserve balances and token allocations (needs oracle prices for USD conversion)
    const [reserveBalances, tokenAllocationData] = await Promise.all([
      this.getReserveBalances(oraclePrices),
      this.getVaultTokenAllocations(oraclePrices),
    ]);

    // Calculate total swap volume
    let totalSwapVolume = 0n;
    let totalIOUFromSwaps = 0n;
    const swapUsers = new Set<string>();

    for (const swap of swapEvents) {
      totalSwapVolume += swap.amountIn;
      totalIOUFromSwaps += swap.iouAmountOut;
      swapUsers.add(swap.receiver.toLowerCase());
    }

    // Calculate total IOU minted
    let totalIOUMinted = 0n;
    for (const mint of mintEvents) {
      totalIOUMinted += mint.amount;
    }

    // Calculate daily volumes
    const dailySwapMap = new Map<string, bigint>();
    const dailyMintMap = new Map<string, bigint>();

    for (const swap of swapEvents) {
      const date = new Date(swap.timestamp * 1000).toISOString().split('T')[0];
      dailySwapMap.set(date, (dailySwapMap.get(date) || 0n) + swap.amountIn);
    }

    for (const mint of mintEvents) {
      const date = new Date(mint.timestamp * 1000).toISOString().split('T')[0];
      dailyMintMap.set(date, (dailyMintMap.get(date) || 0n) + mint.amount);
    }

    const dailySwapVolume = Array.from(dailySwapMap.entries())
      .map(([date, volume]) => {
        const volumeEth = parseFloat(ethers.formatEther(volume));
        return {
          date,
          volumeUSD: (volumeEth * ethPrice).toFixed(2),
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    // IOU token uses 6 decimals
    const dailyIOUMinted = Array.from(dailyMintMap.entries())
      .map(([date, amount]) => ({ date, amount: ethers.formatUnits(amount, 6) }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Get current balances for the TVL composition chart (from token allocations)
    const tvlHistory: TVLDataPoint[] = [];
    const ghoAllocation = tokenAllocationData.allocations.find(a => a.symbol === 'GHO');
    const usdcAllocation = tokenAllocationData.allocations.find(a => a.symbol === 'USDC');

    if (ghoAllocation || usdcAllocation) {
      const today = new Date().toISOString().split('T')[0];
      const ghoUSD = parseFloat(ghoAllocation?.balanceUSD || '0');
      const usdcUSD = parseFloat(usdcAllocation?.balanceUSD || '0');
      tvlHistory.push({
        date: today,
        GHO: ghoUSD,
        USDC: usdcUSD,
        total: ghoUSD + usdcUSD,
      });
    }

    // Combine unique users
    const allUsers = new Set([...depositData.uniqueUsers, ...swapUsers]);

    // IOU token uses 6 decimals
    const IOU_DECIMALS = 6;

    // Convert all ETH values to USD
    const totalSwapVolumeEth = parseFloat(ethers.formatEther(totalSwapVolume));
    const protocolFeesEth = parseFloat(ethers.formatEther(totalIOUFromSwaps / 100n));

    // Use TVL from GraphQL which has accurate per-token balances
    const totalValueLockedUSD = tokenAllocationData.totalAssetsUSD;

    return {
      totalSwapVolumeUSD: (totalSwapVolumeEth * ethPrice).toFixed(2),
      totalIOUMinted: ethers.formatUnits(totalIOUMinted, IOU_DECIMALS),
      totalIOUBurned: ethers.formatUnits(burnedAmount, IOU_DECIMALS),
      rebalanceVolumeUSD: '0', // Will need to track rebalance tx separately
      totalValueLockedUSD,
      reserveBalances,
      tokenAllocations: tokenAllocationData.allocations,
      numberOfVaults: vaultCount,
      numberOfRebalances: rebalanceCount,
      activeUsers: allUsers.size,
      totalTransactions: swapEvents.length,
      iouOutstandingSupply: ethers.formatUnits(iouSupply, IOU_DECIMALS),
      protocolFeesUSD: (protocolFeesEth * ethPrice).toFixed(2),
      dailySwapVolume,
      dailyIOUMinted,
      tvlHistory,
      oraclePrices,
      ethPrice,
      lastBlock: latestBlock,
    };
  }
}

export const dataService = new DataService();
