import { useEffect, useState } from 'react';
import { dataService } from './dataService';
import type { ProtocolMetrics, VaultTokenAllocation, RouteStatusMetrics, RouteOpenEvent } from './dataService';
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

type TabType = 'overview' | 'route-status';

function App() {
  const [metrics, setMetrics] = useState<ProtocolMetrics | null>(null);
  const [routeStatus, setRouteStatus] = useState<RouteStatusMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await dataService.getAllMetrics();
      setMetrics(data);

      // Fetch route status metrics
      const routeMetrics = await dataService.getRouteStatusMetrics(data.oraclePrices);
      setRouteStatus(routeMetrics);

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

  const formatDuration = (ms: number | null): string => {
    if (ms === null) return 'Ongoing';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
    if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  const formatDateTime = (timestamp: number): string => {
    return new Date(timestamp).toLocaleString();
  };

  const clearRouteHistory = () => {
    localStorage.removeItem('clear_route_events');
    fetchData(); // Refresh to update the display
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

      <nav className="tab-navigation">
        <button
          className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          className={`tab-btn ${activeTab === 'route-status' ? 'active' : ''}`}
          onClick={() => setActiveTab('route-status')}
        >
          Route Status
          {routeStatus?.anyRouteOpen && <span className="route-open-indicator" />}
        </button>
      </nav>

      <main className="dashboard">
        {activeTab === 'overview' && (
          <>
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

        <section className="allocation-section">
          <div className="allocation-card">
            <h3>Liquidity Allocation</h3>
            <p className="allocation-subtitle">Where vault assets are invested</p>
            {metrics.tokenAllocations.length > 0 ? (
              <table className="allocation-table">
                <thead>
                  <tr>
                    <th>Token</th>
                    <th>Balance</th>
                    <th>Value (USD)</th>
                    <th>Location</th>
                    <th>Adapter</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.tokenAllocations.map((allocation: VaultTokenAllocation) => (
                    <tr key={allocation.address}>
                      <td className="token-cell">
                        <span className="token-symbol">{allocation.symbol}</span>
                        <span className="token-name">{allocation.name}</span>
                      </td>
                      <td className="balance-cell">{allocation.balance}</td>
                      <td className="usd-cell">${allocation.balanceUSD}</td>
                      <td className="location-cell">
                        <span className={`location-badge ${allocation.adapterName.includes('Aave') ? 'aave' : 'vault'}`}>
                          {allocation.adapterName}
                        </span>
                      </td>
                      <td className="adapter-cell">
                        {allocation.adapter !== '0x0000000000000000000000000000000000000000' ? (
                          <code>{allocation.adapter.slice(0, 6)}...{allocation.adapter.slice(-4)}</code>
                        ) : (
                          <span className="no-adapter">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={2}><strong>Total TVL</strong></td>
                    <td className="usd-cell"><strong>${metrics.totalValueLockedUSD}</strong></td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>
            ) : (
              <div className="no-data">No allocation data available</div>
            )}
          </div>
        </section>

        <section className="info-section">
          <div className="info-card">
            <h3>Contract Addresses</h3>
            <div className="address-list">
              <AddressRow label="Factory" address="0x514Ed620137c62484F426128317e5AA86edd7475" />
              <AddressRow label="Swap" address="0x5144E17c86d6e1B25F61a036024a65bC4775E37e" />
              <AddressRow label="Vault" address="0xCaC0fa2818AeD2EeA8B9f52CA411E6eC3e13d822" />
              <AddressRow label="IOU" address="0x3bA352df84613877fc30AcC0303d1b5C9CF7Da4d" />
              <AddressRow label="Oracle" address="0x716A0b9E20Bd10b82840733De144fAb69bbAEda3" />
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
          </>
        )}

        {activeTab === 'route-status' && routeStatus && (
          <>
            {/* Current Route Status */}
            <section className="route-status-section">
              <div className="route-status-header">
                <h2>Current Route Status</h2>
                <div className={`overall-status ${routeStatus.anyRouteOpen ? 'open' : 'closed'}`}>
                  {routeStatus.anyRouteOpen ? 'ROUTES OPEN' : 'ALL ROUTES CLOSED'}
                </div>
              </div>

              <div className="route-cards">
                {routeStatus.routes.map((route) => (
                  <div
                    key={`${route.fromAsset}-${route.toAsset}`}
                    className={`route-card ${route.isOpen ? 'open' : 'closed'}`}
                  >
                    <div className="route-direction">
                      <span className="token from">{route.fromSymbol}</span>
                      <span className="arrow">→</span>
                      <span className="token to">{route.toSymbol}</span>
                    </div>
                    <div className="route-status-badge">
                      {route.isOpen ? 'OPEN' : 'CLOSED'}
                    </div>
                    <div className="route-details">
                      <div className="detail-row">
                        <span className="label">Depeg:</span>
                        <span className={`value ${route.depegPercentage > route.threshold ? 'depegged' : ''}`}>
                          {route.depegPercentage.toFixed(4)}%
                        </span>
                      </div>
                      <div className="detail-row">
                        <span className="label">Threshold:</span>
                        <span className="value">{route.threshold.toFixed(2)}%</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Route Statistics */}
            <section className="route-stats-section">
              <h2>Route Statistics</h2>
              <div className="stats-grid">
                <div className="stat-card">
                  <h3>Times Opened</h3>
                  <div className="stat-value">{routeStatus.totalTimesOpened}</div>
                  <div className="stat-unit">Events</div>
                </div>
                <div className="stat-card">
                  <h3>Average Open Duration</h3>
                  <div className="stat-value">
                    {routeStatus.averageOpenDurationMs !== null
                      ? formatDuration(routeStatus.averageOpenDurationMs)
                      : 'N/A'}
                  </div>
                  <div className="stat-unit">Per Event</div>
                </div>
                <div className="stat-card">
                  <h3>Total Open Duration</h3>
                  <div className="stat-value">
                    {formatDuration(routeStatus.totalOpenDurationMs)}
                  </div>
                  <div className="stat-unit">Cumulative</div>
                </div>
                <div className="stat-card">
                  <h3>Depeg Threshold</h3>
                  <div className="stat-value">{((10000 - routeStatus.depegThreshold) / 100).toFixed(2)}%</div>
                  <div className="stat-unit">From Contract</div>
                </div>
              </div>
            </section>

            {/* Route History */}
            <section className="route-history-section">
              <div className="history-header">
                <h2>Route Open History</h2>
                <button onClick={clearRouteHistory} className="clear-history-btn">
                  Clear History
                </button>
              </div>
              {routeStatus.routeOpenEvents.length > 0 ? (
                <table className="history-table">
                  <thead>
                    <tr>
                      <th>Route</th>
                      <th>Opened At</th>
                      <th>Closed At</th>
                      <th>Duration</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {routeStatus.routeOpenEvents
                      .sort((a: RouteOpenEvent, b: RouteOpenEvent) => b.openedAt - a.openedAt)
                      .map((event: RouteOpenEvent) => (
                        <tr key={event.id} className={event.closedAt === null ? 'ongoing' : ''}>
                          <td className="route-cell">{event.route}</td>
                          <td>{formatDateTime(event.openedAt)}</td>
                          <td>{event.closedAt ? formatDateTime(event.closedAt) : '-'}</td>
                          <td className="duration-cell">{formatDuration(event.durationMs)}</td>
                          <td>
                            <span className={`status-badge ${event.closedAt === null ? 'open' : 'closed'}`}>
                              {event.closedAt === null ? 'OPEN' : 'CLOSED'}
                            </span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              ) : (
                <div className="no-data">
                  No route open events recorded yet. The dashboard tracks route status changes in real-time.
                </div>
              )}
              <p className="history-note">
                Route history is tracked locally in your browser and persists across sessions.
                Routes open when a token depegs by more than {((10000 - routeStatus.depegThreshold) / 100).toFixed(2)}% relative to another token.
              </p>
            </section>
          </>
        )}

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
