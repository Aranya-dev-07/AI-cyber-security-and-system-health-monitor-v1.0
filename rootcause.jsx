import { useSystemStatus } from '../../context/SystemStatusContext'
import { Card, SectionHeader, fmt, fmtT, severityColor, severityBg, ConfidenceBar } from '../../components/ui'

export default function RootCause() {
  const { rca } = useSystemStatus()

  return (
    <Card>
      <SectionHeader title="AI Root Cause Analysis" subtitle="Explainable AI · why the anomaly happened" dot="var(--peach)"/>

      {!rca
        ? <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px 0', fontSize: 13 }}>No anomaly has been analyzed yet.</div>
        : <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
              <span style={{ background: severityBg(rca.severity), color: severityColor(rca.severity), borderRadius: 20, padding: '3px 12px', fontSize: 11, fontWeight: 700 }}>{rca.severity}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--peach-deep)' }}>{rca.root_cause}</span>
              <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>{fmtT(rca.timestamp)}</span>
            </div>

            <div className="grid-3" style={{ marginBottom: 14 }}>
              <div style={{ background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', padding: '12px 14px' }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6 }}>Primary Metric</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 600, color: 'var(--lavender-deep)' }}>{rca.primary_metric}</div>
              </div>
              <div style={{ background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', padding: '12px 14px' }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6 }}>Confidence</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 600, color: 'var(--mint-deep)', marginBottom: 6 }}>{fmt(rca.confidence)}%</div>
                <ConfidenceBar value={rca.confidence} color="var(--mint-deep)"/>
              </div>
              <div style={{ background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', padding: '12px 14px' }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6 }}>Responsible Process</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 600, color: 'var(--coral-deep)' }}>
                  {rca.responsible_process?.name ?? 'N/A'}
                  {rca.responsible_process?.pid >= 0 && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> · pid {rca.responsible_process.pid}</span>}
                </div>
              </div>
            </div>

            {rca.responsible_process && rca.responsible_process.name !== 'N/A' && (
              <div style={{ display: 'flex', gap: 16, marginBottom: 14, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
                <span>CPU: <b style={{ color: 'var(--text)' }}>{fmt(rca.responsible_process.cpu)}%</b></span>
                <span>Memory: <b style={{ color: 'var(--text)' }}>{fmt(rca.responsible_process.memory)}%</b></span>
                <span>Status: <b style={{ color: 'var(--text)' }}>{rca.responsible_process.status}</b></span>
              </div>
            )}

            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4 }}>AI Explanation</div>
              <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>{rca.explanation}</div>
            </div>

            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4 }}>Historical Comparison</div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5 }}>{rca.historical_comparison}</div>
            </div>

            <div style={{ background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', padding: '12px 14px', borderLeft: '3px solid var(--peach-deep)' }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--peach-deep)', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4 }}>Recommendation</div>
              <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>{rca.recommendation}</div>
            </div>
          </>
      }
    </Card>
  )
}