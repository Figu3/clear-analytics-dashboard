import { useEffect, useState } from 'react';
import { dataService } from './dataService';
import type { ProtocolMetrics } from './dataService';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import './App.css';

function AddressRow({ label, address }: { label: string; address: string }) {
  const copyToClipboard = () => {
    navigator.clipboard.writeText(address);
  };

  const shortAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;

  return (
    <div className="address-item">
      <span className="label">{label}:</span>
      <code>{shortAddress}</code>
      <button className="copy-btn" onClick={copyToClipboard} title="Copy address">
        📋
      </button>
    </div>
  );
}

function App() {
  const [metrics, setMetrics] = useState<ProtocolMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await dataService.getAllMetrics();
      setMetrics(data);
      setLastUpdate(new Date());
    } catch (err) {
      console.error('Error fetching metrics:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const formatNumber = (value: string) => {
    const num = parseFloat(value);
    if (num === 0) return '0';
    if (num < 0.01) return num.toExponential(2);
    if (num < 1) return num.toFixed(4);
    if (num < 1000) return num.toFixed(2);
    if (num < 1000000) return (num / 1000).toFixed(2) + 'K';
    return (num / 1000000).toFixed(2) + 'M';
  };

  const formatUSD = (value: string) => {
    const num = parseFloat(value);
    if (num === 0) return '$0';
    if (num < 1) return '$' + num.toFixed(2);
    if (num < 1000) return '$' + num.toFixed(2);
    if (num < 1000000) return '$' + (num / 1000).toFixed(2) + 'K';
    return '$' + (num / 1000000).toFixed(2) + 'M';
  };

  if (loading && !metrics) {
    return (
      <div className="app">
        <div className="loading">
          <div className="spinner"></div>
          <p>Loading Clear Protocol Analytics...</p>
        </div>
      </div>
    );
  }

  if (error && !metrics) {
    return (
      <div className="app">
        <div className="error">
          <h2>Error Loading Data</h2>
          <p>{error}</p>
          <button onClick={fetchData}>Retry</button>
        </div>
      </div>
    );
  }

  if (!metrics) return null;

  return (
    <div className="app">
      <header className="header">
        <h1>Clear Protocol Analytics</h1>
        <p className="subtitle">Arbitrum Sepolia Testnet</p>
        <div className="header-info">
          <span className="network-badge">Arbitrum Sepolia</span>
          {metrics.oraclePrices.map((oracle) => (
            <span
              key={oracle.asset}
              className="network-badge"
              style={{ background: oracle.symbol === 'GHO' ? '#5a2a5a' : '#2a5a2a' }}
            >
              {oracle.symbol}: ${oracle.price.toFixed(4)}
            </span>
          ))}
          {lastUpdate && (
            <span className="last-update">
              Last updated: {lastUpdate.toLocaleTimeString()}
            </span>
          )}
          <button onClick={fetchData} className="refresh-btn" disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </header>

      <main className="dashboard">
        <section className="metrics-grid">
          <div className="metric-card primary">
            <h3>Total Swap Volume</h3>
            <div className="metric-value">{formatUSD(metrics.totalSwapVolumeUSD)}</div>
            <div className="metric-unit">USD</div>
          </div>

          <div className="metric-card primary">
            <h3>IOU Minted</h3>
            <div className="metric-value">{formatNumber(metrics.totalIOUMinted)}</div>
            <div className="metric-unit">Tokens</div>
          </div>

          <div className="metric-card primary">
            <h3>IOU Burned</h3>
            <div className="metric-value">{formatNumber(metrics.totalIOUBurned)}</div>
            <div className="metric-unit">Tokens</div>
          </div>

          <div className="metric-card primary">
            <h3>Rebalance Volume</h3>
            <div className="metric-value">{formatUSD(metrics.rebalanceVolumeUSD)}</div>
            <div className="metric-unit">USD</div>
          </div>

          <div className="metric-card secondary">
            <h3>Total Value Locked</h3>
            <div className="metric-value">{formatUSD(metrics.totalValueLockedUSD)}</div>
            <div className="metric-unit">USD</div>
          </div>

          {metrics.reserveBalances.map((reserve) => (
            <div key={reserve.symbol} className="metric-card secondary">
              <h3>{reserve.symbol} Reserve</h3>
              <div className="metric-value">{formatNumber(reserve.balance)}</div>
              <div className="metric-unit">{formatUSD(reserve.balanceUSD)}</div>
            </div>
          ))}

          <div className="metric-card secondary">
            <h3>IOU Outstanding</h3>
            <div className="metric-value">{formatNumber(metrics.iouOutstandingSupply)}</div>
            <div className="metric-unit">Tokens</div>
          </div>

          <div className="metric-card secondary">
            <h3>Active Users</h3>
            <div className="metric-value">{metrics.activeUsers}</div>
            <div className="metric-unit">Addresses</div>
          </div>

          <div className="metric-card secondary">
            <h3>Total Transactions</h3>
            <div className="metric-value">{metrics.totalTransactions}</div>
            <div className="metric-unit">Swaps</div>
          </div>

          <div className="metric-card secondary">
            <h3>Vaults Created</h3>
            <div className="metric-value">{metrics.numberOfVaults}</div>
            <div className="metric-unit">Total</div>
          </div>

          <div className="metric-card secondary">
            <h3>Rebalances</h3>
            <div className="metric-value">{metrics.numberOfRebalances}</div>
            <div className="metric-unit">Total</div>
          </div>

          <div className="metric-card secondary">
            <h3>Protocol Fees</h3>
            <div className="metric-value">{formatUSD(metrics.protocolFeesUSD)}</div>
            <div className="metric-unit">USD (Est.)</div>
          </div>
        </section>

        <section className="charts-section">
          <div className="chart-card">
            <h3>Daily Swap Volume (USD)</h3>
            {metrics.dailySwapVolume.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={metrics.dailySwapVolume}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="date" stroke="#888" />
                  <YAxis stroke="#888" tickFormatter={(value) => '$' + value} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1a1a1a',
                      border: '1px solid #333',
                      borderRadius: '8px',
                    }}
                    formatter={(value: string) => ['$' + parseFloat(value).toLocaleString(), 'Volume']}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="volumeUSD"
                    stroke="#00ff88"
                    strokeWidth={2}
                    name="Volume (USD)"
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="no-data">No swap volume data yet</div>
            )}
          </div>

          <div className="chart-card">
            <h3>Daily IOU Minted</h3>
            {metrics.dailyIOUMinted.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={metrics.dailyIOUMinted}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="date" stroke="#888" />
                  <YAxis stroke="#888" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1a1a1a',
                      border: '1px solid #333',
                      borderRadius: '8px',
                    }}
                  />
                  <Legend />
                  <Bar dataKey="amount" fill="#00ccff" name="IOU Minted" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="no-data">No IOU minting data yet</div>
            )}
          </div>

          <div className="chart-card full-width">
            <h3>TVL Composition by Token (USD)</h3>
            {metrics.tvlHistory.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={metrics.tvlHistory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="date" stroke="#888" />
                  <YAxis stroke="#888" tickFormatter={(value) => '$' + value} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1a1a1a',
                      border: '1px solid #333',
                      borderRadius: '8px',
                    }}
                    formatter={(value: number) => ['$' + value.toLocaleString(), '']}
                  />
                  <Legend />
                  <Bar
                    dataKey="GHO"
                    stackId="1"
                    fill="#9966ff"
                    name="GHO (USD)"
                  />
                  <Bar
                    dataKey="USDC"
                    stackId="1"
                    fill="#2775ca"
                    name="USDC (USD)"
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="no-data">No TVL data yet</div>
            )}
          </div>
        </section>

        <section className="info-section">
          <div className="info-card">
            <h3>Contract Addresses</h3>
            <div className="address-list">
              <AddressRow label="Factory" address="0x6f73CCe0210Fe9e1B8c650739C06E8a400d09E68" />
              <AddressRow label="Swap" address="0x5B69f9D067077c3FBb22Bd732d2c34A9731fC162" />
              <AddressRow label="Vault" address="0x1CfB48224Ef579A11B98126151584EEcB0E47960" />
              <AddressRow label="IOU" address="0xb37d72c8022ac57c95b90ab3fbb21f9146fe6810" />
              <AddressRow label="GHO" address="0x69cAC783c212Bfae06E3c1A9a2E6Ae6b17bA0614" />
              <AddressRow label="USDC" address="0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d" />
            </div>
          </div>

          <div className="info-card">
            <h3>Key Metrics Explained</h3>
            <ul className="metrics-explanation">
              <li>
                <strong>Total Swap Volume:</strong> Cumulative value of all token swaps executed
                through the protocol
              </li>
              <li>
                <strong>IOU Minted:</strong> Total IOU tokens created during liquidity swaps
              </li>
              <li>
                <strong>IOU Burned:</strong> IOU tokens redeemed when users unwrap their positions
              </li>
              <li>
                <strong>IOU Outstanding:</strong> Current supply of IOU tokens in circulation
              </li>
              <li>
                <strong>Rebalance Volume:</strong> Total value moved during vault rebalancing
                operations
              </li>
            </ul>
          </div>
        </section>

        <footer className="footer">
          <p>
            Last synced at block: <strong>{metrics.lastBlock.toLocaleString()}</strong>
          </p>
          <p className="disclaimer">
            This is a testnet deployment. All values are for testing purposes only.
          </p>
        </footer>

      </main>
    </div>
  );
}

export default App;
