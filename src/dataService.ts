import { ethers } from 'ethers';
import { CONTRACTS, RPC_URL, ABIS, START_BLOCK } from './contracts';

export interface OraclePrice {
  asset: string;
  price: number;
  decimals: number;
  symbol: string;
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

export interface ProtocolMetrics {
  // Primary Metrics (all in USD)
  totalSwapVolumeUSD: string;
  totalIOUMinted: string;
  totalIOUBurned: string;
  rebalanceVolumeUSD: string;

  // Additional Metrics
  totalValueLockedUSD: string;
  reserveBalances: ReserveBalance[];
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
      vaultTotalAssets,
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
      this.getVaultTotalAssets(),
      this.getEthPrice(),
      this.getOraclePrices(),
      this.getRebalanceCount(),
    ]);

    // Fetch reserve balances (needs oracle prices for USD conversion)
    const reserveBalances = await this.getReserveBalances(oraclePrices);

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

    // Build TVL history from swap events
    // Track cumulative token balances by date
    const GHO_ADDRESS = CONTRACTS.MockGHO.toLowerCase();
    const USDC_ADDRESS = '0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d';
    const usdcOracle = oraclePrices.find(o => o.symbol === 'USDC');
    const usdcPrice = usdcOracle?.price || 1;

    // Sort swaps by timestamp
    const sortedSwaps = [...swapEvents].sort((a, b) => a.timestamp - b.timestamp);

    // Track cumulative balances
    let cumulativeGHO = 0n;
    let cumulativeUSDC = 0n;
    const dailyTVLMap = new Map<string, { gho: bigint; usdc: bigint }>();

    for (const swap of sortedSwaps) {
      const date = new Date(swap.timestamp * 1000).toISOString().split('T')[0];

      // amountIn goes INTO the vault (from token)
      // tokenAmountOut goes OUT of the vault (to token)
      if (swap.from.toLowerCase() === GHO_ADDRESS) {
        cumulativeGHO += swap.amountIn;
      } else if (swap.from.toLowerCase() === USDC_ADDRESS) {
        cumulativeUSDC += swap.amountIn;
      }

      if (swap.to.toLowerCase() === GHO_ADDRESS) {
        cumulativeGHO -= swap.tokenAmountOut;
      } else if (swap.to.toLowerCase() === USDC_ADDRESS) {
        cumulativeUSDC -= swap.tokenAmountOut;
      }

      dailyTVLMap.set(date, { gho: cumulativeGHO, usdc: cumulativeUSDC });
    }

    const tvlHistory: TVLDataPoint[] = Array.from(dailyTVLMap.entries())
      .map(([date, balances]) => {
        const ghoAmount = parseFloat(ethers.formatEther(balances.gho));
        const usdcAmount = parseFloat(ethers.formatUnits(balances.usdc, 6));
        const ghoUSD = ghoAmount * ghoPrice;
        const usdcUSD = usdcAmount * usdcPrice;
        return {
          date,
          GHO: Math.round(ghoUSD * 100) / 100,
          USDC: Math.round(usdcUSD * 100) / 100,
          total: Math.round((ghoUSD + usdcUSD) * 100) / 100,
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    // Combine unique users
    const allUsers = new Set([...depositData.uniqueUsers, ...swapUsers]);

    // IOU token uses 6 decimals
    const IOU_DECIMALS = 6;

    // Convert all ETH values to USD
    const totalSwapVolumeEth = parseFloat(ethers.formatEther(totalSwapVolume));
    const protocolFeesEth = parseFloat(ethers.formatEther(totalIOUFromSwaps / 100n));

    // Calculate TVL from vault totalAssets (in GHO, 18 decimals)
    // Use GHO oracle price for conversion
    const ghoOracle = oraclePrices.find(o => o.symbol === 'GHO');
    const ghoPrice = ghoOracle?.price || 1;
    const totalAssetsFormatted = parseFloat(ethers.formatEther(vaultTotalAssets));
    const totalValueLockedUSD = (totalAssetsFormatted * ghoPrice).toFixed(2);

    return {
      totalSwapVolumeUSD: (totalSwapVolumeEth * ethPrice).toFixed(2),
      totalIOUMinted: ethers.formatUnits(totalIOUMinted, IOU_DECIMALS),
      totalIOUBurned: ethers.formatUnits(burnedAmount, IOU_DECIMALS),
      rebalanceVolumeUSD: '0', // Will need to track rebalance tx separately
      totalValueLockedUSD,
      reserveBalances,
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
