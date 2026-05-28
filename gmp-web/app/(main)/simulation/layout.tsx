import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '实训仿真 | GMP 助学平台',
  description: '通过角色剧情与风险决策体验 GMP 质量管理实训。',
}

export default function SimulationLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children
}
