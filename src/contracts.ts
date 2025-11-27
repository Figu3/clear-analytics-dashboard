// Clear Protocol Contract Configuration - Arbitrum Sepolia

export const CONTRACTS = {
  ClearFactory: '0x514Ed620137c62484F426128317e5AA86edd7475',
  ClearVault: '0x343EfFc28C20821a65115a17032aCA7CA43F6102',
  ClearIOU: '0x3bA352df84613877fc30AcC0303d1b5C9CF7Da4d',
  ClearSwap: '0x5144E17c86d6e1B25F61a036024a65bC4775E37e',
  ClearOracle: '0x716A0b9E20Bd10b82840733De144fAb69bbAEda3',
  ClearAccessManager: '0x2101BC8FaF1D12bEdc3a73e73BE418a8c3b18E1B',
  // Tokens (unchanged)
  MockGHO: '0x69cAC783c212Bfae06E3c1A9a2E6Ae6b17bA0614',
} as const;

export const RPC_URL = 'https://sepolia-rollup.arbitrum.io/rpc';
export const CHAIN_ID = 421614; // Arbitrum Sepolia

// Key ABIs for event listening
export const ABIS = {
  ClearFactory: [
    'event NewClearVault(address indexed vault, address indexed owner)',
    'function rebalance(address vault, address tokenFrom, address tokenTo, uint256 amount) external',
  ],
  ClearVault: [
    'event Deposit(address indexed sender, address indexed owner, uint256 assets, uint256 shares)',
    'event Withdraw(address indexed sender, address indexed receiver, address indexed owner, uint256 assets, uint256 shares)',
    'event LiquiditySwapExecuted(address indexed from, address indexed to, address receiver, uint256 amountIn, uint256 tokenAmountOut, uint256 iouAmountOut)',
    'function totalAssets() external view returns (uint256)',
    'function balanceOf(address account) external view returns (uint256)',
  ],
  ClearIOU: [
    'event ClearIOUMinted(address indexed to, uint256 amount)',
    'event ClearIOUBurned(address indexed from, uint256 amount)',
    'event ClearIOUWrapped(address indexed from, uint256 amount)',
    'event ClearIOUUnwraped(address indexed to, uint256 amount)',
    'event Transfer(address indexed from, address indexed to, uint256 value)',
    'function totalSupply() external view returns (uint256)',
    'function decimals() external view returns (uint8)',
    'function symbol() external view returns (string)',
  ],
  ClearSwap: [
    'event LiquiditySwapExecuted(address indexed from, address indexed to, address receiver, uint256 amountIn, uint256 tokenAmountOut, uint256 iouAmountOut)',
  ],
};

// Block number to start fetching events from (deployment block or earlier)
export const START_BLOCK = 100000000; // Start from recent blocks for faster queries
