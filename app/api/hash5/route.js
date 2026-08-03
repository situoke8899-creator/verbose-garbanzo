import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const SOURCE_URLS = [
  'https://hx168.live/api/Game/GetGameListByDate?gameId=1',
  'https://hx168.live/api/Game/GetLong?gameId=1',
]

const MAX_HISTORY = 220
const TIMEOUT_MS = 12000

function getLastFiveDigits(hash) {
  const digits = []
  const text = String(hash || '')

  for (
    let index = text.length - 1;
    index >= 0 && digits.length < 5;
    index -= 1
  ) {
    const char = text[index]

    if (char >= '0' && char <= '9') {
      digits.push(char)
    }
  }

  if (digits.length < 5) return ''

  // 按“从哈希末尾开始往前数”的顺序保留，
  // 不再反转回原字符串方向。
  return digits.join('')
}

function classifyThree(value) {
  const digits = String(value || '')
    .split('')
    .map(Number)

  if (digits.length !== 3) return ''

  const unique = new Set(digits)

  if (unique.size === 1) return '豹子'
  if (unique.size === 2) return '对子'

  const sorted = [...digits].sort((a, b) => a - b)

  if (
    sorted[1] === sorted[0] + 1 &&
    sorted[2] === sorted[1] + 1
  ) {
    return '顺子'
  }

  const [a, b, c] = digits

  if (
    Math.abs(a - b) === 1 ||
    Math.abs(a - c) === 1 ||
    Math.abs(b - c) === 1
  ) {
    return '半顺'
  }

  return '杂六'
}

function normalizeItem(item) {
  if (!item) return null

  const hash = String(
    item.hash ||
    item.blockHash ||
    item.block_hash ||
    ''
  )

  const fiveDigits = getLastFiveDigits(hash)

  if (fiveDigits.length < 5) return null

  const block = String(
    item.block ||
    item.blockNumber ||
    item.height ||
    item.expect ||
    ''
  )

  if (!block) return null

  const front = fiveDigits.slice(0, 3)
  const middle = fiveDigits.slice(1, 4)
  const back = fiveDigits.slice(2, 5)

  return {
    block,
    openTime:
      item.time ||
      item.openTime ||
      item.createTime ||
      '',
    hash,
    fiveDigits,
    front,
    middle,
    back,
    frontShape: classifyThree(front),
    middleShape: classifyThree(middle),
    backShape: classifyThree(back),
  }
}

function extractList(json) {
  const candidates = [
    json?.data?.list,
    json?.data?.top100,
    json?.data,
    json?.list,
    json?.top100,
    json?.rows,
    json,
  ]

  for (const value of candidates) {
    if (Array.isArray(value)) {
      return value
    }
  }

  return []
}

function sortHistory(list) {
  return [...list].sort((a, b) => {
    const aa = BigInt(
      String(a.block).replace(/\D/g, '') || '0'
    )
    const bb = BigInt(
      String(b.block).replace(/\D/g, '') || '0'
    )

    if (aa !== bb) {
      return bb > aa ? 1 : -1
    }

    return (
      new Date(b.openTime || 0).getTime() -
      new Date(a.openTime || 0).getTime()
    )
  })
}

async function fetchJson(url) {
  const controller = new AbortController()
  const timer = setTimeout(
    () => controller.abort(),
    TIMEOUT_MS
  )

  try {
    const response = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        accept: 'application/json,text/plain,*/*',
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150 Safari/537.36',
      },
    })

    const text = await response.text()

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    if (!text || !text.trim()) {
      throw new Error('接口返回空内容')
    }

    if (text.trim().startsWith('<')) {
      throw new Error('接口返回网页而不是JSON')
    }

    return JSON.parse(text)
  } finally {
    clearTimeout(timer)
  }
}

async function getData() {
  const unique = new Map()
  const warnings = []
  let source = ''

  for (const url of SOURCE_URLS) {
    try {
      const json = await fetchJson(url)
      const list = extractList(json)

      for (const raw of list) {
        const row = normalizeItem(raw)

        if (row?.block) {
          unique.set(row.block, row)
        }
      }

      if (unique.size) {
        source = url
      }

      if (unique.size >= MAX_HISTORY) {
        break
      }
    } catch (error) {
      warnings.push(`${url}：${error.message}`)
    }
  }

  const history = sortHistory(
    [...unique.values()]
  ).slice(0, MAX_HISTORY)

  if (!history.length) {
    throw new Error(
      `没有获取到包含哈希的开奖记录${
        warnings.length
          ? `；${warnings.join('；')}`
          : ''
      }`
    )
  }

  const latest = history[0]

  let nextBlock = ''

  try {
    nextBlock = (
      BigInt(latest.block) + 20n
    ).toString()
  } catch {}

  return {
    ok: true,
    play: 'hash-last-five-shape',
    source,
    latest,
    nextBlock,
    history,
    historyCount: history.length,
    shapeTypes: [
      '豹子',
      '顺子',
      '对子',
      '杂六',
      '半顺',
    ],
    warnings,
    updatedAt: new Date().toISOString(),
  }
}

export async function GET() {
  try {
    return NextResponse.json(
      await getData(),
      {
        status: 200,
        headers: {
          'Cache-Control':
            'no-store, no-cache, must-revalidate, proxy-revalidate',
        },
      }
    )
  } catch (error) {
    console.error(
      '哈希最后5数字接口错误：',
      error
    )

    return NextResponse.json(
      {
        ok: false,
        message:
          error?.message ||
          '获取哈希数据失败',
      },
      {
        status: 500,
        headers: {
          'Cache-Control':
            'no-store, no-cache, must-revalidate, proxy-revalidate',
        },
      }
    )
  }
}
