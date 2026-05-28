import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { dataset, locations } = req.query

  if (!dataset || !locations) {
    return res.status(400).json({ error: 'Missing dataset or locations' })
  }

  const upstream = `https://api.opentopodata.org/v1/${dataset}?locations=${encodeURIComponent(locations as string)}`

  try {
    const response = await fetch(upstream)
    const data = await response.json()
    res.status(response.status).json(data)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch elevation data', detail: String(err) })
  }
}
