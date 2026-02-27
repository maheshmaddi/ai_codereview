import { GlobalSettingsForm } from '@/components/global-settings-form'
import { Settings } from 'lucide-react'

export default function SettingsPage() {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Settings size={28} style={{ color: '#60a5fa' }} />
        <div>
          <h1 className="page-title">Global Settings</h1>
          <p className="muted">These settings apply to all projects</p>
        </div>
      </div>
      <GlobalSettingsForm />
    </div>
  )
}



