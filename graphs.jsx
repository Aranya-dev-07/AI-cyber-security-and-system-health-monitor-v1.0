import { useSystemStatus } from '../../context/SystemStatusContext'
import { AreaChartCard } from '../../components/charts'

export default function Graphs() {
  const { history } = useSystemStatus()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <AreaChartCard
        title="CPU & RAM" subtitle="Usage over time · hover for exact values" dot="var(--mint)"
        data={history}
        lines={[
          { key: 'cpu', name: 'CPU %', color: 'var(--mint-deep)' },
          { key: 'ram', name: 'RAM %', color: 'var(--lavender-deep)' },
        ]}
      />
      <div className="grid-2">
        <AreaChartCard title="Disk" subtitle="Usage over time" dot="var(--peach)" data={history} lines={[{ key: 'disk', name: 'Disk %', color: 'var(--peach-deep)' }]}/>
        <AreaChartCard title="Network" subtitle="MB per poll interval" dot="var(--sage)" data={history} lines={[{ key: 'net', name: 'Net MB', color: 'var(--olive-deep)' }]}/>
      </div>
      {history.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: '8px 0' }}>
          No history yet — charts populate once monitoring has been running for a few cycles.
        </div>
      )}
    </div>
  )
}