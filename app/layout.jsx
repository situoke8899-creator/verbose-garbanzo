export const metadata = {
  title: '哈希倒数5个数字｜单段优选形态系统',
  description: '提取哈希最后5个数字，从哈希末尾向左取5个数字，只推荐独立中奖率最高的一段',
}

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  )
}
