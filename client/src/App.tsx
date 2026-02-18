import JobsPage from './pages/JobsPage';

export default function App() {
  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '20px 24px' }}>
      <header style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>Web3 Job Board</h1>
        <span style={{ color: '#8b949e', fontSize: 14 }}>Scrape, score, apply</span>
      </header>
      <JobsPage />
    </div>
  );
}
