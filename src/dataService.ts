import { ethers } from 'ethers';
import { CONTRACTS, RPC_URL, ABIS, START_BLOCK } from './contracts';

export interface OraclePrice {
  asset: string;
  price: number;
  decimals: number;
  symbol: string;
}

export interface ProtocolMetrics {
  // Primary Metrics (all in USD)
  totalSwapVolumeUSD: string;
  totalIOUMinted: string;
  totalIOUBurned: string;
  rebalanceVolumeUSD: string;

  // Additional Metrics
  totalValueLockedUSD: string;
  numberOfVaults: number;
  activeUsers: number;
  totalTransactions: number;
  iouOutstandingSupply: string;
  protocolFeesUSD: string;

  // Time series data
  dailySwapVolume: { date: string; volumeUSD: string }[];
  dailyIOUMinted: { date: string; amount: string }[];

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
      ethPrice,
      oraclePrices,
    ] = await Promise.all([
      this.getSwapEvents(fromBlock, latestBlock),
      this.getIOUMintEvents(fromBlock, latestBlock),
      this.getIOUBurnEvents(fromBlock, latestBlock),
      this.getVaultCreationEvents(fromBlock, latestBlock),
      this.getDepositEvents(fromBlock, latestBlock),
      this.getIOUTotalSupply(),
      this.getEthPrice(),
      this.getOraclePrices(),
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

    // Combine unique users
    const allUsers = new Set([...depositData.uniqueUsers, ...swapUsers]);

    // IOU token uses 6 decimals
    const IOU_DECIMALS = 6;

    // Convert all ETH values to USD
    const totalSwapVolumeEth = parseFloat(ethers.formatEther(totalSwapVolume));
    const totalValueLockedEth = parseFloat(ethers.formatEther(depositData.totalDeposits));
    const protocolFeesEth = parseFloat(ethers.formatEther(totalIOUFromSwaps / 100n));

    return {
      totalSwapVolumeUSD: (totalSwapVolumeEth * ethPrice).toFixed(2),
      totalIOUMinted: ethers.formatUnits(totalIOUMinted, IOU_DECIMALS),
      totalIOUBurned: ethers.formatUnits(burnedAmount, IOU_DECIMALS),
      rebalanceVolumeUSD: '0', // Will need to track rebalance tx separately
      totalValueLockedUSD: (totalValueLockedEth * ethPrice).toFixed(2),
      numberOfVaults: vaultCount,
      activeUsers: allUsers.size,
      totalTransactions: swapEvents.length,
      iouOutstandingSupply: ethers.formatUnits(iouSupply, IOU_DECIMALS),
      protocolFeesUSD: (protocolFeesEth * ethPrice).toFixed(2),
      dailySwapVolume,
      dailyIOUMinted,
      oraclePrices,
      ethPrice,
      lastBlock: latestBlock,
    };
  }
}

export const dataService = new DataService();
