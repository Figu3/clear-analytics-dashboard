// Clear Protocol Contract Configuration - Arbitrum Sepolia

export const CONTRACTS = {
  ClearFactory: '0x6f73CCe0210Fe9e1B8c650739C06E8a400d09E68',
  ClearVault: '0x1CfB48224Ef579A11B98126151584EEcB0E47960', // Deployed vault instance (was implementation)
  ClearVaultImplementation: '0xD842772F0a6cB1276628f2C810f41B2893B717C4', // Implementation contract
  ClearIOU: '0x54E2F1eF78F386c7CBC5E353A4d49F353CBFca23',
  ClearSwap: '0x5B69f9D067077c3FBb22Bd732d2c34A9731fC162',
  ClearOracle: '0x50c2584E2f32533e9307df9eE0Beb229fC20f517',
  ClearAccessManager: '0x3C2Fd22Ad486293e1F59dA6e42B28EC8DC1D63C7',
  ClearAaveV3Adapter: '0xc5f7791Fe50992fa0E42695593F858c395773E63',
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
