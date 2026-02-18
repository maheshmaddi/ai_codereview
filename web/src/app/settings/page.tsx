import { GlobalSettingsForm } from '@/components/global-settings-form'

export default function SettingsPage() {
  return (
    <div>
      <h1 className="page-title">Global Settings</h1>
      <p className="muted">These settings apply to all projects</p>
      <GlobalSettingsForm />
    </div>
  )
}


