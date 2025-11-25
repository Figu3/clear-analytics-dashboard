import { ethers } from 'ethers';
import { CONTRACTS, RPC_URL, ABIS, START_BLOCK } from './contracts';

export interface ProtocolMetrics {
  // Primary Metrics
  totalSwapVolume: string;
  totalIOUMinted: string;
  totalIOUBurned: string;
  rebalanceVolume: string;

  // Additional Metrics
  totalValueLocked: string;
  numberOfVaults: number;
  activeUsers: number;
  iouOutstandingSupply: string;
  protocolFeesCollected: string;

  // Time series data
  dailySwapVolume: { date: string; volume: string }[];
  dailyIOUMinted: { date: string; amount: string }[];

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
  private swapContract: ethers.Contract;

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

    this.swapContract = new ethers.Contract(
      CONTRACTS.ClearSwap,
      ABIS.ClearSwap,
      this.provider
    );
  }

  async getLatestBlock(): Promise<number> {
    return await this.provider.getBlockNumber();
  }

  async getSwapEvents(fromBlock: number, toBlock: number): Promise<SwapEvent[]> {
    const filter = this.swapContract.filters.LiquiditySwapExecuted();
    const events = await this.swapContract.queryFilter(filter, fromBlock, toBlock);

    const swapEvents: SwapEvent[] = [];

    for (const event of events) {
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
  }

  async getIOUMintEvents(fromBlock: number, toBlock: number): Promise<IOUMintEvent[]> {
    const filter = this.iouContract.filters.ClearIOUMinted();
    const events = await this.iouContract.queryFilter(filter, fromBlock, toBlock);

    const mintEvents: IOUMintEvent[] = [];

    for (const event of events) {
      const block = await event.getBlock();
      const args = event.args;

      mintEvents.push({
        to: args.to,
        amount: args.amount,
        blockNumber: event.blockNumber,
        timestamp: block.timestamp,
        txHash: event.transactionHash,
      });
    }

    return mintEvents;
  }

  async getIOUBurnEvents(fromBlock: number, toBlock: number) {
    const filter = this.iouContract.filters.ClearIOUBurned();
    const events = await this.iouContract.queryFilter(filter, fromBlock, toBlock);

    let totalBurned = 0n;

    for (const event of events) {
      const args = event.args;
      totalBurned += args.amount;
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

  async getAllMetrics(): Promise<ProtocolMetrics> {
    console.log('Fetching protocol metrics...');

    const latestBlock = await this.getLatestBlock();
    const fromBlock = Math.max(START_BLOCK, latestBlock - 100000); // Last ~100k blocks for faster testing

    console.log(`Fetching events from block ${fromBlock} to ${latestBlock}`);

    // Fetch all events in parallel
    const [
      swapEvents,
      mintEvents,
      burnedAmount,
      vaultCount,
      depositData,
      iouSupply,
    ] = await Promise.all([
      this.getSwapEvents(fromBlock, latestBlock),
      this.getIOUMintEvents(fromBlock, latestBlock),
      this.getIOUBurnEvents(fromBlock, latestBlock),
      this.getVaultCreationEvents(fromBlock, latestBlock),
      this.getDepositEvents(fromBlock, latestBlock),
      this.getIOUTotalSupply(),
    ]);

    console.log(`Found ${swapEvents.length} swap events, ${mintEvents.length} mint events`);

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
      .map(([date, volume]) => ({ date, volume: ethers.formatEther(volume) }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const dailyIOUMinted = Array.from(dailyMintMap.entries())
      .map(([date, amount]) => ({ date, amount: ethers.formatEther(amount) }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Combine unique users
    const allUsers = new Set([...depositData.uniqueUsers, ...swapUsers]);

    return {
      totalSwapVolume: ethers.formatEther(totalSwapVolume),
      totalIOUMinted: ethers.formatEther(totalIOUMinted),
      totalIOUBurned: ethers.formatEther(burnedAmount),
      rebalanceVolume: '0', // Will need to track rebalance tx separately
      totalValueLocked: ethers.formatEther(depositData.totalDeposits),
      numberOfVaults: vaultCount,
      activeUsers: allUsers.size,
      iouOutstandingSupply: ethers.formatEther(iouSupply),
      protocolFeesCollected: ethers.formatEther(totalIOUFromSwaps / 100n), // Estimate ~1% fee
      dailySwapVolume,
      dailyIOUMinted,
      lastBlock: latestBlock,
    };
  }
}

export const dataService = new DataService();
